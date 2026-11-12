// Explicit native integration test, not keyboard/mouse injection or business IPC.
export async function runSelfCheck(invoke, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  async function checkpoint(step) {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await invoke('probe_check', { step })) return;
      await pause(25);
    }
    throw new Error('native checkpoint timeout');
  }
  await checkpoint('boot');
  for (const [command, args] of [
    ['probe_open', { page: 'invalid' }], ['probe_demo', { value: 'invalid' }],
    ['probe_check_rendered', { demo: null }], // chooser must not acknowledge overlay DOM
    ['probe_check', { step: 'invalid' }],
  ]) {
    let rejected = false;
    try { await invoke(command, args); } catch { rejected = true; }
    if (!rejected) throw new Error('invalid enum accepted');
  }
  await checkpoint('bounded');
  await invoke('probe_open', { page: 'history' });
  await checkpoint('history');
  await invoke('probe_open', { page: 'settings' });
  await checkpoint('settings');
  for (const value of ['listening', 'processing', 'speaking', 'dictation']) {
    await invoke('probe_demo', { value });
    await checkpoint(value);
  }
  await invoke('probe_hide');
  await checkpoint('hidden');
  await invoke('probe_check_finish', { passed: true });
}

// Only examines the probe's own DOM; no AX, external input, filesystem or services.
export function renderedDemo(document, demo) {
  const conversation = document.querySelector('.conversation-effect');
  const dictation = document.querySelector('.dictation-effect');
  if (demo === null) return !conversation && !dictation;
  if (demo === 'dictation') return !conversation && dictation?.dataset.phase === 'processing' && !!dictation.querySelector('canvas');
  return !dictation && conversation?.dataset.phase === demo && !!conversation.querySelector('canvas');
}
