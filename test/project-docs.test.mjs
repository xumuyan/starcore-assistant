import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const files=['docs/verification/2026-11-12-tauri-t0-manual.md','README.md','AGENTS.md','operatelog.md','PLAN.md','docs/superpowers/specs/2026-11-01-global-dictation-design.md','docs/verification/2026-11-01-dictation-integration.md','docs/superpowers/specs/2026-11-02-moss-design.md','docs/verification/2026-11-02-moss.md','docs/troubleshooting/macos-permissions.md','design-qa.md','docs/verification/2026-11-09-reminder.md','docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md','docs/superpowers/specs/2026-11-12-tauri2-rust-migration.md'];

test('root project rules keep all five traceability requirements and existing behavior',()=>{
  const rules=read('AGENTS.md');
  assert.equal((rules.match(/^[1-5]\. /gm)||[]).length,5);
  for(const requirement of [/保留原有功能行为/,/Git commit/,/编写或更新相关测试/,/operatelog\.md/,/PLAN\.md/,/git push/,/Asia\/Shanghai/,/禁止记录密码、令牌和原始抓包载荷/])assert.match(rules,requirement);
});

test('every completed plan checkbox names evidence and unresolved scope stays explicit',()=>{
  const plan=read('PLAN.md');
  assert.match(plan,/解除条件/);
  assert.match(plan,/未勾选项均未验收完成/);
  const tasks=plan.split('\n').filter(line=>/^- \[[ x]\]/.test(line));
  assert.ok(tasks.length>=30,'keep implementation and acceptance steps actionable');
  for(const line of tasks.filter(line=>line.startsWith('- [x]')))assert.match(line,/证据：\s*\S.{5,}/,'completed steps require nonempty evidence, not a placeholder label');
});

test('Codex completion voice reminder acceptance is explicit and evidence-backed',()=>{
  const plan=read('PLAN.md');
  const section=plan.split('## Codex 完成语音提醒 · SC-20261104-001')[1]?.split('\n## ')[0];
  assert.ok(section,'record the approved reminder implementation');
  for(const requirement of [/用户已批准实施.*2026-11-04 登记/,/复用现有 Codex 完成监听/,/避免重复/,/独立开关[^\n]*默认关闭/,/不进入聊天记录/,/屏幕顶部/,/小爱音箱不纳入/,/本轮结束不等于代码或测试已通过/])assert.match(section,requirement);
  const lines=section.split('\n').filter(line=>/^- \[[ x]\]/.test(line));
  for(const line of lines.filter(line=>line.startsWith('- [x]')))assert.match(line,/证据：\s*\S.{5,}/,'completed reminder steps require evidence');
  const acceptance=lines.find(line=>/真实 Codex 任务结束后的自动播报验收/.test(line));
  assert.ok(acceptance,'the real-device acceptance line exists');
  assert.ok(acceptance.startsWith('- [x]') ? /用户.*确认/.test(acceptance) : true,'a checked acceptance must cite the user confirmation');
});

