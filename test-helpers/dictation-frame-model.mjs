// Test-only synchronous sampling/delivery proposal. Not an IPC authenticator,
// subscription, thread-safe transaction, or production renderer.
import { selectDictationPresentation } from './dictation-presentation.mjs';
const hidden = selectDictationPresentation();
const same = (a, b) => a && b && a.session === b.session && a.epoch === b.epoch &&
  a.connected === b.connected && a.closing === b.closing && a.view === b.view &&
  a.queuedMeters === b.queuedMeters && a.pending.length === b.pending.length &&
  a.pending.every((ticket, index) => ticket === b.pending[index]) && a.final === b.final &&
  a.status === b.status && a.paste === b.paste && a.canCopy === b.canCopy && a.copying === b.copying &&
  a.dismissed === b.dismissed;

export class DictationFrameModel {
  #model; #projection; #outcome; #enabled; #max; #revision = 0; #session = null; #dismissed = null;
  #latest = null; #shown = hidden; #shownRevision = 0; #shownSignature = null;
  constructor(model, projection, outcome, { enabled = false, maxRevision = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isSafeInteger(maxRevision) || maxRevision < 1) throw new TypeError('invalid frame options');
    this.#model = model; this.#projection = projection; this.#outcome = outcome;
    this.#enabled = enabled === true; this.#max = maxRevision;
  }
  #hide() { this.#shown = hidden; this.#shownRevision = 0; this.#shownSignature = null; }
  #read() {
    const state = this.#model.snapshot();
    if (state.session !== this.#session) {
      this.#session = state.session; this.#dismissed = null; this.#latest = null; this.#hide();
    }
    // Only the trusted original models are read, never caller-supplied frames.
    const final = this.#projection.snapshot(); const outcome = this.#outcome.snapshot();
    const signature = { ...state, final, status: outcome.status, paste: outcome.pasteDisposition,
      canCopy: outcome.canCopy, copying: outcome.copying, dismissed: this.#dismissed };
    if (this.#latest && !same(signature, this.#latest.signature)) this.#latest = null;
    if (this.#shownSignature && !same(signature, this.#shownSignature)) this.#hide();
    return { signature, state, final, outcome };
  }
  sample() {
    if (!this.#enabled) return null;
    const { signature, state, final, outcome } = this.#read();
    if (this.#revision >= this.#max) { this.#latest = null; this.#hide(); return null; }
    const presentation = selectDictationPresentation({ enabled: true, coordinator: state,
      final: { session: state.session, value: final }, outcome: { session: state.session, value: outcome },
      dismissedSession: this.#dismissed });
    const frame = Object.freeze({ revision: ++this.#revision, presentation });
    this.#latest = { frame, signature }; // One slot; old frames are never retained here.
    return frame;
  }
  commit(frame) {
    if (!this.#enabled) return false;
    this.#read();
    if (!this.#latest || frame !== this.#latest.frame) return false;
    this.#shown = frame.presentation; this.#shownRevision = frame.revision;
    this.#shownSignature = this.#latest.signature; this.#latest = null;
    return true;
  }
  snapshot() {
    if (this.#enabled) this.#read();
    return Object.freeze({ revision: this.#shownRevision, presentation: this.#shown });
  }
  dismiss(session) {
    if (!this.#enabled) return false;
    const { state } = this.#read();
    if (!session || session !== state.session || !state.connected || state.closing ||
      !state.view.active || session.mode !== 'dictation') return false;
    this.#dismissed = session; this.#latest = null; this.#hide();
    return true; // Presentation only: no outcome.dismiss, close, stop, or erasure.
  }
}
