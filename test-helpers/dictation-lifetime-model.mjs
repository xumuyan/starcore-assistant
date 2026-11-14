// Offline bounded-candidate policy proposal. Explicit logical time/events ONLY;
// no wall clock, timers, OS subscriptions, clipboard or production imports.
import { DictationTransitionModel } from './dictation-transition-model.mjs';
const cleanup = new Set(['close', 'disconnect', 'released', 'hide', 'dismiss']);
export class DictationLifetimeModel {
  #model; #enabled; #ttl; #now = 0; #deadline = null; #session = null; #reason = null;
  #locked = false; #settingsEnabled = true;
  constructor({ enabled = false, epoch, candidateTtl = 30000, maxRevision, coalesceMeters = false } = {}) {
    if (!Number.isSafeInteger(candidateTtl) || candidateTtl < 1) throw new TypeError('invalid lifetime options');
    this.#enabled = enabled === true; this.#ttl = candidateTtl;
    this.#model = new DictationTransitionModel({ enabled: this.#enabled, epoch, maxRevision, coalesceMeters });
  }
  #sync() {
    const state = this.#model.snapshot().coordinator;
    if (state.session !== this.#session) {
      this.#session = state.session; this.#deadline = null;
      if (state.session) this.#reason = null;
    }
    if (!state.connected || state.closing || !state.session) this.#deadline = null;
    return state;
  }
  #invalidate(reason) {
    const state = this.#sync(); this.#deadline = null; this.#reason = reason;
    if (state.session) this.#model.dispatch('close', state.session, 'cancel');
    this.#sync(); // Close never supplies resource stopped proofs.
  }
  advance(now) {
    if (!this.#enabled || !Number.isSafeInteger(now) || now < this.#now) return false;
    this.#now = now;
    if (this.#deadline !== null && now >= this.#deadline) this.#invalidate('expired');
    return true;
  }
  event(type, epoch, session = null) {
    if (!this.#enabled || epoch !== this.#sync().epoch) return false;
    if (type === 'lock') { this.#locked = true; this.#invalidate('locked'); }
    else if (type === 'disable') { this.#settingsEnabled = false; this.#invalidate('disabled'); }
    else if (type === 'unlock') this.#locked = false;
    else if (type === 'enable') this.#settingsEnabled = true;
    else if (type === 'entry-replaced') {
      const state = this.#sync();
      if (!session || session !== state.session || state.closing) return false;
      this.#invalidate('entry-replaced');
    } else return false;
    return true; // Synthetic trusted source; not an authenticated system event.
  }
  dispatch(command, ...args) {
    if (!this.#enabled) return null;
    this.#sync();
    if ((this.#locked || !this.#settingsEnabled) && !cleanup.has(command)) return null;
    // This proposal owns dictation only, never replaces the conversation path.
    if (command === 'reserve' && (args[0]?.mode !== 'dictation' || args[0]?.origin !== 'right-control')) return null;
    const result = this.#model.dispatch(command, ...args); this.#sync();
    if (result !== null && result !== false && result !== undefined) {
      if (command === 'result' && args[2] === 'not-issued') {
        if (this.#now > Number.MAX_SAFE_INTEGER - this.#ttl) this.#invalidate('clock-exhausted');
        else this.#deadline = this.#now + this.#ttl;
      }
      if (command === 'dismiss' || (command === 'copied' && args[1]?.written === true)) this.#deadline = null;
    }
    return result;
  }
  sample() { if (!this.#enabled) return null; this.#sync(); return this.#model.sample(); }
  commit(frame) { if (!this.#enabled) return false; this.#sync(); return this.#model.commit(frame); }
  candidate() { return this.#enabled ? this.#model.candidate() : null; }
  copyText(copy) { return this.#enabled ? this.#model.copyText(copy) : null; }
  snapshot() {
    this.#sync();
    return Object.freeze({ now: this.#now, deadline: this.#deadline, reason: this.#reason,
      locked: this.#locked, settingsEnabled: this.#settingsEnabled, state: this.#model.snapshot() });
  }
}
