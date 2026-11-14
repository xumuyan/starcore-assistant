import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialVoiceView, reduceVoiceView } from '../desktop/frontend/voice-view-state.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const contract = read('docs/verification/2026-11-14-voice-adapter-contract.md');

test('adapter contract keeps identity, serialization, resource acknowledgements and integration gates explicit', () => {
  for (const requirement of [/拟议适配器契约/, /T0 未验收、T1 未启动/, /不订阅服务/, /默认关闭/,
    /epoch, run, origin, mode, operationId/, /迟到回调不得补贴当前 run/, /UUID → run/, /MAX_SAFE_INTEGER/,
    /统一串行视图投递队列/, /不认证/, /ASR 最终文字如果晚于 process/, /8000 UTF-16/, /16000/,
    /视图隐藏不等于停止确认/, /不可中断推理/, /已发出系统粘贴不能承诺撤回/, /用户显式触发/,
    /回退决策/, /attempt/, /当前契约准备不需要用户操作或授权/]) assert.match(contract, requirement);
  for (const resource of ['recorder', 'ASR', '聊天/润色/TTS transport', 'player', 'writer', '协调器']) assert.ok(contract.includes(`| ${resource}`));
  for (let gap = 1; gap <= 6; gap++) assert.match(contract, new RegExp(`- \\[ \\] G${gap} `));
  assert.doesNotMatch(contract, /- \[x\] G\d/);
  for (const path of ['PLAN.md', 'desktop/README.md', 'docs/verification/2026-11-13-voice-view-events.md']) {
    assert.ok(read(path).includes('2026-11-14-voice-adapter-contract.md'), `${path}: link contract`);
  }
});

test('source audit distinguishes existing tagged Rust/object guards from untagged Node completion', () => {
  const node = read('src/assistant-service.mjs');
  assert.match(node, /this\.emit\(\{ type: 'speak', text \}\)/);
  assert.match(read('src/assistant-host.mjs'), /case 'playbackEnded': assistant\.playing = false/);
  const rust = read('rust-host/src/chat.rs');
  assert.match(rust, /"playbackId": id/);
  assert.match(rust, /if !session\.end_playback\(id\)/);
  const owner = read('client/AssistantPlayback.swift');
  assert.match(owner, /current === object/);
  assert.match(owner, /\["type": "playbackEnded"\]/);
  const bridge = read('client/AssistantBridge.swift');
  for (const callback of ['audioPlayerDidFinishPlaying', 'audioPlayerDecodeErrorDidOccur', 'didCancel utterance']) assert.ok(bridge.includes(callback));
  assert.match(bridge, /successfully flag: Bool\) \{ finishedAudio\(player\) \}/);
  assert.ok(bridge.indexOf('正在用 Mac 系统声音回复') < bridge.indexOf('synthesizer.speak(utterance)'));
  for (const source of ['src/assistant-service.mjs', 'src/assistant-host.mjs', 'client/AssistantBridge.swift',
    'client/AssistantPlayback.swift', 'rust-host/src/chat.rs', 'src/assistant-dictation.mjs',
    'client/DictationController.swift', 'src/assistant-dictation-host.mjs']) assert.ok(contract.includes(source));
});

test('raw legacy events cannot open or mutate a view without a trusted adapter', () => {
  // Synthetic shapes only: no service instances, audio, subscriptions or user data.
  const raw = [
    { type: 'state', name: 'listening' }, { type: 'state', name: 'speaking' },
    { type: 'message', role: 'assistant', content: '合成文字' },
    { type: 'speak', text: '合成文字' }, { type: 'play', playbackId: 'synthetic-attempt' },
    { type: 'playbackEnded', playbackId: 'synthetic-attempt' }, { type: 'stopAudio' },
    { type: 'outputLevel', value: .8 }, { type: 'dictationReady', id: 'synthetic-id' },
    { type: 'dictationResult', id: 'synthetic-id', text: '合成听写' },
    ...['history', 'historyPage', 'configured', 'targets', 'usage', 'codexReminder', 'notice', 'error'].map(type => ({ type })),
  ];
  const active = reduceVoiceView(initialVoiceView, { type: 'begin', run: 1, seq: 0, mode: 'conversation' });
  for (const state of [initialVoiceView, active]) for (const event of raw) {
    assert.equal(reduceVoiceView(state, event), state, event.type);
    // Even adding run/seq cannot make these raw event names view commands.
    assert.equal(reduceVoiceView(state, { ...event, run: 1, seq: 1 }), state, event.type);
  }
  // The reducer is not an origin authenticator: the future coordinator must reject
  // untrusted begin before this boundary, not assume extra fields are validated.
  assert.equal(reduceVoiceView(initialVoiceView, { type: 'begin', run: 1, seq: 0,
    mode: 'conversation', origin: 'untrusted' }).active, true);
});

test('late final ASR and oversized view text remain documented gaps, not implicit protocol changes', () => {
  let state = reduceVoiceView(initialVoiceView, { type: 'begin', run: 1, seq: 0, mode: 'dictation' });
  assert.equal(reduceVoiceView(state, { type: 'transcript', run: 1, seq: 1, text: '字'.repeat(8001) }), state);
  state = reduceVoiceView(state, { type: 'process', run: 1, seq: 1 });
  assert.equal(reduceVoiceView(state, { type: 'transcript', run: 1, seq: 2, text: '最终合成听写' }), state);
  assert.match(read('src/assistant-dictation.mjs'), /MAX_TEXT = 16000/);
  assert.match(contract, /不能从截断后的视图文字执行写入/);
});
