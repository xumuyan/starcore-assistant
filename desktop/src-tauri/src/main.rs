#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod check;
mod model;
use model::{ControlMode, Demo, Page, Snapshot};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TEST_HOTKEY: &str = "CommandOrControl+Shift+F8";
struct Probe(Mutex<Snapshot>);
type Result<T> = std::result::Result<T, String>;

/// TrayIcon is reference-counted and its icon disappears when the last handle
/// drops; keep one handle alive for the whole app lifetime.
struct TrayKeepAlive(tauri::tray::TrayIcon<tauri::Wry>);

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
/// Production "open page" path shared by the IPC command and the diagnostic
/// `--show-page` flag: collapse the entry bar, then surface and focus the page.
fn open_page(app: &tauri::AppHandle, page: Page) -> Result<()> {
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
fn probe_open(app: tauri::AppHandle, page: Page) -> Result<()> {
    open_page(&app, page)
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

/// Pure menu-popover math, physical pixels everywhere: center the window
/// horizontally under the tray icon, clamp it into the monitor work area, and
/// place it just below the icon with a small gap scaled by the display.
fn anchored_window_origin(
    tray: (f64, f64, f64, f64),
    window: (f64, f64),
    work: (f64, f64, f64, f64),
    scale: f64,
    gap_logical: f64,
) -> (f64, f64) {
    let x = (tray.0 + (tray.2 - window.0) / 2.0)
        .max(work.0)
        .min((work.0 + work.2 - window.0).max(work.0));
    (x, tray.1 + tray.3 + gap_logical * scale)
}

/// Resolve a tray rect into physical pixels; Tauri normalizes rects into
/// logical-or-physical enums, and mixed variants are treated as unknown.
fn physical_tray_rect(rect: tauri::Rect, scale: f64) -> Option<(f64, f64, f64, f64)> {
    match (rect.position, rect.size) {
        (tauri::Position::Physical(p), tauri::Size::Physical(s)) => {
            Some((p.x as f64, p.y as f64, s.width as f64, s.height as f64))
        }
        (tauri::Position::Logical(p), tauri::Size::Logical(s)) => {
            Some((p.x * scale, p.y * scale, s.width * scale, s.height * scale))
        }
        _ => None,
    }
}

/// Shared production tray-click path: toggle the entry bar anchored under
/// the tray icon. Diagnostic mode replays this exact path on SIGUSR1.
fn toggle_chooser_from_tray(
    app: &tauri::AppHandle,
    chooser: &tauri::WebviewWindow,
    rect: tauri::Rect,
) {
    if chooser.is_visible().unwrap_or(false) {
        let _ = chooser.hide();
        return;
    }
    hide_pages(app);
    // Tauri normalizes the tray rect into logical-or-physical enums; resolve
    // it to physical pixels before anchoring.
    let scale = chooser
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    let Some(tray_rect) = physical_tray_rect(rect, scale) else {
        return;
    };
    position_under_tray(app, chooser, tray_rect);
    let _ = chooser.show();
    let _ = chooser.set_focus();
}

fn position_under_tray(
    app: &tauri::AppHandle,
    chooser: &tauri::WebviewWindow,
    tray: (f64, f64, f64, f64),
) {
    let Ok(size) = chooser.outer_size() else {
        return;
    };
    // Tray rects and monitor bounds are physical pixels; find the display that
    // contains the icon instead of guessing a unit conversion per platform.
    let monitor = app.available_monitors().ok().and_then(|monitors| {
        let center = (tray.0 + tray.2 / 2.0, tray.1 + tray.3 / 2.0);
        monitors.into_iter().find(|m| {
            let position = m.position();
            let size = m.size();
            let (x, y, width, height) = (
                position.x as f64,
                position.y as f64,
                size.width as f64,
                size.height as f64,
            );
            center.0 >= x && center.0 < x + width && center.1 >= y && center.1 < y + height
        })
    });
    let Some(monitor) = monitor else {
        return;
    };
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let (x, y) = anchored_window_origin(
        tray,
        (size.width as f64, size.height as f64),
        (
            work.position.x as f64,
            work.position.y as f64,
            work.size.width as f64,
            work.size.height as f64,
        ),
        scale,
        6.0,
    );
    let _ = chooser.set_position(tauri::PhysicalPosition::new(x, y));
}

fn hide_pages(app: &tauri::AppHandle) {
    for label in ["history", "settings"] {
        if let Some(page) = app.get_webview_window(label) {
            let _ = page.hide();
        }
    }
}

fn window(
    app: &tauri::AppHandle,
    label: &str,
    width: f64,
    height: f64,
    overlay: bool,
) -> tauri::Result<()> {
    let diagnostic = app.state::<ControlMode>().diagnostic;
    let query = if app.state::<check::Check>().enabled {
        "&selfCheck=1"
    } else {
        ""
    };
    let window = tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::App(format!("index.html?view={label}{query}").into()),
    )
    .title(if diagnostic {
        format!("MOSS T0 · {label} · diagnostic")
    } else {
        format!("MOSS T0 · {label}")
    })
    .inner_size(width, height)
    .center()
    .visible(false)
    .focused(false)
    .focusable(!overlay)
    // Menu-style popovers stay frameless and translucent in every mode; the
    // diagnostic flag only changes the title suffix and the activation policy.
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
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
    let self_check = std::env::args().any(|arg| arg == "--self-check");
    if self_check
        && (controls.diagnostic
            || controls.show_page.is_some()
            || std::env::args().any(|arg| arg == "--show-chooser"))
    {
        eprintln!("T0 self-check requires default hidden window mode");
        std::process::exit(2);
    }
    tauri::Builder::default()
        .manage(controls)
        .manage(check::Check::new(self_check))
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
            probe_quit,
            check::probe_check_ready,
            check::probe_check_rendered,
            check::probe_check,
            check::probe_check_finish
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(if controls.diagnostic {
                tauri::ActivationPolicy::Regular
            } else {
                tauri::ActivationPolicy::Accessory
            });
            window(app.handle(), "chooser", 170.0, 54.0, false)?;
            window(app.handle(), "history", 540.0, 260.0, false)?;
            window(app.handle(), "settings", 600.0, 420.0, false)?;
            window(app.handle(), "overlay", 620.0, 440.0, true)?;
            // Monochrome template glyph (three waveform bars), pre-rendered offline to raw
            // RGBA bytes; 36px pixels render at 18pt on the status item (2x retina sharp).
            // No external image or resource access at runtime.
            const TRAY_ICON_RGBA: &[u8] = include_bytes!("../assets/tray-moss.rgba");
            let tray = tauri::tray::TrayIconBuilder::with_id("moss-t0")
                .icon(tauri::image::Image::new_owned(
                    TRAY_ICON_RGBA.to_vec(),
                    36,
                    36,
                ))
                .icon_as_template(true)
                .tooltip("MOSS T0 验证壳（未录音）")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { rect, .. } = event {
                        let app = tray.app_handle();
                        if let Some(chooser) = app.get_webview_window("chooser") {
                            toggle_chooser_from_tray(app, &chooser, rect);
                        }
                    }
                })
                .build(app)?;
            // Explicit development entry only; normal startup stays invisible.
            // `--show-page` skips the entry bar and opens the page directly via
            // the exact production path.
            if controls.show_page.is_none()
                && (controls.diagnostic || std::env::args().any(|arg| arg == "--show-chooser"))
            {
                if let Some(chooser) = app.get_webview_window("chooser") {
                    // Anchor the development entry under the tray icon like a real
                    // click; fall back to the centered default if the icon rect is
                    // not yet known.
                    if let Ok(Some(rect)) = tray.rect() {
                        let scale = chooser
                            .primary_monitor()
                            .ok()
                            .flatten()
                            .map(|m| m.scale_factor())
                            .unwrap_or(1.0);
                        if let Some(tray_rect) = physical_tray_rect(rect, scale) {
                            position_under_tray(app.handle(), &chooser, tray_rect);
                        }
                    }
                    chooser.show()?;
                    chooser.set_focus()?;
                }
            }
            // Keep the status item alive after setup returns.
            app.manage(TrayKeepAlive(tray));
            if let Some(page) = controls.show_page {
                open_page(app.handle(), page)?;
            }
            if controls.diagnostic {
                // Explicit development hook only: replay the exact production
                // tray-click toggle on SIGUSR1; normal runs never install it.
                let handle = app.handle().clone();
                let mut signals =
                    signal_hook::iterator::Signals::new([signal_hook::consts::SIGUSR1])?;
                eprintln!("USR1_HOOK_REGISTERED");
                std::thread::spawn(move || {
                    for _ in signals.forever() {
                        eprintln!("USR1_RECEIVED");
                        let app = handle.clone();
                        let inner = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            let Some(chooser) = inner.get_webview_window("chooser") else {
                                return;
                            };
                            let Ok(Some(rect)) = inner.state::<TrayKeepAlive>().0.rect() else {
                                return;
                            };
                            toggle_chooser_from_tray(&inner, &chooser, rect);
                        });
                    }
                });
            }
            if self_check {
                // Bounded watchdog; no file/report payload or OS input injection.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(20));
                    eprintln!("T0_SELF_CHECK TIMEOUT");
                    handle.exit(1);
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Menu-style popovers close themselves when the user clicks elsewhere.
            tauri::WindowEvent::Focused(false) => {
                if matches!(window.label(), "chooser" | "history" | "settings") {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("isolated T0 probe failed to start");
}

#[cfg(test)]
mod tests {
    use super::{anchored_window_origin, physical_tray_rect};

    #[test]
    fn chooser_anchors_below_tray_and_stays_inside_the_work_area() {
        // Tray icon near the right edge: centered below it, 6 logical px gap at 2x.
        let (x, y) = anchored_window_origin(
            (1800.0, 0.0, 40.0, 24.0),
            (170.0, 54.0),
            (0.0, 0.0, 1920.0, 1055.0),
            2.0,
            6.0,
        );
        assert_eq!(x, 1800.0 + (40.0 - 170.0) / 2.0);
        assert_eq!(y, 24.0 + 12.0);
        // Near the left edge the centered position clamps into the work area.
        let (x, y) = anchored_window_origin(
            (10.0, 0.0, 40.0, 24.0),
            (170.0, 54.0),
            (0.0, 0.0, 1920.0, 1055.0),
            2.0,
            6.0,
        );
        assert_eq!((x, y), (0.0, 36.0));
    }

    #[test]
    fn tray_rect_resolves_both_unit_variants_and_rejects_mixed() {
        use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size};
        let rect = |position: Position, size: Size| tauri::Rect { position, size };
        let physical = physical_tray_rect(
            rect(
                Position::Physical(PhysicalPosition::new(100, 0)),
                Size::Physical(PhysicalSize::new(40, 24)),
            ),
            2.0,
        );
        assert_eq!(physical, Some((100.0, 0.0, 40.0, 24.0)));
        let logical = physical_tray_rect(
            rect(
                Position::Logical(LogicalPosition::new(50.0, 0.0)),
                Size::Logical(LogicalSize::new(20.0, 12.0)),
            ),
            2.0,
        );
        assert_eq!(logical, Some((100.0, 0.0, 40.0, 24.0)));
        assert_eq!(
            physical_tray_rect(
                rect(
                    Position::Physical(PhysicalPosition::new(100, 0)),
                    Size::Logical(LogicalSize::new(20.0, 12.0)),
                ),
                2.0,
            ),
            None
        );
    }
}
