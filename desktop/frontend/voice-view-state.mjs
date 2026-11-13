// Proposed view protocol, NOT the legacy service wire format or a business IPC.
// One coordinator must allocate strictly increasing run IDs and per-run sequence
// numbers before async work starts. Never tag a late callback with the current ID.
export const initialVoiceView = Object.freeze({
  run: 0, seq: -1, active: false, mode: 'conversation', phase: 'hidden', level: 0, text: '',
});
const modes = new Set(['conversation', 'dictation']);
const counter = value => Number.isSafeInteger(value) && value >= 0;
const textValue = value => typeof value === 'string' && value.length <= 8000;
const patch = (state, value) => Object.freeze({ ...state, ...value });

export function reduceVoiceView(state = initialVoiceView, event) {
  if (!event || typeof event !== 'object' || !counter(event.run) || !counter(event.seq)) return state;
  if (event.type === 'begin') {
    // Busy means reject, not preempt or queue. The host must cancel explicitly.
    if (state.active || event.run <= state.run || event.seq !== 0 || !modes.has(event.mode)) return state;
    return patch(state, { run: event.run, seq: 0, active: true, mode: event.mode,
      phase: 'listening', level: 0, text: '' });
  }
  if (!state.active || event.run !== state.run || event.seq <= state.seq) return state;
  const next = value => patch(state, { seq: event.seq, ...value });
  switch (event.type) {
    case 'transcript':
      // Full snapshot, not a delta; an ASR result must never overwrite a reply.
      if (state.phase !== 'listening' || !textValue(event.text)) return state;
      return next({ text: event.text });
    case 'process':
      if (!['listening', 'processing'].includes(state.phase)) return state;
      return next({ phase: 'processing', level: 0 });
    case 'reply':
      // Dictation is text delivery, not assistant playback. Keep it isolated.
      if (state.mode !== 'conversation' || !['processing', 'speaking'].includes(state.phase) || !textValue(event.text)) return state;
      return next({ phase: 'speaking', text: event.text, level: state.phase === 'speaking' ? state.level : 0 });
    case 'meter': {
      const source = state.phase === 'listening' ? 'input' : state.phase === 'speaking' ? 'output' : null;
      if (!source || event.source !== source || typeof event.level !== 'number' || !Number.isFinite(event.level)) return state;
      return next({ level: Math.max(0, Math.min(1, event.level)) });
    }
    case 'cancel':
    case 'end':
    case 'fail':
      // Preserve the run watermark after closing; late events cannot reopen it.
      // This only hides a view: recorder/playback/writer cancellation is host work.
      return next({ active: false, phase: 'hidden', level: 0, text: '' });
    default:
      return state;
  }
}
