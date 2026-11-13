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
