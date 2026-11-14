// Offline exclusive-owner proposal ONLY. No external model injection, callbacks,
// production imports, OS effects, transport authentication or automatic timers.
import { VoiceCoordinatorModel } from './voice-coordinator-model.mjs';
import { FinalAsrProjection } from './final-asr-projection.mjs';
import { DictationOutcomeModel } from './dictation-outcome-model.mjs';
import { selectDictationPresentation } from './dictation-presentation.mjs';
const hidden = selectDictationPresentation();
const commands = new Set(['reserve', 'acquire', 'inputReady', 'deliver', 'process', 'released', 'close',
  'disconnect', 'restart', 'flushMeter', 'final', 'begin', 'result', 'requestCopy', 'copied', 'dismiss', 'hide']);
const cleanup = new Set(['close', 'disconnect', 'released', 'hide']);
export class DictationTransitionModel {
  #model; #final; #outcome; #enabled; #max; #revision = 0; #session = null; #dismissed = null;
  #latest = null; #shown = hidden;
  constructor({ enabled = false, epoch, maxRevision = Number.MAX_SAFE_INTEGER, coalesceMeters = false } = {}) {
    if (!Number.isSafeInteger(maxRevision) || maxRevision < 1) throw new TypeError('invalid transition options');
    this.#enabled = enabled === true; this.#max = maxRevision;
    this.#model = new VoiceCoordinatorModel({ enabled: this.#enabled, epoch, coalesceMeters });
    this.#final = new FinalAsrProjection(this.#model, { enabled: this.#enabled });
    this.#outcome = new DictationOutcomeModel(this.#model, this.#final, { enabled: this.#enabled });
  }
  #sync() {
    const state = this.#model.snapshot();
    if (state.session !== this.#session) { this.#session = state.session; this.#dismissed = null; }
    return state;
  }
  dispatch(command, ...args) {
    if (!this.#enabled || !commands.has(command) || (this.#revision >= this.#max && !cleanup.has(command))) return null;
    let result;
    if (['reserve', 'acquire', 'inputReady', 'deliver', 'process', 'released', 'close', 'disconnect', 'restart', 'flushMeter'].includes(command)) {
      result = this.#model[command](...args);
    } else if (command === 'final') result = this.#final.accept(...args);
    else if (command === 'hide') {
      const state = this.#sync(); const session = args[0];
      result = Boolean(session && session === state.session && state.connected && !state.closing &&
        state.view.active && session.mode === 'dictation');
      if (result) this.#dismissed = session;
    } else {
      result = this.#outcome[command](...args);
      // Explicit result dismissal also hides this run's presentation, including
      // preparing -> hidden/unattempted, which public snapshots cannot detect.
      if (command === 'dismiss' && result === true) this.#dismissed = this.#model.snapshot().session;
    }
    this.#sync();
    if (result !== null && result !== false && result !== undefined) {
      this.#latest = null; this.#shown = hidden;
      if (this.#revision < this.#max) this.#revision++;
    }
    return result; // All original owner/role/phase validation remains in the models.
  }
  sample() {
    if (!this.#enabled || this.#revision >= this.#max) return null;
    const state = this.#sync();
    const presentation = selectDictationPresentation({ enabled: true, coordinator: state,
      final: { session: state.session, value: this.#final.snapshot() },
      outcome: { session: state.session, value: this.#outcome.snapshot() }, dismissedSession: this.#dismissed });
    const frame = Object.freeze({ revision: this.#revision, presentation }); this.#latest = frame;
    return frame;
  }
  commit(frame) {
    if (!this.#enabled || this.#revision >= this.#max || !this.#latest || frame !== this.#latest || frame.revision !== this.#revision) return false;
    this.#shown = frame.presentation; this.#latest = null; return true;
  }
  snapshot() {
    return Object.freeze({ revision: this.#revision, exhausted: this.#revision >= this.#max,
      presentation: this.#shown, coordinator: this.#model.snapshot() });
  }
  candidate() { return this.#enabled ? this.#outcome.candidate() : null; }
  copyText(copy) { return this.#enabled && this.#revision < this.#max ? this.#outcome.copyText(copy) : null; }
}
