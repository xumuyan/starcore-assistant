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

Scene and icon artwork was created through image generation during development. Model weights are not included in this repository. Users must obtain compatible model files separately and comply with the applicable model license and service terms.

Links in the development article identify references and services discussed during development; they do not imply that every referenced project was incorporated into this source tree. This notice does not assign a license to the project's original code or artwork.