test('each operation entry records time, changes, difficulties, resolution, verification and commit',()=>{
  const entries=read('operatelog.md').split(/^## /m).slice(1).filter(entry=>/^SC-\d{8}-(?:H)?\d{3}\b/.test(entry));
  assert.ok(entries.length>=3);
  const ids=entries.map(entry=>entry.match(/^SC-\d{8}-(?:H)?\d{3}/)[0]);
  assert.equal(ids.length,new Set(ids).size);
  for(const entry of entries){
    for(const field of ['北京时间','修改或新增','遇到的难题','处理方式','验证结果','遗留问题','对应 Git 提交'])assert.ok(entry.includes('- '+field+'：'),`${ids[entries.indexOf(entry)]}: missing ${field}`);
    assert.match(entry,/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \+08:00/);
  }
});

test('project governance links resolve without exposing private paths or credential values',()=>{
  for(const file of files){
    const content=read(file);assert.ok(content.trim().length>100);
    assert.doesNotMatch(content,/\/Users\/|\/var\/folders\/|\b(?:ghp_|gho_|github_pat_|sk-)[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
      const target=match[1];if(/^(https?:|#)/.test(target))continue;
      assert.ok(existsSync(resolve(dirname(resolve(root,file)),target.split('#')[0])),`${file}: broken link ${target}`);
    }
  }
});


test('package and native version metadata agree with the current changelog',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  const build=read('client/build.py');
  assert.equal(build.match(/'CFBundleShortVersionString': '([^']+)'/)[1],pkg.version);
  const buildNumber=build.match(/'CFBundleVersion': '(\d+)'/)[1];
  assert.ok(read('CHANGELOG.md').includes('## '+pkg.version+' —'));
  assert.ok(read('CHANGELOG.md').includes('build '+buildNumber));
});


test('voice-first UI redesign stays batched and unaccepted until implementation evidence exists',()=>{
  const spec=read('docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md');
  for(const requirement of [/已实现独立参考组件预览/,/voice-ring/,/beam/,/voice 文字/,/orbs/,/退下\/退出/,/默认关闭/,/旧场景资源保留/,/离线复刻/])assert.match(spec,requirement);
  for(const batch of ['B1','B2','B3','B4','B5','B6','B7','B8'])assert.ok(spec.includes('- '+batch+' '));
  const plan=read('PLAN.md');
  const section=plan.split('## 单页语音助理界面重制')[1]?.split('\n## ')[0];
  assert.ok(section,'keep the redesign section');
  const lines=section.split('\n').filter(line=>/^- \[[ x]\] B\d/.test(line));
  assert.equal(lines.length,8,'keep eight implementation batches');
  for(const line of lines)if(line.startsWith('- [x] '))assert.match(line,/证据：\s*\S.{5,}/,'a checked redesign batch needs evidence');
});

test('confirmed redesign uses reference visuals, browser-only actions and a two-step history/settings menu',()=>{
  const spec=read('docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md');
  const plan=read('PLAN.md').split('## 单页语音助理界面重制')[1]?.split('\n## ')[0];
  assert.ok(plan);
  for(const content of [spec,plan]){
    assert.match(content,/完全照参考站/);
    assert.match(content,/不混用现有 MOSS/);
    assert.match(content,/先(?:显示|出现)「历史记录 \/ 设置」按钮组/);
    assert.match(content,/对应.*beam.*置顶窗口/);
    assert.match(content,/仅(?:限"打开浏览器|浏览器)/);
    assert.match(content,/系统默认浏览器/);
    assert.match(content,/HTTP\/HTTPS/);
    assert.match(content,/默认关闭/);
    assert.match(content,/加密历史记录|既有加密聊天记录/);
  }
  assert.match(spec,/尚未完成逐状态视觉比对/);
  assert.match(spec,/不执行脚本、Shell 或其他应用协议/);
  assert.doesNotMatch(spec,/点击打开置顶设置框|先支持常用浏览器\/Safari/);
  for(const name of ['voice-ring','beam','voice','orbs'])assert.ok(spec.includes('https://libraries.dev/'+name));
});

test('Tauri 2 decision keeps Windows, platform adapters, transition and acceptance explicit',()=>{
  const spec=read('docs/superpowers/specs/2026-11-12-tauri2-rust-migration.md');
  const plan=read('PLAN.md');
  const ui=read('docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md');
  for(const content of [spec,plan,ui]){
    assert.match(content,/Tauri 2 \+ Rust/);
    assert.match(content,/Windows/);
    assert.ok(content.includes('2026-11-12-tauri2-rust-migration.md') || content===spec);
  }
  for(const requirement of [/已引入 Tauri 2 依赖/,/WKWebView/,/WebView2/,/受管 sidecar/,/不能要求用户手动安装 Node.js/,/一个有效写入者\/事件消费者/,/capabilities\/permissions/,/不重置配置/,/Unix 专用/,/真实 Windows 设备/,/CI 构建通过不等于真机验收通过/])assert.match(spec,requirement);
  for(const id of ['T0','T1','T2','T3','T4']){
    assert.ok(spec.includes('- '+id+'：'));
    assert.ok(plan.includes('- [ ] '+id+' '),'migration stages remain unaccepted');
  }
  assert.match(ui, /依赖 T0\/T1/);
  assert.match(ui, /不直接复用 Swift 窗口实现/);
  assert.match(ui, /Windows 系统托盘/);
});

test('Rust P3 remains unaccepted until real switching and protocol gaps are verified', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /- \[ \] P3 宿主能力逐模块对齐/);
  assert.match(plan, /- \[ \] P4 灰度切换与回滚演练/);
  assert.match(plan, /SC-20261111-001\/002\/003 仅为初版实现/);
  assert.match(plan, /CODEX_WEIXIN_STATE_DIR.*\/assistant/);
  assert.match(plan, /页面与样式冻结/);
  assert.match(plan, /沙箱自动测试不替代真机验收/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /rusqlite \/ libsqlite3-sys \/ bundled SQLite/);
});


test('Rust cancellation evidence distinguishes logical invalidation from transport and device acceptance', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /SC-20261111-005.*stdin/);
  assert.match(plan, /逻辑取消.*不会立即中断阻塞 HTTP/);
  assert.match(plan, /真机打断和系统声音停止未验收/);
  assert.ok(existsSync(resolve(root, 'test/rust-chat-lifecycle.test.mjs')));
  assert.match(plan, /连续取消下的资源上限尚待补齐/);
});


test('Rust playback groundwork does not claim dictation or device acceptance', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /SC-20261111-006.*playbackId/);
  assert.match(plan, /无编号 Node 协议保持兼容/);
  assert.match(plan, /Rust 听写未实现.*dictationError.*不录音/);
  assert.match(plan, /真实系统声音\/Fish 回调.*仍未验收.*实际提醒\/听写共存仍待/);
});


