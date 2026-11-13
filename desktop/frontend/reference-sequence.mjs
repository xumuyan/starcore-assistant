// Explicit synthetic EVENTS, delivered through reduceVoiceView, never direct phases.
// These input/player acknowledgements are fixtures, not hardware confirmations.
const freeze = frames => Object.freeze(frames.map(Object.freeze));
export const dictationSequence = freeze([
  { at: 0, type: 'begin', run: 1, seq: 0, mode: 'dictation' },
  { at: 100, type: 'meter', run: 1, seq: 1, source: 'input', level: .28 },
  { at: 900, type: 'transcript', run: 1, seq: 2, text: '这是一段' },
  { at: 1000, type: 'meter', run: 1, seq: 3, source: 'input', level: .72 },
  { at: 1800, type: 'transcript', run: 1, seq: 4, text: '这是一段按键听写的合成文字。' },
  { at: 1900, type: 'meter', run: 1, seq: 5, source: 'input', level: .46 },
  { at: 3000, type: 'process', run: 1, seq: 6 },
  // View end does NOT confirm insertion or copying.
  { at: 5500, type: 'end', run: 1, seq: 7 },
]);
export function sequenceForMode(mode) {
  return mode === 'dictation' ? dictationSequence : referenceSequence;
}
export const referenceSequence = freeze([
  { at: 0, type: 'begin', run: 1, seq: 0, mode: 'conversation' },
  { at: 100, type: 'meter', run: 1, seq: 1, source: 'input', level: .22 },
  { at: 900, type: 'transcript', run: 1, seq: 2, text: '沐言，' },
  { at: 1000, type: 'meter', run: 1, seq: 3, source: 'input', level: .68 },
  { at: 1600, type: 'transcript', run: 1, seq: 4, text: '沐言，请介绍一下' },
  { at: 1700, type: 'meter', run: 1, seq: 5, source: 'input', level: .42 },
  { at: 2300, type: 'transcript', run: 1, seq: 6, text: '沐言，请介绍一下这个界面。' },
  { at: 2400, type: 'meter', run: 1, seq: 7, source: 'input', level: .64 },
  { at: 3200, type: 'process', run: 1, seq: 8 },
  { at: 4300, type: 'reply', run: 1, seq: 9, text: '这是 libraries.dev 的原版语音环。' },
  { at: 4800, type: 'reply', run: 1, seq: 10, text: '这是 libraries.dev 的原版语音环。识别和回复显示在下方的光效框里。' },
  { at: 5200, type: 'synthesis-started', run: 1, seq: 11 },
  { at: 6200, type: 'playback-started', run: 1, seq: 12 },
  { at: 6500, type: 'meter', run: 1, seq: 13, source: 'output', level: .56 },
  { at: 7100, type: 'meter', run: 1, seq: 14, source: 'output', level: .78 },
  { at: 8000, type: 'playback-ended', run: 1, seq: 15 },
  { at: 8400, type: 'end', run: 1, seq: 16 },
  { at: 8500, type: 'begin', run: 2, seq: 0, mode: 'conversation' },
  { at: 8700, type: 'meter', run: 2, seq: 1, source: 'input', level: .18 },
  { at: 10000, type: 'end', run: 2, seq: 2 },
]);
