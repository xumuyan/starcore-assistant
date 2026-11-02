import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assistantDefaults, extractWake, WakeSession, validateSettings, explicitCodex } from '../src/assistant-core.mjs';
import { AssistantService } from '../src/assistant-service.mjs';
import { DatabaseSync } from 'node:sqlite';
import { projectThread, selectedProject, projectContext, isProjectQuestion } from '../src/assistant-project.mjs';
import { requests } from '../src/remote-store.mjs';

function harness(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const emitted = [];
  return { dir, emitted, service: new AssistantService({ dir, emit: x => emitted.push(x), asr: {}, ...options }) };
}
test('wake word is configurable, prefix only, and session expires', () => {
  assert.equal(extractWake('贾维斯，帮我看代码。', '贾维斯'), '帮我看代码。');
  assert.equal(extractWake('小 助 手，早上好', '小助手'), '早上好');
  assert.equal(extractWake('我在讨论贾维斯', '贾维斯'), null);
  assert.equal(extractWake('Jarvis, hello', 'JARVIS'), 'hello');
  let now = 0; const wake = new WakeSession(() => now);
  assert.equal(wake.accept('今天做什么', '小助手'), null);
  assert.equal(wake.accept('小助手', '小助手').text, '');
  now = 44000; assert.equal(wake.accept('继续讨论', '小助手').text, '继续讨论');
  now = 90000; assert.equal(wake.accept('继续讨论', '小助手'), null);
});
test('settings separate name and wake phrase; reject invalid providers and targets', () => {
  assert.equal(validateSettings({ name: '星期五' }).wakeWord, 'MOSS');
  assert.throws(() => validateSettings({ wakeWord: '' }));
  assert.throws(() => validateSettings({ wakeWord: '！！！' }));
  assert.throws(() => validateSettings({ target: 'wrong' }));
  assert.throws(() => validateSettings({ voice: 'unknown' }));
  assert.equal('deepseekKey' in validateSettings({ deepseekKey: 'secret' }), false);
  assert.equal(explicitCodex('让 Codex 帮我修复登录'), '帮我修复登录');
  assert.equal(explicitCodex('你认为 Codex 怎么样'), null);
});
test('unawakened audio never enters chat or network', async t => {
  const { service, emitted } = harness(t, { asr: { transcribe: async () => '电视正在播放新闻' }, fetchRequest: () => assert.fail('network called') });
  service.asrReady = true; service.listening = true;
  await service.audio('fixture'); assert.equal(service.history.length, 0);
  assert.equal(emitted.some(x => x.type === 'message'), false);
});
test('wake-only audio gives a cue without a cloud call', async t => {
  const { service, emitted } = harness(t, { asr: { transcribe: async () => 'MOSS。' }, fetchRequest: () => assert.fail('network called') });
  service.asrReady = true; service.listening = true;
  await service.audio('fixture'); assert.equal(emitted.some(x => x.type === 'earcon'), true);
});
test('cancelled HTTP reply cannot appear, speak, or overwrite a newer request', async t => {
  let resolve; const { service, emitted } = harness(t, { fetchRequest: () => new Promise(r => { resolve = r; }) });
  service.keys = { yunqiao: 'not-a-real-key' };
  const pending = service.text('你好'); service.cancel();
  resolve({ ok: true, json: async () => ({ output_text: 'stale' }) });
  await pending;
  assert.equal(emitted.some(x => x.content === 'stale' || x.type === 'speak'), false);
  assert.equal(service.busy, false);
});
test('dialogue stores text privately and does not expose credentials in events', async t => {
  const { service, emitted, dir } = harness(t, { fetchRequest: async (url, options) => {
    assert.equal(url, 'https://api.yunqiao.me/v1/responses');
    assert.equal(JSON.parse(options.body).input.at(-1).content, '你好');
    return { ok: true, json: async () => ({ output_text: '你好，我在。' }) };
  } });
  service.keys = { yunqiao: 'test-secret' }; await service.text('你好');
  assert.equal(emitted.some(x => x.type === 'speak'), true);
  assert.equal(JSON.stringify(emitted).includes('test-secret'), false);
  assert.equal(service.memory.context().at(-1).content, '你好，我在。');
  assert.equal(readFileSync(join(dir, 'assistant/conversations.sqlite')).includes(Buffer.from('你好，我在。')), false);
});
test('Codex target freezes at receipt and uncertain submission never auto-retries', async t => {
  let target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; let count = 0;
  const { service, emitted, dir } = harness(t, {
    getLatest: () => ({ threadId: target }),
    getThread: (database, id) => ({ id, cwd: '/tmp/project-a' }),
    submit: async (binary, thread, text) => {
      count++; target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      assert.equal(thread.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      assert.equal(text, '保留这个原聊天');
      assert.equal(requests(dir)[0].status, 'submitting');
      return { status: 'uncertain', detail: '回执超时，不自动重发' };
    }
  });
  writeFileSync(join(dir, 'runtime-settings.json'), JSON.stringify({ codex: '/test/codex' }));
  service.config={...service.config,target};
  await service.text('让 Codex 保留这个原聊天');
  assert.equal(count, 1); assert.equal(requests(dir)[0].status, 'uncertain');
  assert.equal(requests(dir)[0].threadId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(emitted.some(x => x.content?.includes('不自动重发')), true);
});
test('missing Codex target cannot submit to an arbitrary conversation', async t => {
  const { service, emitted } = harness(t, { getLatest: () => null, submit: () => assert.fail('submitted') });
  await service.text('改一行代码', 'codex');
  assert.equal(emitted.some(x => x.type === 'error' && x.message.includes('选择')), true);
});
test('missing Fish credential falls back to system voice without failing text reply', async t => {
  const { service, emitted } = harness(t, { fetchRequest: async () => ({ ok: true, json: async () => ({ output_text: '测试回复' }) }) });
  service.config = { ...assistantDefaults, voice: 'fish' }; service.keys = { yunqiao: 'test' };
  await service.text('你好'); assert.equal(emitted.some(x => x.type === 'speak'), true);
  assert.equal(emitted.some(x => x.message?.includes('Fish API Key')), true);
});
test('Fish error falls back once and never retries a paid synthesis', async t => {
  let fishCalls = 0;
  const { service, emitted } = harness(t, { fetchRequest: async url => {
    if (url.includes('fish.audio')) { fishCalls++; return { ok: false, status: 429 }; }
    return { ok: true, json: async () => ({ output_text: '回复仍然保留' }) };
  } });
  service.config = { ...assistantDefaults, voice: 'fish' }; service.keys = { yunqiao: 'test', fish: 'test' };
  await service.text('你好');
  assert.equal(fishCalls, 1); assert.equal(emitted.filter(x => x.type === 'speak').length, 1);
  assert.equal(emitted.some(x => x.content === '回复仍然保留'), true);
});
test('interrupted Fish response cannot start stale audio or a fallback voice', async t => {
  let resolve;
  const { service, emitted } = harness(t, { fetchRequest: () => new Promise(r => { resolve = r; }) });
  service.config = { ...assistantDefaults, voice: 'fish' }; service.keys = { fish: 'test' };
  const preview = service.previewVoice(); service.cancel();
  resolve({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }); await preview;
  assert.equal(emitted.some(x => ['play', 'speak'].includes(x.type)), false);
});

const projectA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',projectB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const projectRows={
  [projectA]:{id:projectA,cwd:'/private/work/电视项目',title:'电视桌面开发'},
  [projectB]:{id:projectB,cwd:'/private/work/网站项目',title:'站点组件验收'}
};
test('current-project query answers locally from the pinned selector, not the newest reminder',async t=>{
  const {service,emitted}=harness(t,{getLatest:()=>assert.fail('pinned target must not consult reminders'),getProjectThread:(_,id)=>projectRows[id],fetchRequest:()=>assert.fail('project query must not call chat/polish')});
  service.config={...service.config,target:projectA,speak:false};
  await service.text('当前项目');
  const reply=emitted.findLast(e=>e.type==='message'&&e.role==='assistant').content;
  assert.match(reply,/电视项目/);assert.match(reply,/电视桌面开发/);assert.match(reply,/固定聊天/);assert.doesNotMatch(reply,/网站项目/);
  service.memory.close();
});
test('unselected project stays explicit even when newer reminders arrive',async t=>{
  const {service,emitted}=harness(t,{getLatest:()=>assert.fail('MOSS must not follow reminders'),getProjectThread:()=>assert.fail('no selected project'),fetchRequest:()=>assert.fail('unexpected network')});
  service.config={...service.config,speak:false};await service.text('我当前选中的项目是什么？');
  assert.match(emitted.findLast(e=>e.role==='assistant').content,/尚未选择/);service.memory.close();
});
test('missing pinned project never silently switches to another project',async t=>{
  const {service,emitted}=harness(t,{getLatest:()=>assert.fail('must not fall back'),getProjectThread:()=>null,fetchRequest:()=>assert.fail('unexpected network')});
  service.config={...service.config,target:projectA,speak:false};await service.text('你知道当前项目吗？');
  assert.match(emitted.findLast(e=>e.role==='assistant').content,/无法读取/);assert.match(emitted.findLast(e=>e.role==='assistant').content,/没有改选/);service.memory.close();
});
test('ordinary chat receives fresh selector metadata on each turn, without full local paths',async t=>{
  const sent=[];const {service}=harness(t,{getProjectThread:(_,id)=>projectRows[id],fetchRequest:async(_,request)=>{sent.push(JSON.parse(request.body));return{ok:true,json:async()=>({output_text:'讨论回复'})};}});
  service.keys={yunqiao:'test'};service.config={...service.config,target:projectA,speak:false};
  await service.text('帮我分析当前项目的风险');service.config={...service.config,target:projectB};await service.text('接下来怎么做？');
  assert.equal(sent.length,2);
  const a=sent[0].input.filter(x=>x.role==='system').map(x=>x.content).join('\n'),b=sent[1].input.filter(x=>x.role==='system').map(x=>x.content).join('\n');
  assert.match(a,/电视项目/);assert.match(b,/网站项目/);assert.doesNotMatch(b,/电视桌面开发/);assert.doesNotMatch(a,/\/private\/work/);assert.doesNotMatch(b,/\/private\/work/);
  assert.equal(sent[0].input.at(-1).content,'帮我分析当前项目的风险');service.memory.close();
});
test('project snapshot is frozen before optional speech polishing awaits a response',async t=>{
  let latest=projectA,relayContext;
  const {service}=harness(t,{getLatest:()=>({threadId:latest}),getProjectThread:(_,id)=>projectRows[id],fetchRequest:async(url,request)=>{
    if(url.includes('deepseek')){latest=projectB;service.config={...service.config,target:projectB};return{ok:true,json:async()=>({choices:[{message:{content:'帮我分析当前项目的风险'}}]})};}
    relayContext=JSON.parse(request.body).input;return{ok:true,json:async()=>({output_text:'讨论回复'})};
  }});
  service.keys={yunqiao:'test',deepseek:'test'};service.config={...service.config,speak:false,polishEnabled:true,target:projectA};
  await service.text('帮我分析当前项目的风险','chat',{voice:true});
  const system=relayContext.filter(x=>x.role==='system').map(x=>x.content).join('\n');assert.match(system,/电视项目/);assert.doesNotMatch(system,/网站项目/);service.memory.close();
});
test('spoken current-project query works locally after wake and uses existing system playback',async t=>{
  const {service,emitted}=harness(t,{asr:{transcribe:async()=> 'MOSS，当前项目'},getLatest:()=>({threadId:projectA}),getProjectThread:(_,id)=>projectRows[id],fetchRequest:()=>assert.fail('must not call cloud')});
  service.config={...service.config,target:projectA};service.asrReady=true;service.listening=true;await service.audio('fixture');
  assert.ok(emitted.some(e=>e.type==='speak'&&e.text.includes('电视项目')));service.memory.close();
});

test('project metadata lookup is read-only and rejects archived or subagent chats',t=>{
  const {dir,service}=harness(t);const file=join(dir,'threads.sqlite');const db=new DatabaseSync(file);
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY,title TEXT,cwd TEXT,source TEXT,archived INTEGER)');
  const insert=db.prepare('INSERT INTO threads VALUES (?,?,?,?,?)');
  insert.run(projectA,'开发聊天','/tmp/电视项目','vscode',0);
  insert.run(projectB,'归档聊天','/tmp/网站项目','vscode',1);
  insert.run('child','子任务','/tmp/子项目','{"subagent":{}}',0);db.close();
  const before=readFileSync(file);
  assert.deepEqual(projectThread(file,projectA),{id:projectA,title:'开发聊天',cwd:'/tmp/电视项目'});
  assert.equal(projectThread(file,projectB),null);assert.equal(projectThread(file,'child'),null);assert.equal(projectThread(file,'missing'),null);
  assert.deepEqual(readFileSync(file),before);service.memory.close();
});
test('empty follow state is answered locally and project queries do not swallow development requests',async t=>{
  const {service,emitted}=harness(t,{getLatest:()=>null,fetchRequest:()=>assert.fail('unexpected network')});
  service.config={...service.config,speak:false};await service.text('当前项目');
  assert.match(emitted.findLast(e=>e.role==='assistant').content,/尚未选择/);
  for(const query of ['当前项目','当前项目路径','我当前选中的项目是什么？','你能看到我现在选择的项目吗'])assert.ok(isProjectQuestion(query),query);
  for(const query of ['帮我分析当前项目','当前项目怎么部署','让 Codex 修改当前项目'])assert.equal(isProjectQuestion(query),false,query);
  service.memory.close();
});
test('cloud project context omits path and identifier and redacts credential-like titles',()=>{
  const project=selectedProject({target:projectA,database:'unused',getThread:()=>({id:projectA,cwd:'/private/secret/work/项目',title:'api_key=very-secret'})});
  const context=projectContext(project);
  assert.doesNotMatch(context,/very-secret|private|aaaaaaaa/);assert.match(context,/项目/);assert.match(context,/仅是数据/);
});

test('dictation settings are additive, opt-in and independent of assistant polish', () => {
  const old = validateSettings({ polishEnabled: true });
  assert.equal(old.dictationEnabled, false); assert.equal(old.dictationPolish, false);
  assert.equal(old.dictationHotkey, 'right-option'); assert.equal(old.polishEnabled, true);
  for (const dictationHotkey of ['right-option', 'f8', 'f9']) assert.equal(validateSettings({dictationHotkey, dictationEnabled:true, dictationPolish:true}).dictationHotkey, dictationHotkey);
  assert.throws(() => validateSettings({ dictationHotkey: 'cmd-q' }));
  assert.throws(() => validateSettings({ dictationEnabled: 'true' }));
  assert.throws(() => validateSettings({ dictationPolish: 1 }));
});
