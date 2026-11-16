import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(resolve(root,name),'utf8');
const files=['docs/verification/2026-11-14-voice-coordinator-model.md','docs/verification/2026-11-14-voice-adapter-contract.md','docs/verification/2026-11-12-tauri-t0-manual.md','README.md','AGENTS.md','operatelog.md','PLAN.md','docs/superpowers/specs/2026-11-01-global-dictation-design.md','docs/verification/2026-11-01-dictation-integration.md','docs/superpowers/specs/2026-11-02-moss-design.md','docs/verification/2026-11-02-moss.md','docs/troubleshooting/macos-permissions.md','design-qa.md','docs/verification/2026-11-09-reminder.md','docs/superpowers/specs/2026-11-12-voice-first-ui-redesign.md','docs/superpowers/specs/2026-11-12-tauri2-rust-migration.md'];

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
  assert.match(read('PLAN.md'), /当前下一步（SC-20261113-001）|当前下一步（SC-20261113-005）|当前下一步（SC-20261113-007）|当前下一步（SC-20261113-008）|当前下一步（SC-20261113-010）|当前下一步（SC-20261113-011）|当前下一步（SC-20261113-012）|当前下一步（SC-20261113-013）|当前下一步（SC-20261113-014）|当前下一步（SC-20261113-015）|当前下一步（SC-20261113-016）|当前下一步（SC-20261113-017）|当前下一步（SC-20261113-018）|当前下一步（SC-20261113-019）|当前下一步（SC-20261113-020）|当前下一步（SC-20261114-001）|当前下一步（SC-20261114-002）|当前下一步（SC-20261114-003）|当前下一步（SC-20261114-004）|当前下一步（SC-20261114-005）|当前下一步（SC-20261114-006）|当前下一步（SC-20261114-007）|当前下一步（SC-20261114-008）|当前下一步（SC-20261114-009）|当前下一步（SC-20261114-010）|当前下一步（SC-20261114-011）|当前下一步（SC-20261114-012）|当前下一步（SC-20261114-013）|当前下一步（SC-20261114-014）|当前下一步（SC-20261114-015）|当前下一步（SC-20261114-016）|当前下一步（SC-20261114-017）|当前下一步（SC-20261114-018）|当前下一步（SC-20261114-019）|当前下一步（SC-20261114-020）|当前下一步（SC-20261114-021）|当前下一步（SC-20261115-001）|当前下一步（SC-20261115-002）|当前下一步（SC-20261115-003）|当前下一步（SC-20261115-004）|当前下一步（SC-20261115-005）|当前下一步（SC-20261115-006）|当前下一步（SC-20261115-007）|当前下一步（SC-20261115-008）|当前下一步（SC-20261115-009）|当前下一步（SC-20261115-010）|当前下一步（SC-20261115-012）|当前下一步（SC-20261115-013）|当前下一步（SC-20261115-019）/);
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
