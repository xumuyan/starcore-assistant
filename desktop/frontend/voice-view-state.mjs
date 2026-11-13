// Proposed view protocol, NOT the legacy service wire format or a business IPC.
// One coordinator must allocate strictly increasing run IDs and per-run sequence
// numbers before async work starts. Never tag a late callback with the current ID.
export const initialVoiceView = Object.freeze({
  run: 0, seq: -1, active: false, mode: 'conversation', phase: 'hidden', activity: 'closed', level: 0, text: '',
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
      phase: 'listening', activity: 'listening', level: 0, text: '' });
  }
  if (!state.active || event.run !== state.run || event.seq <= state.seq) return state;
  const next = value => patch(state, { seq: event.seq, ...value });
  switch (event.type) {
    case 'transcript':
      // Full snapshot, not a delta; an ASR result must never overwrite a reply.
      if (state.activity !== 'listening' || !textValue(event.text)) return state;
      return next({ text: event.text });
    case 'process':
      if (!['listening', 'thinking'].includes(state.activity)) return state;
      return next({ phase: 'processing', activity: 'thinking', level: 0 });
    case 'reply':
      // Text arrival does not prove that the player has started or even exists.
      if (state.mode !== 'conversation' || !['thinking', 'ready'].includes(state.activity) ||
          !textValue(event.text) || !event.text.trim()) return state;
      return next({ phase: 'listening', activity: 'ready', text: event.text, level: 0 });
    case 'synthesis-started':
      if (state.mode !== 'conversation' || state.activity !== 'ready') return state;
      return next({ phase: 'processing', activity: 'synthesizing', level: 0 });
    case 'playback-started':
      // Only a player acknowledgement, never an audio command or text event.
      if (state.mode !== 'conversation' || !['ready', 'synthesizing'].includes(state.activity)) return state;
      return next({ phase: 'speaking', activity: 'playing', level: 0 });
    case 'playback-ended':
      if (state.activity !== 'playing') return state;
      return next({ phase: 'listening', activity: 'completed', level: 0 });
    case 'playback-failed':
      if (state.mode !== 'conversation' || !['ready', 'synthesizing', 'playing'].includes(state.activity)) return state;
      return next({ phase: 'listening', activity: 'playback-failed', level: 0 });
    case 'reply-muted':
      if (state.mode !== 'conversation' || state.activity !== 'ready') return state;
      return next({ phase: 'listening', activity: 'muted', level: 0 });
    case 'meter': {
      const source = state.activity === 'listening' ? 'input' : state.activity === 'playing' ? 'output' : null;
      if (!source || event.source !== source || typeof event.level !== 'number' || !Number.isFinite(event.level)) return state;
      return next({ level: Math.max(0, Math.min(1, event.level)) });
    }
    case 'cancel':
    case 'end':
    case 'fail':
      // Preserve the run watermark after closing; late events cannot reopen it.
      // This only hides a view: recorder/playback/writer cancellation is host work.
      return next({ active: false, phase: 'hidden', activity: 'closed', level: 0, text: '' });
    default:
      return state;
  }
}
