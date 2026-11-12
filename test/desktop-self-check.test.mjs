import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkpoints, verifyNativeResult } from '../desktop/check-native.mjs';
import { runSelfCheck, renderedDemo } from '../desktop/frontend/self-check.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function host({ stuck = false, acceptInvalid = false, fail = false } = {}) {
  const calls = [];
  return { calls, invoke: async (name, args) => {
    calls.push([name, args]);
    if (name === 'probe_check' && args.step !== 'invalid') return !stuck;
    if (args?.page === 'invalid' || args?.value === 'invalid' || args?.step === 'invalid' || name === 'probe_check_rendered') {
      if (!acceptInvalid) throw new Error('enum rejected');
    } else if (fail && name === 'probe_demo') throw new Error('registration failure');
  } };
}
test('self-check drives only bounded synthetic commands with ordered checkpoints', async () => {
  const { calls, invoke } = host();
  await runSelfCheck(invoke);
  assert.deepEqual(calls.filter(([name, args]) => name === 'probe_check' && args.step !== 'invalid').map(([, args]) => args.step),
    ['boot', 'bounded', 'history', 'settings', 'listening', 'processing', 'speaking', 'dictation', 'hidden']);
  assert.deepEqual(calls.at(-1), ['probe_check_finish', { passed: true }]);
  assert.ok(!calls.some(([name]) => name === 'probe_hotkey'), 'never auto-enables the test hotkey');
});
test('checkpoint polling is bounded and invalid acceptance or command failure cannot pass', async () => {
  for (const options of [{ stuck: true }, { acceptInvalid: true }, { fail: true }]) {
    const { calls, invoke } = host(options);
    await assert.rejects(runSelfCheck(invoke, async () => {}));
    assert.ok(!calls.some(([name]) => name === 'probe_check_finish'));
    if (options.stuck) assert.equal(calls.length, 80);
  }
});
test('render acknowledgement requires matching own DOM and canvas, hidden means unmounted', () => {
  const doc = (conversation, dictation) => ({ querySelector: selector => selector === '.conversation-effect' ? conversation : dictation });
  const effect = (phase, canvas = true) => ({ dataset: { phase }, querySelector: () => canvas ? {} : null });
  assert.equal(renderedDemo(doc(null, null), null), true);
  for (const demo of ['listening', 'processing', 'speaking']) {
    assert.equal(renderedDemo(doc(effect(demo), null), demo), true);
    assert.equal(renderedDemo(doc(effect(demo, false), null), demo), false);
    assert.equal(renderedDemo(doc(effect('invalid'), null), demo), false);
    assert.equal(renderedDemo(doc(effect(demo), null), null), false);
  }
  assert.equal(renderedDemo(doc(null, effect('processing')), 'dictation'), true);
  assert.equal(renderedDemo(doc(effect('processing'), effect('processing')), 'dictation'), false);
});
test('native self-check is explicit, caller-bound, ordered and excludes external input injection', () => {
  const native = read('desktop/src-tauri/src/main.rs');
  const check = read('desktop/src-tauri/src/check.rs');
  assert.match(native, /arg == "--self-check"/);
  assert.match(native, /requires default hidden window mode/);
  assert.match(native, /Duration::from_secs\(20\)/);
  assert.match(check, /authorized\(self\.enabled, caller\.label\(\), label\)/);
  assert.match(check, /authorize\(&caller, "chooser"\)/);
  assert.match(check, /authorize\(&caller, "overlay"\)/);
  assert.match(check, /progress\.rendered == Some\(expected\)/);
  assert.match(check, /!state\.hotkey_enabled\s*&& !hotkey/);
  for (const command of ['probe_check_ready', 'probe_check_rendered', 'probe_check', 'probe_check_finish']) {
    assert.ok(read('desktop/src-tauri/build.rs').includes(`"${command}"`));
    assert.ok(read('desktop/src-tauri/permissions/probe.toml').includes(`"${command}"`));
  }
  for (const source of [check, read('desktop/frontend/self-check.mjs')]) {
    assert.doesNotMatch(source, /CGEvent|AXUI|osascript|std::fs|Command::new|fetch\(|getUserMedia|localStorage/);
  }
});


test('native runner requires a successful process and every ordered native checkpoint', () => {
  const stdout = [...checkpoints.map(step => `T0_CHECKPOINT ${step}`), 'T0_SELF_CHECK PASS'].join('\n');
  assert.equal(verifyNativeResult({ status: 0, stdout }).length, 10);
  for (const result of [
    { status: 1, stdout }, { status: 0, stdout: 'T0_SELF_CHECK PASS' },
    { status: 0, stdout: stdout + '\nT0_SELF_CHECK FAIL' },
    { status: 0, stdout, signal: 'SIGTERM' }, { status: 0, stdout, error: new Error('timeout') },
    { status: 0, stdout: stdout.replace('T0_CHECKPOINT History\n', '') },
  ]) assert.throws(() => verifyNativeResult(result));
});

test('hidden render acknowledgements do not wait on suspended animation frames', () => {
  const page = read('desktop/frontend/probe.jsx');
  const observer = page.split('// Observe committed React DOM')[1].split('}, [state.demo])')[0];
  assert.doesNotMatch(observer, /requestAnimationFrame/);
  assert.match(observer, /renderedDemo\(document, state\.demo\)/);
  assert.match(page, /selfCheck && !disposed/);
});
