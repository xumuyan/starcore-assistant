use serde::{Deserialize, Serialize};

// Explicit diagnostic controls are regular windows; the overlay is never altered.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ControlMode {
    pub diagnostic: bool,
}
impl ControlMode {
    pub fn from_args(args: impl IntoIterator<Item = String>) -> Self {
        Self {
            diagnostic: args.into_iter().any(|arg| arg == "--diagnostic-controls"),
        }
    }
    pub fn standard_window(self, overlay: bool) -> bool {
        self.diagnostic && !overlay
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Page {
    History,
    Settings,
}
impl Page {
    pub fn label(self) -> &'static str {
        match self {
            Self::History => "history",
            Self::Settings => "settings",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Demo {
    Listening,
    Processing,
    Speaking,
    Dictation,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub demo: Option<Demo>,
    pub hotkey_enabled: bool,
}
impl Snapshot {
    pub fn hide(&mut self) {
        self.demo = None;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostic_mode_is_explicit_and_never_changes_overlay() {
        let normal = ControlMode::from_args(["--show-chooser".into()]);
        assert_eq!(normal, ControlMode::default());
        assert!(!normal.standard_window(false));
        let diagnostic = ControlMode::from_args(["--diagnostic-controls".into()]);
        assert!(diagnostic.standard_window(false));
        assert!(!diagnostic.standard_window(true));
        assert!(!ControlMode::from_args(["--diagnostic-controls=true".into()]).diagnostic);
    }
    #[test]
    fn starts_invisible_without_hotkeys() {
        assert_eq!(Snapshot::default().demo, None);
        assert!(!Snapshot::default().hotkey_enabled);
    }
    #[test]
    fn hiding_preserves_explicit_hotkey_opt_in() {
        let mut state = Snapshot {
            demo: Some(Demo::Listening),
            hotkey_enabled: true,
        };
        state.hide();
        assert_eq!(state.demo, None);
        assert!(state.hotkey_enabled);
        for page in [Page::History, Page::Settings] {
            assert!(["history", "settings"].contains(&page.label()));
        }
    }
}
