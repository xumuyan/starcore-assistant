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
| Rust host crates (moss-host: serde, serde_json, libc, ureq, rustls, regex, aes-gcm, rand_core, getrandom) | Rust assistant host engine dependencies | MIT / Apache-2.0 (rustls additionally ISC); exact versions in `rust-host/Cargo.lock`; upstream license files are in the Cargo source cache, not automatically included in the app. A complete distribution-license audit remains required before enabling Rust in production |
| rusqlite / libsqlite3-sys / bundled SQLite | Rust encrypted conversation storage (SC-20261111-003) | rusqlite and libsqlite3-sys: MIT; SQLite: public domain. Exact versions in `rust-host/Cargo.lock`; distribution-license audit pending as above |

Scene and icon artwork was created through image generation during development. Model weights are not included in this repository. Users must obtain compatible model files separately and comply with the applicable model license and service terms.

Links in the development article identify references and services discussed during development; they do not imply that every referenced project was incorporated into this source tree. This notice does not assign a license to the project's original code or artwork.
