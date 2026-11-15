// Offline synchronous delivery experiment ONLY. No DOM, IPC, clock or effects.
// Conservative invalidation includes rejected/throwing ingress, not just mutations.
import { DictationCopyResultModel } from './dictation-copy-result-model.mjs';
const hidden = Object.freeze({ status: 'hidden', text: '', truncated: false, level: 0,
  showOrbs: false, canCopy: false, awaitingStop: false, executorWaiting: false });

export class DictationCopyFrameModel {
  #model; #enabled; #latest = null; #shown = hidden;
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#model = new DictationCopyResultModel({ ...options, enabled: this.#enabled });
  }
  #invalidate() { this.#latest = null; this.#shown = hidden; }
  #ingress(method, ...args) {
    this.#invalidate(); // Before calling: failures may still advance logical time.
    return this.#model[method](...args);
  }
  advance(now) { return this.#ingress('advance', now); }
  beginAt(now) { return this.#ingress('beginAt', now); }
  receiveAt(now, token, envelope) { return this.#ingress('receiveAt', now, token, envelope); }
  lostAt(now, token) { return this.#ingress('lostAt', now, token); }
  dispatchAt(now, command, ...args) { return this.#ingress('dispatchAt', now, command, ...args); }
  prepareAt(now, session, copy) { return this.#ingress('prepareAt', now, session, copy); }
  checkedAt(now, token, evidence) { return this.#ingress('checkedAt', now, token, evidence); }
  handoffAt(now, token) { return this.#ingress('handoffAt', now, token); }
  reportAt(now, job, outcome) { return this.#ingress('reportAt', now, job, outcome); }
  stoppedAt(now, job, evidence) { return this.#ingress('stoppedAt', now, job, evidence); }
  candidate() { return this.#model.candidate(); }
  sample() {
    this.#latest = null;
    const presentation = this.#model.samplePresentation();
    if (!presentation) { this.#shown = hidden; return null; }
    // No numeric generation or retained history. Original object identity only.
    const frame = Object.freeze({ presentation });
    this.#latest = frame; return frame;
  }
  commit(frame) {
    if (!this.#enabled || !this.#latest || frame !== this.#latest) return false;
    this.#shown = frame.presentation; this.#latest = null; return true;
  }
  snapshot() { return Object.freeze({ presentation: this.#shown }); }
  diagnostic() { return this.#model.snapshot(); } // Not delivery or effect authority.
}
