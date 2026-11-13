# Third-party notices

Dependencies remain subject to their own licenses. Exact npm versions and package metadata are recorded in `package-lock.json`; packages installed by npm include their license files.

| Component | Use | Notice |
| --- | --- | --- |
| Three.js | WebGL scene rendering | MIT; `client/build.py` and the scene preview build copy `node_modules/three/LICENSE` into their output |
| Phosphor Icons | Production interface icons | MIT; retained in `client/hud/icons/PHOSPHOR-LICENSE.txt` |
| Lucide and Feather icons | Visual prototype icons | ISC and MIT; retained in `client/scene/prototype/icons/LUCIDE-LICENSE.txt` |
| weixin-agent-sdk | WeChat channel bridge | MIT; installed from npm with its upstream license |
| transcribe-cpp | Local ASR bindings | MIT; native optional packages and model files may have additional notices |
| qrcode and qrcode-terminal | Login QR rendering | MIT and Apache-2.0 respectively; see the installed packages |
| esbuild | Frontend bundling | MIT; build dependency |
| SpeakMore | Native hotkey and clipboard reference for the opt-in dictation module | MIT; retained in `licenses/SpeakMore-MIT.txt` and copied into the app bundle |
| thinking-orbs (engine subset) | Thinking-orb state animation for the HUD status line | MIT; retained in `licenses/thinking-orbs-MIT.txt`, bundled locally by `client/build.py` without its React runtime |
| voice-ring / voice-glow / border-beam | Original Libraries.dev React components for the isolated desktop preview | MIT, Jakub Antalik; exact versions in package-lock.json; notices retained in licenses/voice-ring-MIT.txt, licenses/voice-glow-MIT.txt, licenses/border-beam-MIT.txt; all runtime notices copied into preview output. VoiceGlow Pro processing hook and models are not included |
| React / React DOM / scheduler | Locally bundled desktop preview runtime (thinking-orbs React component included) | MIT, Meta Platforms; retained in licenses/react-MIT.txt, licenses/react-dom-MIT.txt, licenses/scheduler-MIT.txt; runtime license text copied into preview output |
| Tauri API / CLI 2.12.4 | Isolated T0 page IPC / development tooling | Apache-2.0 OR MIT; API MIT license copied into probe output and retained in licenses/tauri-api-MIT.txt; CLI is build-only |
| beUI motion Button / Switch / Input (adapted) | T0 chooser pill entry and page controls | MIT, © 2026 Saurabh Chauhan; adapted from https://beui.dev/components/motion (source starc007/ui-components); Tailwind classes replaced by local CSS, not a pixel-exact copy; adapted-file license retained in licenses/beui-motion-MIT.txt |
| motion 14.12.0 (+ motion-dom / motion-utils / tslib) | Animation runtime for the adapted beUI controls | MIT; runtime notice copied into probe output; transitive versions in package-lock.json |
| Tauri 2.12.5 / tauri-build 2.7.4 / tauri-plugin-global-shortcut 2.4.1 | Isolated native T0 shell | Apache-2.0 OR MIT; exact transitive versions in desktop/src-tauri/Cargo.lock, upstream notices in Cargo source cache; complete native distribution-license audit pending, no distributable bundle released |
| Rust host crates (moss-host: serde, serde_json, libc, ureq, rustls, regex, aes-gcm, rand_core, getrandom) | Rust assistant host engine dependencies | MIT / Apache-2.0 (rustls additionally ISC); exact versions in `rust-host/Cargo.lock`; upstream license files are in the Cargo source cache, not automatically included in the app. A complete distribution-license audit remains required before enabling Rust in production |
| rusqlite / libsqlite3-sys / bundled SQLite | Rust encrypted conversation storage (SC-20261111-003) | rusqlite and libsqlite3-sys: MIT; SQLite: public domain. Exact versions in `rust-host/Cargo.lock`; distribution-license audit pending as above |

Scene and icon artwork was created through image generation during development. Model weights are not included in this repository. Users must obtain compatible model files separately and comply with the applicable model license and service terms.

Links in the development article identify references and services discussed during development; they do not imply that every referenced project was incorporated into this source tree. This notice does not assign a license to the project's original code or artwork.
