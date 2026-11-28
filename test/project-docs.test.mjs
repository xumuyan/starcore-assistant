import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const files=['docs/verification/2026-11-23-tauri-t0-round3-preflight.md','docs/verification/2026-11-22-tauri-t0-retest.md','docs/verification/2026-11-14-voice-coordinator-model.md','docs/verification/2026-11-14-voice-adapter-contract.md','docs/verification/2026-11-12-tauri-t0-manual.md','README.md','AGENTS.md','operatelog.md','PLAN.md','docs/superpowers/specs/2026-11-01-global-dictation-design.md','docs/verification/2026-11-01-dictation-integration.md','docs/superpowers/specs/2026-11-02-moss-design.md','docs/verification/2026-11-02-moss.md','docs/troubleshooting/macos-permissions.md','design-qa.md','docs/verification/2026-11-09-reminder.md','docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md','docs/superpowers/specs/2026-11-12-tauri2-rust-migration.md'];

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
  assert.match(read('PLAN.md'), /当前下一步（SC-20261113-001）|当前下一步（SC-20261113-005）|当前下一步（SC-20261113-007）|当前下一步（SC-20261113-008）|当前下一步（SC-20261113-010）|当前下一步（SC-20261113-011）|当前下一步（SC-20261113-012）|当前下一步（SC-20261113-013）|当前下一步（SC-20261113-014）|当前下一步（SC-20261113-015）|当前下一步（SC-20261113-016）|当前下一步（SC-20261113-017）|当前下一步（SC-20261113-018）|当前下一步（SC-20261113-019）|当前下一步（SC-20261113-020）|当前下一步（SC-20261114-001）|当前下一步（SC-20261114-002）|当前下一步（SC-20261114-003）|当前下一步（SC-20261114-004）|当前下一步（SC-20261114-005）|当前下一步（SC-20261114-006）|当前下一步（SC-20261114-007）|当前下一步（SC-20261114-008）|当前下一步（SC-20261114-009）|当前下一步（SC-20261114-010）|当前下一步（SC-20261114-011）|当前下一步（SC-20261114-012）|当前下一步（SC-20261114-013）|当前下一步（SC-20261114-014）|当前下一步（SC-20261114-015）|当前下一步（SC-20261114-016）|当前下一步（SC-20261114-017）|当前下一步（SC-20261114-018）|当前下一步（SC-20261114-019）|当前下一步（SC-20261114-020）|当前下一步（SC-20261114-021）|当前下一步（SC-20261115-001）|当前下一步（SC-20261115-002）|当前下一步（SC-20261115-003）|当前下一步（SC-20261115-004）|当前下一步（SC-20261115-005）|当前下一步（SC-20261115-006）|当前下一步（SC-20261115-007）|当前下一步（SC-20261115-008）|当前下一步（SC-20261115-009）|当前下一步（SC-20261115-010）|当前下一步（SC-20261115-012）|当前下一步（SC-20261115-013）|当前下一步（SC-20261115-019）|当前下一步（SC-20261115-020）|当前下一步（SC-20261115-021）|当前下一步（SC-20261115-022）|当前下一步（SC-20261117-001）|当前下一步（SC-20261122-001）|当前下一步（SC-20261123-001）|当前下一步（SC-20261128-001）/);
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


test('full-flow cancellation evidence distinguishes browser deadlines from device cancellation', () => {
  for (const name of ['docs/verification/2026-11-13-reference-scene.md', 'docs/verification/2026-11-13-voice-view-events.md']) {
    const section = read(name).split('## SC-20261114-001 主流程取消矩阵')[1];
    assert.ok(section);
    for (const requirement of [/27 组/, /返回手动/, /fastForward/, /180 秒/, /物理全局 Esc/, /T0 未验收、T1 未启动/]) assert.match(section, requirement);
  }
  assert.match(read('PLAN.md'), /SC-20261114-001 已补齐 27 组/);
});


test('toolchain recovery checkpoint preserves failed regression and process-only configuration boundaries',()=>{
  const path='docs/verification/2026-11-15-rust-toolchain-recovery.md';
  const evidence=read(path);
  for(const requirement of [/SC-20261115-001/,/static_bucket=static-rust-lang-org/,/SHA-256/,/RUSTUP_TOOLCHAIN=1\.100\.0/,/729 pass \/ 6 fail \/ 1 cancelled/,/10 pass \/ 3 fail/,/missing manifest/,/默认配置未重置/,/未证明负载与失败的因果/,/T0 未验收、T1 未启动/,/G1～G6 仍未验收/])assert.match(evidence,requirement);
  for(const file of ['PLAN.md','desktop/README.md','docs/verification/2026-11-14-dictation-copy-result.md'])assert.ok(read(file).includes('2026-11-15-rust-toolchain-recovery.md'),file);
  assert.match(read('PLAN.md'),/SC-20261115-001/);
});


test('control diagnostics evidence preserves failed acceptance and timing limits',()=>{
  const file='docs/verification/2026-11-15-control-subprocess-diagnostics.md';
  const evidence=read(file);
  for(const requirement of [/SC-20261115-002/,/739 pass\/4 fail/,/原 timeoutMs 均 30000/,/不证明 Node 缺陷/,/原异常/,/不读取或新增记录 args\/env\/input\/stdout\/stderr/,/根因未定位|原因未定位/,/T0 未验收、T1 未启动/])assert.match(evidence,requirement);
  for(const path of ['PLAN.md','desktop/README.md','docs/verification/2026-11-15-rust-toolchain-recovery.md'])assert.ok(read(path).includes('2026-11-15-control-subprocess-diagnostics.md'));
  for(const path of ['test/client-control.test.mjs','test/rust-host.test.mjs'])assert.match(read(path),/measuredExecFileSync as execFileSync/);
});