test('Rust reminder evidence keeps opt-in, resource and device acceptance boundaries explicit', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /SC-20261111-007.*codexVoiceReminder=true.*独立于 speak/);
  assert.match(plan, /120 秒逻辑时钟与队列单测/);
  assert.match(plan, /真实 Codex 事件→Rust 声音.*未验收.*不能套用 Node/);
  assert.match(plan, /超大目录与长运行 seen 集合资源上限待压测/);
  assert.ok(existsSync(resolve(root, 'test/rust-reminder.test.mjs')));
});


test('T0 engineering evidence never substitutes for native focus or voice acceptance', () => {
  const report = read('docs/verification/2026-11-12-tauri-t0.md');
  const plan = read('PLAN.md');
  for (const phrase of [/macos-private-api/, /窗口\/焦点/, /未验收/, /Windows/, /未替换/, /npm test/]) assert.match(report, phrase);
  assert.match(plan, /- \[ \] T0 /);
  assert.match(report, /不绕过/);
});


test('T0 diagnostic controls retain an explicit opt-in and separate acceptance evidence', () => {
  const readme = read('desktop/README.md');
  const report = read('docs/verification/2026-11-12-tauri-t0.md');
  for (const content of [readme, report]) {
    assert.match(content, /--diagnostic-controls/);
    assert.match(content, /layer 5/);
    assert.match(content, /overlay/);
    assert.match(content, /不持久化/);
    assert.match(content, /T0.*未(?:验收|完成)/);
  }
  assert.match(report, /结果待反馈/);
  assert.match(report, /诊断模式成功不能替代/);
  assert.match(read('PLAN.md'), /- \[ \] T0 .*SC-20261112-007/);
});


test('native synthetic self-check evidence stays separate from desktop and service acceptance', () => {
  const report = read('docs/verification/2026-11-12-tauri-t0.md');
  const readme = read('desktop/README.md');
  for (const content of [report, readme]) {
    assert.match(content, /check:desktop:native/);
    assert.match(content, /--self-check/);
    assert.match(content, /T0.*仍未验收/);
    assert.match(content, /T1.*未接入/);
    assert.match(content, /不注入|不包含键盘\/鼠标注入/);
    assert.match(content, /20 秒/);
    assert.match(content, /30 秒/);
  }
  assert.match(report, /首次原生运行.*失败/);
  assert.match(report, /注册表状态不能代表物理 Esc/);
  assert.match(read('PLAN.md'), /- \[ \] T0 .*SC-20261112-008/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:desktop:native'], 'node desktop/check-native.mjs');
  assert.equal(pkg.scripts.test, 'node --test');
});


test('manual T0 handoff stays pending, mode-separated and safe with a next action', () => {
  const sheet = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  assert.match(sheet, /T0 仍未验收，T1 未启动/);
  assert.match(sheet, /npm run desktop:probe -- -- --diagnostic-controls/);
  assert.match(sheet, /```sh\nnpm run desktop:probe\n```/);
  for (const id of ['D01', 'D02', 'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08']) {
    assert.match(sheet, new RegExp(`\\| ${id} \\| .* \\| 未测 \\|`));
    assert.ok(sheet.includes(`${id}：未测`) || sheet.includes(`${id} 双屏：未测`));
  }
  for (const requirement of [/不能替代默认透明置顶模式验收/, /Ctrl\+C/, /不为本次测试授权新权限/,
    /不在真实发送\/删除按钮上试/, /未测/, /临时热键默认关闭/, /有失败先/, /精确视觉/,
    /没有发送点击\/键盘输入/, /不是界面“退出”功能验收/, /Windows 仍需独立/]) assert.match(sheet, requirement);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-12-tauri-t0.md']) {
    assert.ok(read(path).includes('2026-11-12-tauri-t0-manual.md'));
  }
  assert.match(read('PLAN.md'), /当前下一步（SC-20261113-001）|当前下一步（SC-20261113-005）|当前下一步（SC-20261113-007）|当前下一步（SC-20261113-008）|当前下一步（SC-20261113-010）|当前下一步（SC-20261113-011）|当前下一步（SC-20261113-012）|当前下一步（SC-20261113-013）|当前下一步（SC-20261113-014）|当前下一步（SC-20261113-015）|当前下一步（SC-20261113-016）|当前下一步（SC-20261113-017）|当前下一步（SC-20261113-018）|当前下一步（SC-20261112-009）/);
  assert.match(read('desktop/README.md'), /beui\.dev/);
  assert.match(read('docs/verification/2026-11-12-tauri-t0.md'), /SC-20261113-001/);
  assert.match(read('licenses/beui-motion-MIT.txt'), /Saurabh Chauhan/);
});


test('libraries.dev main visual work takes priority without claiming business migration', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /优先推进独立视觉层/);
  assert.match(plan, /不阻塞隔离主视觉开发/);
  assert.match(plan, /真实服务接线仍依赖 T0\/T1/);
  assert.ok(existsSync(resolve(root, 'docs/verification/2026-11-13-reference-scene.md')));
  assert.match(read('desktop/README.md'), /播放完整语音流程（合成）/);
});
