//! Bounded, explicit synthetic integration checks. Never injects OS input.
use crate::model::Demo;
use crate::{snapshot, Result};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{Manager, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Step {
    Boot,
    Bounded,
    History,
    Settings,
    Listening,
    Processing,
    Speaking,
    Dictation,
    Hidden,
}
const STEPS: [Step; 9] = [
    Step::Boot,
    Step::Bounded,
    Step::History,
    Step::Settings,
    Step::Listening,
    Step::Processing,
    Step::Speaking,
    Step::Dictation,
    Step::Hidden,
];
#[derive(Default)]
pub struct Progress {
    next: usize,
    ready: [bool; 4],
    rendered: Option<Option<Demo>>,
    finished: bool,
}
impl Progress {
    fn advance(&mut self, step: Step) -> Result<()> {
        if self.finished || STEPS.get(self.next) != Some(&step) {
            return Err("unexpected checkpoint".into());
        }
        self.next += 1;
        Ok(())
    }
    fn finish(&mut self, passed: bool) -> bool {
        let valid = !self.finished && passed && self.next == STEPS.len();
        self.finished = true;
        valid
    }
}
pub struct Check {
    pub enabled: bool,
    progress: Mutex<Progress>,
}
impl Check {
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            progress: Mutex::new(Progress::default()),
        }
    }
    fn authorize(&self, caller: &WebviewWindow, label: &str) -> Result<()> {
        if authorized(self.enabled, caller.label(), label) {
            Ok(())
        } else {
            Err("self-check disabled or wrong caller".into())
        }
    }
}
fn authorized(enabled: bool, caller: &str, expected: &str) -> bool {
    enabled && caller == expected
}
fn index(label: &str) -> Option<usize> {
    ["chooser", "history", "settings", "overlay"]
        .iter()
        .position(|v| *v == label)
}

#[tauri::command]
pub fn probe_check_ready(app: tauri::AppHandle, caller: WebviewWindow) -> Result<()> {
    let check = app.state::<Check>();
    if !check.enabled {
        return Err("self-check disabled".into());
    }
    let i = index(caller.label()).ok_or("wrong caller")?;
    check
        .progress
        .lock()
        .map_err(|_| "check unavailable")?
        .ready[i] = true;
    Ok(())
}
#[tauri::command]
pub fn probe_check_rendered(
    app: tauri::AppHandle,
    caller: WebviewWindow,
    demo: Option<Demo>,
) -> Result<()> {
    let check = app.state::<Check>();
    check.authorize(&caller, "overlay")?;
    if snapshot(&app)?.demo != demo {
        return Err("stale render".into());
    }
    check
        .progress
        .lock()
        .map_err(|_| "check unavailable")?
        .rendered = Some(demo);
    Ok(())
}
#[tauri::command]
pub fn probe_check(app: tauri::AppHandle, caller: WebviewWindow, step: Step) -> Result<bool> {
    let check = app.state::<Check>();
    check.authorize(&caller, "chooser")?;
    let state = snapshot(&app)?;
    let visible = |label| -> Result<bool> {
        app.get_webview_window(label)
            .ok_or("window unavailable")?
            .is_visible()
            .map_err(|e| e.to_string())
    };
    let escape = app.global_shortcut().is_registered("Escape");
    let hotkey = app.global_shortcut().is_registered(crate::TEST_HOTKEY);
    let mut progress = check.progress.lock().map_err(|_| "check unavailable")?;
    if STEPS.get(progress.next) != Some(&step) {
        return Err("unexpected checkpoint".into());
    }
    if !progress.ready.iter().all(|v| *v) {
        return Ok(false);
    }
    let expected = match step {
        Step::Listening => Some(Demo::Listening),
        Step::Processing => Some(Demo::Processing),
        Step::Speaking => Some(Demo::Speaking),
        Step::Dictation => Some(Demo::Dictation),
        _ => None,
    };
    let valid = !state.hotkey_enabled
        && !hotkey
        && state.demo == expected
        && match step {
            Step::Boot | Step::Bounded => {
                !escape
                    && !visible("chooser")?
                    && !visible("history")?
                    && !visible("settings")?
                    && !visible("overlay")?
            }
            Step::History => {
                !escape && !visible("chooser")? && visible("history")? && !visible("overlay")?
            }
            Step::Settings => {
                !escape && !visible("chooser")? && visible("settings")? && !visible("overlay")?
            }
            Step::Hidden => !escape && !visible("overlay")? && progress.rendered == Some(None),
            _ => escape && visible("overlay")? && progress.rendered == Some(expected),
        };
    if !valid {
        return Ok(false);
    }
    progress.advance(step)?;
    println!("T0_CHECKPOINT {step:?}");
    Ok(true)
}
#[tauri::command]
pub fn probe_check_finish(
    app: tauri::AppHandle,
    caller: WebviewWindow,
    passed: bool,
) -> Result<()> {
    let check = app.state::<Check>();
    check.authorize(&caller, "chooser")?;
    let passed = check
        .progress
        .lock()
        .map_err(|_| "check unavailable")?
        .finish(passed);
    // Release transient Escape and hide effects even on a failed run.
    let cleaned = crate::hide_overlay(&app).is_ok();
    println!(
        "T0_SELF_CHECK {}",
        if passed && cleaned { "PASS" } else { "FAIL" }
    );
    app.exit(if passed && cleaned { 0 } else { 1 });
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn helpers_are_disabled_by_default_and_bound_to_actual_caller() {
        for enabled in [false, true] {
            for caller in ["chooser", "history", "settings", "overlay", "untrusted"] {
                assert_eq!(
                    authorized(enabled, caller, "chooser"),
                    enabled && caller == "chooser"
                );
                assert_eq!(
                    authorized(enabled, caller, "overlay"),
                    enabled && caller == "overlay"
                );
            }
        }
    }
    #[test]
    fn ordered_checkpoints_cannot_skip_repeat_or_finish_early() {
        let mut p = Progress::default();
        assert!(p.advance(Step::History).is_err());
        assert!(p.advance(Step::Boot).is_ok());
        assert!(p.advance(Step::Boot).is_err());
        assert!(!p.finish(true));
        assert!(p.advance(Step::Bounded).is_err());
    }
    #[test]
    fn only_complete_success_is_accepted_once() {
        for success in [true, false] {
            let mut p = Progress::default();
            for step in STEPS {
                p.advance(step).unwrap();
            }
            assert_eq!(p.finish(success), success);
            assert!(!p.finish(true));
        }
        assert!(!Check::new(false).enabled);
    }
}