test('descriptor evidence distinguishes manual probe from regression and root cause',()=>{
 const evidence=read('docs/verification/2026-11-15-devnull-descriptor-probe.md');
 for(const requirement of [/SC-20261115-003/,/23723\/76/,/2033 次/,/timeout≠总墙钟期限/,/740 pass\/4 fail/,/不能断言所有超时均由此造成/,/T0 未验收、T1 未启动/,/不终止未知进程/])assert.match(evidence,requirement);
 for(const path of ['PLAN.md','desktop/README.md','docs/verification/2026-11-15-control-subprocess-diagnostics.md'])assert.ok(read(path).includes('2026-11-15-devnull-descriptor-probe.md'));
 assert.doesNotMatch(read('test/client-control.test.mjs'),/subprocess-stdio-probe|stdio:/);
});


test('environment checkpoint keeps device controls, attribution and acceptance restrictive',()=>{
 const evidence=read('docs/verification/2026-11-15-devnull-descriptor-probe.md').split('## SC-20261115-004')[1];
 assert.ok(evidence);
 for(const rule of [/15502\.646ms/,/22517\.115/,/已有 null 描述符 dup/,/系统根因仍未知/,/不能作为归责或结束进程的依据/,/18项13 pass\/5 fail/,/暂停继续堆叠诊断代码/,/重启不是已验证修复/,/T0 未验收、T1 未启动/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-004 环境阻塞检查点/);
 assert.match(read('desktop/README.md'),/SC-20261115-004/);
});


test('resource checkpoint remains observational and non-destructive',()=>{
 const evidence=read('docs/verification/2026-11-15-devnull-descriptor-probe.md').split('## SC-20261115-005')[1];
 assert.ok(evidence);
 for(const rule of [/571\.85\/571\.00\/559\.16/,/863\.45\/6387\.724/,/0\.049\/0\.002/,/top.*ps.*未完成/,/不能由上限值推导具体阻塞/,/也没有执行终止、重启、权限修改/,/SC021、T0\/T1、G1～G6均保持未验收/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-005 只读资源检查/);
 assert.match(read('desktop/README.md'),/SC-20261115-005/);
});


test('stop isolation checkpoint corrects the historical safety claim without accepting the native stage',()=>{
 const evidence=read('docs/verification/2026-11-15-control-stop-isolation.md');
 for(const rule of [/SC-20261115-006/,/临时 HOME 不能隔离/,/历史影响未核实/,/MOSS_LAUNCHCTL/,/755\/755/,/build:mac:check/,/不证明设备延迟已修复/,/SC021 整批仍未验收、T0 未验收、T1 未启动/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-006 回归恢复检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-control-stop-isolation.md'));
});


test('combined copy sampling preserves ownership, pending-frame side effects and stage limits',()=>{
 const evidence=read('docs/verification/2026-11-15-dictation-copy-composition.md');
 for(const rule of [/SC-20261115-007/,/copy-waiting/,/36条/,/canCopy.*展示信息/,/替换其 pending frame/,/不是可提交帧/,/不会自动刷新/,/TOCTOU/,/SC021 整批仍未验收、T0 未验收、T1 未启动/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-007 组合采样检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-dictation-copy-composition.md'));
});


test('copy delivery frames distinguish synchronous invalidation from real renderer acceptance',()=>{
 const evidence=read('docs/verification/2026-11-15-dictation-copy-frames.md');
 for(const rule of [/SC-20261115-008/,/144条/,/拒绝、同刻同值或抛错也失效/,/没有新增数字generation/,/ABA/,/sample\/commit不推进逻辑时钟/,/不会自行消失/,/TOCTOU/,/SC021 整批仍未验收、T0 未验收、T1 未启动/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-008 组合帧投递检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-dictation-copy-frames.md'));
});


test('single parent and tested child remain an offline delivery chain, not production acceptance',()=>{
 const evidence=read('docs/verification/2026-11-15-dictation-parent-child.md');
 for(const rule of [/SC-20261115-009/,/实际fork/,/144条/,/一槽in-flight加一槽最新queued/,/5000ms/,/SIGTERM/,/SIGKILL/,/close Promise只在实际close事件后完成/,/不制造复制执行器的stop证明/,/不是沙箱或认证边界/,/TOCTOU/,/SC021 整批仍未验收、T0 未验收、T1 未启动/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-010 消费者边界审查检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-dictation-parent-child.md'));
});


test('consumer boundary audit lists verified limits, production gaps and counterexamples without wiring',()=>{
 const evidence=read('docs/verification/2026-11-15-dictation-consumer-boundary.md');
 for(const rule of [/SC-20261115-010/,/SC-20261115-008/,/SC-20261115-009/,/一次 commit 的最新帧/,/一槽 in-flight \+ 一槽最新 queued/,/fail-closed/,/DOM\/IPC 事务/,/真实输入与 clipboard/,/单消费者认证/,/TOCTOU/,/不是沙箱或认证边界/,/不能从 ACK 推断展示已消失/,/SIGTERM/,/SC021 整批\/T0\/T1\/G1～G6/,/只做离线审查文档/,/不接真实 UI\/输入\/剪贴板/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-010 消费者边界审查检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-dictation-consumer-boundary.md'));
 // 链接检查：文档必须以相对链接引用 008/009 证据文档，且 PLAN/README 也链接到本文件
 assert.ok(evidence.includes('](2026-11-15-dictation-copy-frames.md)'), 'relative link to 008 evidence');
 assert.ok(evidence.includes('](2026-11-15-dictation-parent-child.md)'), 'relative link to 009 evidence');
 assert.ok(evidence.includes('](2026-11-14-dictation-copy-effect.md)'), 'relative link to copy effect boundary');
 assert.ok(evidence.includes('](2026-11-14-voice-coordinator-model.md)'), 'relative link to disconnected latch evidence');
 // 隐私检查：审查文档不得包含凭据/令牌/真实运行数据痕迹
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 // 未验收措辞：生产差距逐条为未实现、未验收；不得预填通过结论或把离线回归写成生产验收
 for(const rule of [/未实现、未验收/,/SC021 整批、T0、T1、G1～G6 未验收|SC021 整批、T0、T1、G1～G6 仍未验收/])assert.match(evidence,rule);
 assert.doesNotMatch(evidence,/生产接线.*验收通过|已验收完成/);
 assert.doesNotMatch(evidence,/878\/878.*生产|完整回归.*验收完成/);
});


test('renderer ack protocol design stays offline default-off with fail-closed acks and single consumer auth',()=>{
 const evidence=read('docs/verification/2026-11-15-renderer-ack-protocol.md');
 for(const rule of [/SC-20261115-012/,/SC-20261115-011/,/prepare→展示更新→确认回执/,/rendered/,/hidden-ack/,/精确三键/,/迟到回执/,/重复回执/,/陌生回执/,/fail-closed/,/唯一身份绑定/,/退役不可逆/,/冒充/,/不接真实 UI、输入、剪贴板或任何服务/,/enabled` 非真/,/不能从 `rendered` 回执推断/,/SC021 整批、T0、T1、G1～G6 保持未验收/,/未实现、未验收/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-012 renderer 回执协议检查点/);
 assert.ok(read('PLAN.md').includes('2026-11-15-renderer-ack-protocol.md'));
 assert.ok(read('desktop/README.md').includes('2026-11-15-renderer-ack-protocol.md'));
 assert.ok(evidence.includes('](2026-11-15-dictation-consumer-boundary.md)'), 'relative link to consumer boundary audit');
 // 隐私检查：设计文档不得包含凭据样式或真实运行数据痕迹
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 // 不得预填通过结论或把离线专项写成生产/真机验收
 assert.doesNotMatch(evidence,/生产接线.*验收通过|已验收完成|真机验收通过/);
});


test('input/clipboard wiring readiness stays an evaluation without any real wiring or permission grants',()=>{
 const evidence=read('docs/verification/2026-11-15-wiring-input-clipboard-readiness.md');
 for(const rule of [/SC-20261115-013/,/差距清单第 2 条/,/TOCTOU/,/handoffAt/,/checkedAt/,/not-written/,/unknown/,/未实现、未验收/,/NSPasteboard|pbcopy/,/CGEvent/,/辅助功能\/输入监控/,/不自动替用户授予|不自动授予|不自动授权/,/T0/,/T1/,/G1～G6/,/不能从 `allowed=true` 推断/,/只读引用/,/正文最小化/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-013 接线准备评估检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-wiring-input-clipboard-readiness.md'));
 assert.ok(evidence.includes('](2026-11-14-dictation-copy-effect.md)'), 'relative link to copy effect boundary');
 assert.ok(evidence.includes('](2026-11-15-dictation-consumer-boundary.md)'), 'relative link to consumer boundary audit');
 assert.ok(evidence.includes('](2026-11-15-renderer-ack-protocol.md)'), 'relative link to renderer ack protocol');
 // 隐私检查
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 // 不得预填通过结论
 assert.doesNotMatch(evidence,/真机验收通过|生产接线.*验收通过|已验收完成/);
});


test('timer/listener and fork readiness stays an evaluation without real listeners or production forks',()=>{
 const evidence=read('docs/verification/2026-11-15-wiring-timer-fork-readiness.md');
 for(const rule of [/SC-20261115-013/,/差距清单第 4 条/,/第 5 条/,/sourceTtl/,/逻辑单位/,/无自动活性检测/,/watchdog/,/5000ms/,/SIGTERM/,/SIGKILL/,/close Promise/,/未实现、未验收/,/锁屏/,/休眠唤醒/,/不自动重启|不自动复活/,/runtimeEngine/,/T0/,/T1/,/G1～G6/,/不能从测试 fork 通过推断生产 fork 可用/,/只读引用/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-013 接线准备评估检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-wiring-timer-fork-readiness.md'));
 assert.ok(evidence.includes('](2026-11-14-dictation-source-lease.md)'), 'relative link to source lease model');
 assert.ok(evidence.includes('](2026-11-15-dictation-parent-child.md)'), 'relative link to parent child evidence');
 assert.ok(evidence.includes('](2026-11-15-renderer-ack-protocol.md)'), 'relative link to renderer ack protocol');
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 assert.doesNotMatch(evidence,/真机验收通过|生产接线.*验收通过|已验收完成/);
});


test('executor recheck and timing/fork constraint models stay offline default-off readiness models',()=>{
 const evidence=read('docs/verification/2026-11-15-wiring-recheck-timing-models.md');
 for(const rule of [/SC-20261115-019/,/SC-20261115-013/,/差距清单第 2 条/,/第 4\/5 条/,/TOCTOU/,/observedAt === now/,/not-written/,/unknown/,/等待不排队|等待不排队|waitsRecorded/,/单调逻辑时钟|单调时钟/,/clock-rewound/,/不自动复活/,/watchdog/,/close-before-kill/,/watchdogMs/,/forkGraceMs/,/默认关闭/,/不接真实 UI、输入设备、剪贴板、系统监听、权限或生产 fork/,/未实现、未验收/,/SC021 整批、T0、T1、G1～G6 保持未验收/,/macOS 正常授权流程/,/不能从边界复查通过推断写入成功/,/15\/15/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-019 接线准备模型检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-wiring-recheck-timing-models.md'));
 assert.ok(evidence.includes('](2026-11-15-dictation-consumer-boundary.md)'), 'relative link to consumer boundary audit');
 assert.ok(evidence.includes('](2026-11-14-dictation-copy-effect.md)'), 'relative link to copy effect boundary');
 assert.ok(evidence.includes('](2026-11-15-wiring-input-clipboard-readiness.md)'), 'relative link to input clipboard readiness');
 assert.ok(evidence.includes('](2026-11-15-wiring-timer-fork-readiness.md)'), 'relative link to timer fork readiness');
 // 两个模型与专项测试必须存在于仓库且默认关闭
 for(const path of ['test-helpers/dictation-executor-recheck-model.mjs','test-helpers/dictation-timing-fork-constraint-model.mjs','test/dictation-executor-recheck-model.test.mjs','test/dictation-timing-fork-constraint-model.test.mjs'])assert.ok(read(path).length>0);
 assert.match(read('test-helpers/dictation-executor-recheck-model.mjs'),/enabled = false/);
 assert.match(read('test-helpers/dictation-timing-fork-constraint-model.mjs'),/enabled = false/);
 // 模型源码保持离线：无 OS/进程/timer/真实时钟依赖
 for(const path of ['test-helpers/dictation-executor-recheck-model.mjs','test-helpers/dictation-timing-fork-constraint-model.mjs']){
  const source=read(path);
  for(const banned of [/NSPasteboard/,/pbcopy/,/CGEvent/,/child_process/,/setTimeout|setInterval/,/Date\.now/,/performance\.now/,/process\.kill/])assert.doesNotMatch(source,banned);
 }
 // 隐私检查
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 // 不得预填通过结论
 assert.doesNotMatch(evidence,/真机验收通过|生产接线.*验收通过|已验收完成/);
});

test('single-instance and data-safety model stays offline default-off readiness model',()=>{
 const evidence=read('docs/verification/2026-11-15-single-instance-model.md');
 for(const rule of [/SC-20261115-020/,/单实例互斥认领/,/fail-closed/,/contended/,/不可逆/,/不存在 unretire|无 unretire/,/白名单/,/encrypted-record/,/精确匹配/,/不建新文件|不建新目录/,/API 不含任何内容参数|无内容参数/,/默认关闭/,/不接真实文件系统、剪贴板、输入注入、系统监听、进程、timer 或生产接线/,/未实现、未验收/,/SC021 整批、T0、T1、G1～G6 仍未验收/,/不能从 claim 通过推断系统级单实例成立/,/7\/7/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-020 单实例与数据安全离线检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-single-instance-model.md'));
 assert.ok(evidence.includes('](2026-11-15-wiring-recheck-timing-models.md)'), 'relative link to prior readiness evidence');
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 assert.doesNotMatch(evidence,/真机验收通过|生产接线.*验收通过|已验收完成/);
 // 模型与专项测试必须存在且默认关闭、保持离线
 for(const path of ['test-helpers/dictation-single-instance-model.mjs','test/dictation-single-instance-model.test.mjs'])assert.ok(read(path).length>0);
 const source=read('test-helpers/dictation-single-instance-model.mjs');
 assert.match(source,/enabled = false/);
 for(const banned of [/NSPasteboard/,/pbcopy/,/CGEvent/,/child_process/,/setTimeout|setInterval/,/Date\.now/,/performance\.now/,/process\.kill/,/launchctl/,/osascript/,/readFile|writeFile/])assert.doesNotMatch(source,banned);
});

test('wiring chain composition test stays offline and reuses models unchanged',()=>{
 const evidence='test/dictation-wiring-chain.test.mjs';
 const src=read(evidence);
 assert.ok(src.length>0);
 assert.match(src,/SC-20261115-021/);
 assert.match(src,/DictationPresentationController/);
 assert.match(src,/DictationRendererAckProtocol/);
 assert.match(src,/DictationExecutorRecheckModel/);
 assert.match(src,/DictationTimingForkModel/);
 // 未修改既有模型：链路测试只导入组合，不重新实现
 for(const banned of [/NSPasteboard/,/pbcopy/,/CGEvent/,/osascript/,/launchctl/])assert.doesNotMatch(src,banned);
 assert.match(read('PLAN.md'),/SC-20261115-021 接线准备链路组合检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-wiring-chain.md'));
 assert.ok(read('docs/verification/2026-11-15-wiring-chain.md').includes('](2026-11-15-wiring-recheck-timing-models.md)'),'relative link to prior evidence');
});

test('single-instance and wiring-chain summary doc links, privacy and unaccepted wording',()=>{
 const evidence=read('docs/verification/2026-11-15-single-instance-wiring-chain.md');
 for(const rule of [/SC-20261115-020/,/SC-20261115-021/,/已验证边界/,/生产差距/,/不可推断事实/,/单实例互斥认领/,/fail-closed/,/退役不可逆|不存在 unretire/,/白名单/,/fail-closed 整链|整链 fail-closed/,/不穿越新一代/,/默认关闭/,/不接真实 UI、剪贴板、输入注入、系统监听、文件系统、进程、timer 或生产接线/,/未实现、未验收/,/SC021 整批、T0、T1、G1～G6 仍未验收/,/macOS 用户正常授权流程/,/不能从 claim 通过推断系统级单实例成立/,/不能从专项\/回归全绿推断验收完成/])assert.match(evidence,rule);
 assert.match(read('PLAN.md'),/SC-20261115-022 文档汇总同步检查点/);
 for(const path of ['PLAN.md','desktop/README.md'])assert.ok(read(path).includes('2026-11-15-single-instance-wiring-chain.md'));
 assert.ok(evidence.includes('](2026-11-15-single-instance-model.md)'),'relative link to SC-020 evidence');
 assert.ok(evidence.includes('](2026-11-15-wiring-chain.md)'),'relative link to SC-021 evidence');
 assert.ok(evidence.includes('](2026-11-15-wiring-recheck-timing-models.md)'),'relative link to SC-019 evidence');
 for(const forbidden of [/api[_-]?key/i,/token\s*[:=]/i,/password/i,/secret/i,/Bearer /,/sk-/])assert.doesNotMatch(evidence,forbidden);
 assert.doesNotMatch(evidence,/真机验收通过|生产接线.*验收通过|已验收完成/);
});

test('installed T0 probe bundle stays isolated and coexists with the installed product',()=>{
 assert.match(read('PLAN.md'),/MOSS T0 Probe\.app/);
 assert.match(read('desktop/README.md'),/SC-20261117-001/);
 const probe=read('test/desktop-probe.test.mjs');
 for(const rule of [/bundle\.active, true/,/'app'\]/,/'dev\.starcore\.moss\.t0-probe'/,/app\.windows, \[\]/])assert.match(probe,rule);
});


test('T0 manual entry points separate a verified app bundle from CLI dev', () => {
  const sheet = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  assert.match(sheet, /^open -a "\/Applications\/MOSS T0 Probe\.app" --args --diagnostic-controls$/m);
  assert.match(sheet, /^open -a "\/Applications\/MOSS T0 Probe\.app"$/m);
  for (const rule of [/SC-20261117-003/, /dev\.starcore\.moss\.t0-probe/, /codesign --verify --deep --strict/,
    /shasum -a 256/, /构建来源/, /只有开发版.*Ctrl\+C/, /不要并行运行/, /350 ms/, /参考动效：未测/]) {
    assert.match(sheet, rule);
  }
});

test('post-fix T0 checkpoint preserves the per-mode evidence and does not mark acceptance', () => {
  const path = 'docs/verification/2026-11-22-tauri-t0-retest.md';
  const evidence = read(path);
  const rows = [...evidence.matchAll(/^\| ((?:D|P)0\d|参考动效) \| (诊断|默认) \| [^|]+ \| [^|]+ \| (未测|通过|失败) \|$/gm)];
  const ids = ['D01', 'D02', 'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', '参考动效'];
  assert.deepEqual(rows.map(([, id, mode, verdict]) => [id, mode, verdict]),
    ids.map(id => [id, id.startsWith('D') ? '诊断' : '默认', '未测']));
  for (const rule of [/3cab5c4dfbd31bfa2e7b287f0680d924847b6ece/, /Operation not permitted/, /AXIsProcessTrusted/, /没有发送点击或按键/,
    /既有证据/, /本轮工程检查/, /未复现/, /解除条件/, /不使用诊断信号/, /T0 仍未验收，T1 未启动/]) assert.match(evidence, rule);
  assert.doesNotMatch(evidence, /真机验收通过|T0 已验收/);
  for (const filename of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-12-tauri-t0.md',
    'docs/verification/2026-11-12-tauri-t0-manual.md', 'operatelog.md']) {
    assert.ok(read(filename).includes('2026-11-22-tauri-t0-retest.md'), `${filename} must point to the retest evidence`);
  }
  assert.match(read('PLAN.md'), /^- \[ \] T0 /m);
  assert.match(read('PLAN.md'), /^- \[ \] T1 /m);
});


test('round 3 T0 preflight keeps installation, isolated bundle and desktop verdicts separate', () => {
  const path = 'docs/verification/2026-11-23-tauri-t0-round3-preflight.md';
  const evidence = read(path);
  for (const link of ['2026-11-22-tauri-t0-retest.md', '2026-11-12-tauri-t0-manual.md']) {
    assert.ok(evidence.includes(`](${link})`));
    assert.ok(existsSync(resolve(root, dirname(path), link)));
  }
  for (const rule of [/安装副本整包未通过.*codesign --verify --deep --strict --verbose=2.*退出 1/,
    /dev\.starcore\.moss\.t0-probe/, /3cab5c4dfbd31bfa2e7b287f0680d924847b6ece/,
    /隔离构建记录/, /--bundles app --ci --no-sign -- --locked --offline/,
    /隔离包整包通过（未安装、未启动）/, /codesign --force --sign -.*退出 0/,
    /整包\*\*严格校验退出 0/, /可执行文件 `[a-f0-9]{64}`/,
    /Aqua/, /AXIsProcessTrusted/, /无法确认会话安全空闲/, /没有截图或发送输入/,
    /D01～D02、P01～P08 和参考动效均未测/, /T0 仍未验收，T1 未启动/, /开发版须独立记录/]) {
    assert.match(evidence, rule);
  }
  assert.doesNotMatch(evidence, /T0 已验收|真机验收通过/);
  assert.match(read('PLAN.md'), /历史预检（SC-20261123-001）/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
  for (const file of ['PLAN.md', 'operatelog.md']) assert.ok(read(file).includes(path));
});

test('round 3 desktop gap ledger has separate source and mode verdicts without accepting T0', () => {
  const path = 'docs/verification/2026-11-12-tauri-t0-manual.md';
  const ledger = read(path).split('## 第 3 轮实际门槛与逐项未测记录（SC-20261123-003）')[1]?.split('\n## ')[0];
  assert.ok(ledger);
  assert.match(ledger, /\| 隔离打包·诊断 \| 开发版·诊断 \| 隔离打包·默认 \| 开发版·默认 \|/);
  const labels = ['D01 托盘、按钮、失焦｜优先', 'P01 默认托盘与页面｜优先', 'D02 输入、四效果与逐次 Esc',
    'P02 四效果与逐次 Esc', 'P03 临时热键及实际冲突', 'P04 外部焦点', 'P05 鼠标穿透', 'P06 Esc 与关闭热键释放',
    'P07 正常退出、同源默认重开', 'P08 双屏/不同缩放', 'P08 全屏', 'P08 Spaces', 'P08 自然睡眠恢复',
    '原生 WKWebView 参考：配色/形状', '原生 WKWebView 参考：逐状态入场/切换/隐藏',
    '原生 WKWebView 参考：透明/裁切', '原生 WKWebView 参考：时序/帧节奏/性能'];
  const rows = [...ledger.matchAll(/^\| ((?:D0|P0|原生 WKWebView)[^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| [^|]+ \|$/gm)];
  assert.deepEqual(rows.map(([, label, ...verdicts]) => [label, ...verdicts.map(value => value.trim())]),
    labels.map(label => [label, ...(label.startsWith('D') ? ['未测', '未测', '—', '—'] : ['—', '—', '未测', '未测'])]));
  for (const requirement of [/真机判定：未通过/, /隔离打包制品.*退出 0/, /安装副本.*退出 1/, /开发版.*没有启动 CLI/,
    /受保护工具/, /无 PID 或实际可执行路径/, /未发送输入、未截图/, /P01\/D01/, /超过 350 ms/, /不是 P07/]) {
    assert.match(ledger, requirement);
  }
  assert.doesNotMatch(ledger, /T0 已验收|真机验收通过/);
  assert.match(read('PLAN.md'), /SC-20261123-003.*34 个适用单元格均未测/);
  for (const id of [0, 1]) assert.match(read('PLAN.md'), new RegExp(`^- \\[ \\] T${id} `, 'm'));
});

test('round 4 T0 dev compilation does not grant runtime or desktop acceptance', () => {
  const manual = 'docs/verification/2026-11-12-tauri-t0-manual.md';
  const id = 'SC-20261123-004';
  const text = read(manual);
  const delta = text.split(`## 第 4 轮开发制品与真机差距（${id}）`)[1]?.split('\n## ')[0];
  assert.ok(delta, 'record the new dev artifact separately from the historical matrix');
  for (const rule of [
    /3cab5c4dfbd31bfa2e7b287f0680d924847b6ece/, /Cargo\.lock/, /package-lock\.json/,
    /cargo build .*--target aarch64-apple-darwin --no-default-features --locked --offline/,
    /dev-profile\.exit.*退出 0/, /8fc7b043d86ff72279ca75dc36a57f88c3749e63b1d0bacd151ee5c31bfb83f0/,
    /custom-protocol.*不能代填/, /未启动 CLI dev/, /实际 PID.*可执行路径.*哈希/,
    /安装副本.*退出 1/, /安全空闲.*专用会话/, /状态项.*窗口.*外部专用测试目标.*焦点.*取消/,
    /17 行、34 个适用单元格均未测/, /P01\/D01/, /超过 350 ms/, /原生 WKWebView.*未测/,
    /voice-glow@0\.3\.0.*Pro/, /本地文字入场/, /T0 仍未验收，T1 未启动/,
  ]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0 已验收|真机验收通过|CLI dev 已启动/);
  assert.match(text, /\]\(#第-4-轮开发制品与真机差距sc-20261123-004\)/);
  assert.match(read('PLAN.md'), new RegExp(`${id}.*${manual}#.*34 个适用单元格均未测`));
  for (const stage of [0, 1]) assert.match(read('PLAN.md'), new RegExp(`^- \\[ \\] T${stage} `, 'm'));
  const log = read('operatelog.md').split(`## ${id} `)[1]?.split('\n## ')[0];
  assert.match(log, /北京时间：2026-11-23 \d{2}:\d{2}:\d{2} \+08:00/);
  assert.match(log, /本条所在提交.*docs: \[SC-20261123-004\] record isolated T0 dev build and acceptance gap/);
});

test('round 6 T0 delivery records the recovered push while all desktop cells stay untested', () => {
  const manual = 'docs/verification/2026-11-12-tauri-t0-manual.md';
  const id = 'SC-20261124-001';
  const heading = `第 6 轮补推与真机门槛复查（${id}）`;
  const anchor = '#第-6-轮补推与真机门槛复查sc-20261124-001';
  const sheet = read(manual);
  const delta = sheet.split(`## ${heading}`)[1]?.split('\n## ')[0];
  assert.ok(delta, 'record the round 6 delta after the historical matrix');
  assert.ok(sheet.includes(`](${anchor})`));
  for (const requirement of [
    /SC-20261123-004.*git push.*退出 0/,
    /git ls-remote.*退出 0.*ec4e06fe67b76f6bca93950370fe5db3fefdc65b/,
    /17 项、34 个适用格.*通过 0.*产品行为失败 0.*未测 34/,
    /隔离打包.*实际 CLI dev.*诊断.*默认/,
    /专用 Aqua 会话.*安全空闲/,
    /状态项.*窗口.*外部专用测试目标.*焦点.*取消/,
    /实际 PID.*路径.*签名.*哈希/, /界面退出未测.*CLI 终止不适用.*清理动作 0/,
    /P01\/D01.*4 个首测格.*超过 350 ms/, /T0 仍未验收，T1 未启动/,
  ]) assert.match(delta, requirement);
  assert.doesNotMatch(delta, /T0 已验收|真机验收通过|CLI dev 已启动/);
  const plan = read('PLAN.md');
  assert.ok(plan.includes(`](${manual}${anchor})`));
  for (const stage of [0, 1]) assert.match(plan, new RegExp(`^- \\[ \\] T${stage} `, 'm'));
  const log = read('operatelog.md').split(`## ${id} `)[1]?.split('\n## ')[0];
  assert.ok(log?.includes(`](${manual}${anchor})`));
  assert.match(log, /北京时间：2026-11-24 \d{2}:\d{2}:\d{2} \+08:00/);
  assert.match(log, /本条所在提交.*docs: \[SC-20261124-001\] record T0 round 6 delivery and desktop gate evidence/);
});

test('diagnostic desktop evidence keeps keyboard failures separate from observed input and exit', () => {
  const manual = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  const delta = manual.split('## 诊断模式桌面操作增量（SC-20261124-004）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const requirement of [/仅适用于临时bundle诊断模式/, /T0-input-123/, /退出验证壳/, /精确进程查询无匹配/, /Escape.*仍有在屏浮层/, /Cmd\+Shift\+F8.*未出现浮层/, /原因尚未定位|尚不能确定/, /T0仍未验收，T1未启动/]) {
    assert.match(delta, requirement);
  }
  assert.doesNotMatch(delta, /全局按键验收通过|T0已验收|默认模式验收通过/);
});

test('physical keyboard evidence distinguishes the tested bundle and modes from outstanding T0 coverage', () => {
  const manual = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  const delta = manual.split('## 物理按键与默认模式核心交互（SC-20261124-007）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const requirement of [/提交8e48475/, /诊断模式/, /默认模式/, /用户实际按键/, /原生回调仍为0/, /历史与外点/, /四种效果/, /逐帧视觉与性能未测/, /实际CLI dev仍分别待测/, /T0未验收，T1未启动/]) assert.match(delta, requirement);
  assert.doesNotMatch(delta, /T0已验收|全平台验收通过/);
});

test('CI keeps both full native jobs on the supported pinned macOS runner', () => {
  const workflow = read('.github/workflows/check.yml');
  const runners = [...workflow.matchAll(/^\s+runs-on:\s*(\S+)/gm)].map(match => match[1]);
  assert.deepEqual(runners, ['macos-15-intel', 'macos-15-intel']);
  assert.equal((workflow.match(/- run: npm test\b/g) || []).length, 2);
  assert.match(workflow, /RUSTUP_TOOLCHAIN: '1\.100\.0'/);
  assert.match(workflow, /- run: npm run build:mac:check/);
  assert.equal((workflow.match(/- run: npm run build:hud\s+- run: npm test/g) || []).length, 2);
  assert.equal((workflow.match(/"\$HOME\/\.cargo\/bin\/cargo" --version/g) || []).length, 2);
});


test('default-mode retest records separate user confirmations without completing T0', () => {
  const manual = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  const delta = manual.split('## 默认模式分项复测（SC-20261124-011）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const requirement of [/SC007同一临时制品/, /Cmd\+Shift\+F8显示\/收起正常/, /Esc关闭正常/, /设置页退出按钮正常/, /精确进程查询无匹配/, /用户实际按键/, /完整重开生命周期未测/, /T0未验收，T1未启动/]) assert.match(delta, requirement);
  assert.doesNotMatch(delta, /T0已验收|全平台验收通过/);
  assert.match(read('PLAN.md'), /SC-20261124-011 默认模式快捷键与退出复测/);
});


test('external input sampling does not substitute for physical hotkeys and full-screen acceptance', () => {
  const manual = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  const delta = manual.split('## 外部输入与全屏采样（SC-20261124-012）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const requirement of [/P04保持未完成/, /不将P05整项勾选通过/, /物理全局Esc/, /overlay仍在/, /这是清理，不是P07退出验收/, /自然睡眠恢复仍未测/, /T0未验收，T1未启动/]) assert.match(delta, requirement);
  assert.doesNotMatch(delta, /T0已验收|全屏验收通过|鼠标穿透验收通过/);
  assert.match(read('PLAN.md'), /P04\/P05\/P06\/P08仍未完成/);
  const physical = manual.split('## 全屏物理按键与焦点对照（SC-20261124-013）')[1]?.split('\n## ')[0];
  assert.ok(physical);
  for (const requirement of [/鼠标点击文稿空白处/, /不点击鼠标继续输入/, /真实截图/, /物理Esc仅关闭浮层/, /根因未证实/, /不据本次通过修改焦点代码/, /不是鼠标穿透完整验收/, /T0未验收，T1未启动/]) assert.match(physical, requirement);
  assert.doesNotMatch(physical, /T0已验收|全平台验收通过|已确认根因是未聚焦/);
  assert.match(read('PLAN.md'), /SC-20261124-013 全屏物理按键与焦点对照/);

});

test('current manual input and Escape feedback stays bounded by screenshot and runtime identity', () => {
  const manual = read('docs/verification/2026-11-12-tauri-t0-manual.md');
  const delta = manual.split('## 本轮输入与 Esc 手工反馈（SC-20261126-002）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/dirty=false/, /输入保持和 Esc 关闭反馈通过/, /需重新附加/, /运行PID\/路径未独立核实/, /不等于实际运行进程身份已核实/, /截图原文件、聊天原文不提交/, /按鼠标所在屏定位/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|混合DPI通过|运行身份已核实/);
  assert.match(read('PLAN.md'), /SC-20261126-002 手工反馈检查点/);
});

test('pointer-display feedback does not certify DPI, mouse passthrough or runtime identity', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 按鼠标所在屏显示与输入反馈（SC-20261126-003）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/用户手工确认的目标屏选择及输入保持分项通过/, /没有新增截图或工具观测/, /运行PID\/路径未独立核实/, /显示大小未明确确认/, /混合DPI\/620×440逻辑尺寸未验收/, /输入成功不等于鼠标穿透通过/, /插入点确实改变/, /圆环与字幕覆盖区域分别检查/, /不使用提交、删除、付款按钮/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|全平台验收通过/);
  assert.match(read('PLAN.md'), /SC-20261126-003 当前手测下一步/);
});

test('click-through feedback keeps region coverage and restart acceptance pending', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 点击穿透手工反馈（SC-20261126-004）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/点击穿透用户反馈通过/, /没有新增截图或工具观测/, /不推断两个区域均逐一完成/, /运行PID\/路径未独立核实/, /显示大小及混合DPI仍未明确确认/, /临时测试热键默认关闭/, /不要启动旧安装副本或退出旧沐言/, /仅图标消失不能证明/, /退出重开尚未执行/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|重开验收通过/);
  assert.match(read('PLAN.md'), /SC-20261126-004 当前手测进展/);
});

test('reopen feedback preserves the still-running process and lifecycle uncertainty', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 重开退出反馈及进程复查（SC-20261126-005）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/--verify 成功/, /精确app路径打开/, /用户报告的打开\/退出行为正常/, /热键默认关闭、隐藏启动和应用级退出方式未明确确认/, /仍读到PID 61072/, /不能记录进程已退出/, /不能据此判断退出按钮失效/, /未终止或重启/, /不强制睡眠/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|生命周期验收通过/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});

test('Spaces display feedback does not certify independent Spaces settings or DPI', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 桌面切换显示与残留反馈（SC-20261126-006）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/桌面切换显示及无残留的用户反馈通过/, /没有新增截图或工具观测/, /未逐项重述输入、Esc或桌面编号/, /未核实“显示器具有单独的空间”/, /不新增进程查询结论/, /不以“正常显示”推断精确620×440/, /不强制睡眠/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|全部环境验收通过/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});

test('settings exit and fresh PID evidence does not certify default-off UI or all resource cleanup', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 设置退出与同包重启进程核验（SC-20261126-007）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/用户明确确认点击设置页退出/, /NO_EXACT_PROBE_PATH_MATCH/, /没有通过kill代替退出/, /--verify 复核成功/, /PID 42673/, /此前PID 61072不同/, /不证明全部WebKit子进程/, /默认关闭和重启后交互尚未实际确认/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|全部资源已释放/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});

test('restart default-state feedback does not certify OS registration or re-enabled interaction', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 重启隐藏浮层与热键默认关闭反馈（SC-20261126-008）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/隐藏浮层启动与热键默认关闭的用户反馈通过/, /没有新增截图或工具观测/, /不证明系统层未注册任何快捷键/, /不推断所有窗口均隐藏/, /不新增当前PID/, /重启后显式启用交互尚未确认/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|完整生命周期已通过/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});

test('re-enabled shortcut feedback closes one cycle only and leaves tray edges pending', () => {
  const delta = read('docs/verification/2026-11-12-tauri-t0-manual.md').split('## 重启后显式启用热键反馈（SC-20261126-009）')[1]?.split('\n## ')[0];
  assert.ok(delta);
  for (const rule of [/唤出\/收起交互的用户反馈通过/, /没有新增截图或工具观测/, /不新增当前PID核验结论/, /一次设置退出→同包重开→默认关闭→显式启用交互/, /不代表反复启动、崩溃恢复、全部资源释放/, /等待一秒/, /不覆盖350毫秒保护期/, /T0未验收，T1未启动/]) assert.match(delta, rule);
  assert.doesNotMatch(delta, /T0已验收|完整生命周期已通过/);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});

test('whole Beam panels track user scope and keep browser and physical acceptance distinct', () => {
  const doc = read('docs/verification/2026-11-28-beam-panels.md');
  for (const rule of [/SC-20261128-001/, /https:\/\/libraries.dev\/beam/, /border-beam@1.4.1/, /每个窗口仅一个Beam/, /220×160/, /当前执行多次超时/, /未安装或切换用户当前探针/, /T0未验收，T1未启动/]) assert.match(doc, rule);
  assert.match(read('PLAN.md'), /当前下一步（SC-20261128-001）/);
});
