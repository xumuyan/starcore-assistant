use serde::{Deserialize, Serialize};

// Diagnostic controls are an explicit, nonpersistent observation aid. They only
// change the activation policy, auto-show and the title suffix; every window
// stays frameless, transparent and topmost in every mode. `show_page` reuses
// the production open-page path for read-only visual verification.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ControlMode {
    pub diagnostic: bool,
    pub show_page: Option<Page>,
}
impl ControlMode {
    pub fn from_args(args: impl IntoIterator<Item = String>) -> Self {
        let mut diagnostic = false;
        let mut show_page = None;
        let mut iter = args.into_iter();
        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "--diagnostic-controls" => diagnostic = true,
                "--show-page" => {
                    show_page = match iter.next().as_deref() {
                        Some("history") => Some(Page::History),
                        Some("settings") => Some(Page::Settings),
                        _ => None,
                    };
                }
                _ => {}
            }
        }
        Self {
            diagnostic,
            show_page,
        }
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
    fn diagnostic_mode_is_explicit_exact_match_and_not_persistent() {
        let normal = ControlMode::from_args(["--show-chooser".into()]);
        assert_eq!(normal, ControlMode::default());
        assert!(!normal.diagnostic);
        let diagnostic = ControlMode::from_args(["--diagnostic-controls".into()]);
        assert!(diagnostic.diagnostic);
        assert!(!ControlMode::from_args(["--diagnostic-controls=true".into()]).diagnostic);
    }
    #[test]
    fn show_page_flag_is_exact_two_arg_form_and_unknown_names_are_ignored() {
        assert_eq!(
            ControlMode::from_args(["--show-page".into(), "history".into()]).show_page,
            Some(Page::History)
        );
        assert_eq!(
            ControlMode::from_args(["--show-page".into(), "settings".into()]).show_page,
            Some(Page::Settings)
        );
        // Overlay is demo-driven, not an open-page target.
        assert_eq!(
            ControlMode::from_args(["--show-page".into(), "overlay".into()]).show_page,
            None
        );
        assert_eq!(
            ControlMode::from_args(["--show-page".into(), "--show-page".into()]).show_page,
            None
        );
        assert_eq!(
            ControlMode::from_args(["--show-page=history".into()]).show_page,
            None
        );
        assert_eq!(ControlMode::from_args(Vec::new()).show_page, None);
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
