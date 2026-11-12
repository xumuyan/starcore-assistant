#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod model;
use model::{ControlMode, Demo, Page, Snapshot};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TEST_HOTKEY: &str = "CommandOrControl+Shift+F8";
struct Probe(Mutex<Snapshot>);
type Result<T> = std::result::Result<T, String>;

fn snapshot(app: &tauri::AppHandle) -> Result<Snapshot> {
    app.state::<Probe>()
        .0
        .lock()
        .map(|s| s.clone())
        .map_err(|_| "probe state unavailable".into())
}
fn emit(app: &tauri::AppHandle) -> Result<()> {
    app.emit("probe-state", snapshot(app)?)
        .map_err(|e| e.to_string())
}
fn hide_overlay(app: &tauri::AppHandle) -> Result<()> {
    app.state::<Probe>()
        .0
        .lock()
        .map_err(|_| "probe state unavailable")?
        .hide();
    // Release Escape before hiding: never swallow it when no overlay is shown.
    if app.global_shortcut().is_registered("Escape") {
        app.global_shortcut()
            .unregister("Escape")
            .map_err(|e| e.to_string())?;
    }
    if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    emit(app)
}
fn demo(app: &tauri::AppHandle, value: Demo) -> Result<()> {
    if !app.global_shortcut().is_registered("Escape") {
        app.global_shortcut()
            .register("Escape")
            .map_err(|e| e.to_string())?;
    }
    app.state::<Probe>()
        .0
        .lock()
        .map_err(|_| "probe state unavailable")?
        .demo = Some(value);
    emit(app)?;
    let window = app
        .get_webview_window("overlay")
        .ok_or("overlay unavailable")?;
    if let Err(error) = window.show() {
        let _ = hide_overlay(app);
        return Err(error.to_string());
    }
    // Deliberately no set_focus here: the overlay must not steal the user's input.
    Ok(())
}
#[tauri::command]
fn probe_snapshot(app: tauri::AppHandle) -> Result<Snapshot> {
    snapshot(&app)
}
#[tauri::command]
fn probe_open(app: tauri::AppHandle, page: Page) -> Result<()> {
    if let Some(chooser) = app.get_webview_window("chooser") {
        chooser.hide().map_err(|e| e.to_string())?;
    }
    let window = app
        .get_webview_window(page.label())
        .ok_or("page unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn probe_demo(app: tauri::AppHandle, value: Demo) -> Result<()> {
    demo(&app, value)
}
#[tauri::command]
fn probe_hide(app: tauri::AppHandle) -> Result<()> {
    hide_overlay(&app)
}
#[tauri::command]
fn probe_hotkey(app: tauri::AppHandle, enabled: bool, state: State<'_, Probe>) -> Result<()> {
    let manager = app.global_shortcut();
    if enabled && !manager.is_registered(TEST_HOTKEY) {
        manager.register(TEST_HOTKEY).map_err(|e| e.to_string())?;
    } else if !enabled && manager.is_registered(TEST_HOTKEY) {
        manager.unregister(TEST_HOTKEY).map_err(|e| e.to_string())?;
    }
    state
        .0
        .lock()
        .map_err(|_| "probe state unavailable")?
        .hotkey_enabled = enabled;
    emit(&app)
}
#[tauri::command]
fn probe_quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn window(
    app: &tauri::AppHandle,
    label: &str,
    width: f64,
    height: f64,
    overlay: bool,
) -> tauri::Result<()> {
    let standard = app.state::<ControlMode>().standard_window(overlay);
    let window = tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App(format!("index.html?view={label}").into()),
    )
    .title(if standard {
        format!("MOSS T0 · {label} · diagnostic")
    } else {
        format!("MOSS T0 · {label}")
    })
    // Extra diagnostic title-bar space is not part of the production layout.
    .inner_size(width, height + if standard { 40.0 } else { 0.0 })
    .center()
    .visible(false)
    .focused(false)
    .focusable(!overlay)
    .decorations(standard)
    .transparent(!standard)
    .always_on_top(!standard)
    .skip_taskbar(!standard)
    .shadow(standard)
    .resizable(false)
    .visible_on_all_workspaces(true)
    .build()?;
    if overlay {
        window.set_ignore_cursor_events(true)?;
    }
    Ok(())
}
fn main() {
    let controls = ControlMode::from_args(std::env::args());
    tauri::Builder::default()
        .manage(controls)
        .manage(Probe(Mutex::new(Snapshot::default())))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let result = if shortcut.key == tauri_plugin_global_shortcut::Code::Escape {
                        hide_overlay(app)
                    } else {
                        snapshot(app).and_then(|s| {
                            if s.demo.is_some() {
                                hide_overlay(app)
                            } else {
                                demo(app, Demo::Listening)
                            }
                        })
                    };
                    if result.is_err() {
                        eprintln!("T0 hotkey action failed; no user data involved");
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            probe_snapshot,
            probe_open,
            probe_demo,
            probe_hide,
            probe_hotkey,
            probe_quit
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(if controls.diagnostic {
                tauri::ActivationPolicy::Regular
            } else {
                tauri::ActivationPolicy::Accessory
            });
            window(app.handle(), "chooser", 280.0, 100.0, false)?;
            window(app.handle(), "history", 540.0, 260.0, false)?;
            window(app.handle(), "settings", 600.0, 420.0, false)?;
            window(app.handle(), "overlay", 620.0, 440.0, true)?;
            // Small original monochrome icon; no external image or resource access.
            let mut rgba = vec![0u8; 20 * 20 * 4];
            for y in 3..17 {
                for x in 3..17 {
                    if x == 3 || x == 16 || y == 3 || y == 16 || (x == y) {
                        let offset = (y * 20 + x) * 4;
                        rgba[offset..offset + 4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
            tauri::tray::TrayIconBuilder::with_id("moss-t0")
                .icon(tauri::image::Image::new_owned(rgba, 20, 20))
                .icon_as_template(true)
                .tooltip("MOSS T0 验证壳（未录音）")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(chooser) = tray.app_handle().get_webview_window("chooser") {
                            if chooser.is_visible().unwrap_or(false) {
                                let _ = chooser.hide();
                            } else {
                                let _ = chooser.show();
                                let _ = chooser.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            // Explicit development entry only; normal startup stays invisible.
            if controls.diagnostic || std::env::args().any(|arg| arg == "--show-chooser") {
                if let Some(chooser) = app.get_webview_window("chooser") {
                    chooser.show()?;
                    chooser.set_focus()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("isolated T0 probe failed to start");
}
