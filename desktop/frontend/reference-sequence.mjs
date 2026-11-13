// Explicit visual rehearsal only: no timers/services run until the user starts it.
export const referenceSequence = Object.freeze([
  { at: 0, phase: 'listening', level: 0.22, text: '' },
  { at: 900, phase: 'listening', level: 0.68, text: '沐言，' },
  { at: 1600, phase: 'listening', level: 0.42, text: '沐言，请介绍一下' },
  { at: 2300, phase: 'listening', level: 0.64, text: '沐言，请介绍一下这个界面。' },
  { at: 3200, phase: 'processing', level: 0, text: '沐言，请介绍一下这个界面。' },
  { at: 5200, phase: 'speaking', level: 0.56, text: '这是 libraries.dev 的原版语音环。' },
  { at: 6500, phase: 'speaking', level: 0.78, text: '这是 libraries.dev 的原版语音环。识别和回复显示在下方的光效框里。' },
  { at: 8500, phase: 'listening', level: 0.18, text: '' },
  { at: 10000, phase: 'hidden', level: 0, text: '' },
]);
