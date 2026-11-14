// Test-only explicit-copy boundary. No executor, clipboard, timer or OS query.
// Original handles and guard/stop facts assume a trusted serialized local owner.
import { DictationSourceLeaseModel } from './dictation-source-lease-model.mjs';
export class DictationCopyEffectModel {
  #model; #enabled; #check = null; #job = null; #used = new WeakSet();
  #phase = 'idle'; #outcome = 'unattempted'; #applied = false;
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#model = new DictationSourceLeaseModel({ ...options, enabled: this.#enabled });
  }
  #state() { return this.#model.snapshot().state.state; }
  #signature() {
    const state = this.#state();
    return `${state.versions.lock}:${state.versions.settings}:${state.lifetime.state.revision}`;
  }
  #live(record, now) {
    const state = this.#state().lifetime.state.coordinator;
    return record.session === state.session && this.#model.copyTextAt(now, record.copy) !== null;
  }
  #abort(now) {
    const check = this.#check; this.#check = null;
    this.#phase = 'not-issued'; this.#outcome = 'not-issued'; this.#applied = false;
    if (this.#live(check, now)) this.#applied = this.#model.dispatchAt(now, 'copied', check.copy, { written: false }) === true;
  }
  #refresh(now) {
    if (this.#check && (!this.#live(this.#check, now) || this.#check.signature !== this.#signature())) this.#abort(now);
  }
  advance(now) {
    if (!this.#enabled || !this.#model.advance(now)) return false;
    this.#refresh(now); return true;
  }
  beginAt(now) { if (!this.advance(now)) return null; return this.#model.beginAt(now); }
  receiveAt(now, token, envelope) {
    if (!this.#enabled) return false;
    const result = this.#model.receiveAt(now, token, envelope);
    this.#refresh(this.#state().lifetime.now); return result;
  }
  lostAt(now, token) {
    if (!this.#enabled) return false;
    const result = this.#model.lostAt(now, token);
    this.#refresh(this.#state().lifetime.now); return result;
  }
  dispatchAt(now, command, ...args) {
    if (!this.advance(now)) return null;
    // Completion is accepted only through the original executor report. An
    // outstanding executor blocks another explicit copy, not voice cleanup.
    if (command === 'copied' || (command === 'requestCopy' && (this.#check || this.#job))) return null;
    const result = this.#model.dispatchAt(now, command, ...args); this.#refresh(now); return result;
  }
  prepareAt(now, session, copy) {
    if (!this.advance(now) || this.#check || this.#job || !copy || typeof copy !== 'object' || this.#used.has(copy)) return null;
    const record = { token: Object.freeze({}), session, copy, signature: this.#signature(), checkedNow: null };
    if (!this.#live(record, now)) return null;
    this.#used.add(copy); this.#check = record; this.#phase = 'checking'; this.#outcome = 'unattempted'; this.#applied = false;
    return record.token;
  }
  checkedAt(now, token, { observedAt, allowed } = {}) {
    if (!this.#enabled || !this.#check || token !== this.#check.token || this.#phase !== 'checking' ||
      observedAt !== now || !Number.isSafeInteger(observedAt) || typeof allowed !== 'boolean') return false;
    if (!this.advance(now) || !this.#check) return false;
    if (!allowed) this.#abort(now);
    else { this.#check.checkedNow = now; this.#phase = 'checked'; }
    return true; // Guard evidence is synthetic, never an OS permission grant.
  }
  handoffAt(now, token) {
    if (!this.#enabled || !this.#check || token !== this.#check.token || this.#phase !== 'checked' || !this.advance(now) || !this.#check) return null;
    if (this.#check.checkedNow !== now) { this.#abort(now); return null; }
    const check = this.#check; const text = this.#model.copyTextAt(now, check.copy);
    if (text === null) { this.#abort(now); return null; }
    const handle = Object.freeze({ text }); // Full business value, not display prefix.
    this.#job = { handle, session: check.session, copy: check.copy, reported: false };
    this.#check = null; this.#phase = 'in-flight'; this.#outcome = 'unknown'; this.#applied = false;
    return handle; // Crossing executor boundary is uncertain, not a write proof.
  }
  reportAt(now, handle, outcome) {
    if (!this.#enabled || !this.#job || handle !== this.#job.handle || this.#job.reported ||
      !['written', 'not-written', 'unknown'].includes(outcome) || !this.advance(now)) return false;
    this.#job.reported = true; this.#phase = 'awaiting-stop'; this.#outcome = outcome; this.#applied = false;
    if (outcome !== 'unknown' && this.#live(this.#job, now)) {
      this.#applied = this.#model.dispatchAt(now, 'copied', this.#job.copy, { written: outcome === 'written' }) === true;
    }
    return true; // Late truth is recorded locally, never replayed into a new run.
  }
  stoppedAt(now, handle, { stopped = false } = {}) {
    if (!this.#enabled || !this.#job || handle !== this.#job.handle || stopped !== true || !this.advance(now)) return false;
    this.#job = null; this.#phase = 'settled'; return true; // Stop alone leaves unknown unknown.
  }
  candidate() { return this.#enabled ? this.#model.candidate() : null; }
  sample() { return this.#enabled ? this.#model.sample() : null; }
  commit(frame) { return this.#enabled && this.#model.commit(frame); }
  snapshot() {
    return Object.freeze({ phase: this.#phase, outcome: this.#outcome, busy: this.#job !== null,
      applied: this.#applied, state: this.#model.snapshot() });
  }
}
