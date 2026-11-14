// Offline result badge proposal ONLY. Private original effect owner, no OS or UI.
// The badge is session-scoped information, never copy permission or stop proof.
import { DictationCopyEffectModel } from './dictation-copy-effect-model.mjs';
const hidden = Object.freeze({ status: 'hidden', awaitingStop: false });
const statuses = Object.freeze({ checking: 'checking', checked: 'checked', 'not-issued': 'not-issued',
  written: 'copy-written', 'not-written': 'copy-not-written', unknown: 'copy-unknown' });
export class DictationCopyResultModel {
  #model; #enabled; #owner = null; #dismissed = null;
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#model = new DictationCopyEffectModel({ ...options, enabled: this.#enabled });
  }
  #coordinator() { return this.#model.snapshot().state.state.state.lifetime.state.coordinator; }
  dispatchAt(now, command, ...args) {
    const result = this.#model.dispatchAt(now, command, ...args);
    if (result !== null && result !== false && result !== undefined) {
      if (['hide', 'dismiss'].includes(command)) this.#dismissed = this.#coordinator().session;
      if (command === 'requestCopy') this.#owner = null; // A fresh attempt never inherits a prior badge.
    }
    return result;
  }
  prepareAt(now, session, copy) {
    const token = this.#model.prepareAt(now, session, copy);
    if (token) this.#owner = session; // Only successful original preparation binds display ownership.
    return token;
  }
  result() {
    if (!this.#enabled) return hidden;
    const state = this.#coordinator(); const session = state.session; const view = state.view;
    if (session !== this.#dismissed) this.#dismissed = null;
    if (this.#model.snapshot().state.state.state.lifetime.state.exhausted ||
      !session || session !== this.#owner || session === this.#dismissed || !state.connected || state.closing ||
      session.epoch !== state.epoch || session.mode !== 'dictation' || !view.active || view.run !== session.run ||
      view.mode !== 'dictation' || view.phase !== 'processing' || view.activity !== 'thinking') return hidden;
    const effect = this.#model.snapshot();
    const key = ['checking', 'checked', 'not-issued'].includes(effect.phase) ? effect.phase : effect.outcome;
    return Object.hasOwn(statuses, key) ? Object.freeze({ status: statuses[key], awaitingStop: effect.busy }) : hidden;
  }
  advance(now) { return this.#model.advance(now); }
  beginAt(now) { return this.#model.beginAt(now); }
  receiveAt(now, token, envelope) { return this.#model.receiveAt(now, token, envelope); }
  lostAt(now, token) { return this.#model.lostAt(now, token); }
  checkedAt(now, token, evidence) { return this.#model.checkedAt(now, token, evidence); }
  handoffAt(now, token) { return this.#model.handoffAt(now, token); }
  reportAt(now, job, outcome) { return this.#model.reportAt(now, job, outcome); }
  stoppedAt(now, job, evidence) { return this.#model.stoppedAt(now, job, evidence); }
  candidate() { return this.#model.candidate(); }
  sample() { return this.#model.sample(); }
  commit(frame) { return this.#model.commit(frame); }
  snapshot() { return this.#model.snapshot(); } // Diagnostic original state, NOT a result badge.
}
