// Explicit synthetic fixtures only; these are not service events or timers.
export const voiceViewRehearsal = Object.freeze([
  { at: 0, type: 'begin', run: 1, seq: 0, mode: 'conversation' },
  { at: 500, type: 'transcript', run: 1, seq: 1, text: '第一轮合成提问' },
  { at: 1000, type: 'process', run: 1, seq: 2 },
  { at: 1500, type: 'cancel', run: 1, seq: 3 },
  { at: 2000, type: 'reply', run: 1, seq: 4, text: '取消后的迟到回复：不应显示' },
  { at: 2600, type: 'begin', run: 2, seq: 0, mode: 'dictation' },
  { at: 3100, type: 'transcript', run: 2, seq: 1, text: '新一轮合成听写' },
  { at: 3500, type: 'reply', run: 1, seq: 99, text: '旧回合回复：不应覆盖听写' },
  { at: 3900, type: 'begin', run: 3, seq: 0, mode: 'conversation' },
  { at: 4300, type: 'process', run: 2, seq: 2 },
  { at: 4900, type: 'end', run: 2, seq: 3 },
  { at: 5400, type: 'reply', run: 1, seq: 100, text: '结束后的迟到回复：不应显示' },
].map(Object.freeze));

// All branches explicitly retain text until end; no automatic microphone resume.
export function playbackRehearsal(outcome = 'played') {
  const frames = [
    { at: 0, type: 'begin', mode: 'conversation' },
    { at: 300, type: 'transcript', text: '请用一句话介绍自己。' },
    { at: 600, type: 'process' },
    { at: 1000, type: 'reply', text: '这是合成回复文字，页面不会播放声音。' },
  ];
  if (outcome === 'muted') frames.push({ at: 1600, type: 'reply-muted' });
  else {
    frames.push({ at: 1600, type: 'synthesis-started' });
    if (outcome === 'failed') frames.push({ at: 2400, type: 'playback-failed' });
    else if (outcome === 'cancelled') frames.push(
      { at: 2100, type: 'cancel' }, { at: 2400, type: 'playback-started' });
    else frames.push({ at: 2400, type: 'playback-started' },
      { at: 2800, type: 'meter', source: 'output', level: .65 }, { at: 3400, type: 'playback-ended' });
  }
  frames.push({ at: 4200, type: 'end' });
  // Continuous conversation is a NEW run, only after a host input-ready ack.
  if (outcome !== 'cancelled') frames.push({ at: 4600, type: 'begin', mode: 'conversation', run: 2 });
  return Object.freeze(frames.map((frame, seq) => Object.freeze({ run: 1, seq, ...frame, ...(frame.run === 2 ? { seq: 0 } : {}) })));
}
