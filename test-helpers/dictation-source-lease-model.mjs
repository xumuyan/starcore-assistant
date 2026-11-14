// Offline source freshness budget. Trusted observation times are assumptions,
// not authenticated OS evidence. Explicit logical clock only; no timers/effects.
import { DictationSourceSyncModel } from './dictation-source-sync-model.mjs';
export class DictationSourceLeaseModel {
  #model; #enabled; #ttl; #token = null; #started = 0; #reason = null;
  #deadlines = { lock: null, settings: null }; #observed = { lock: null, settings: null };
  constructor({ enabled = false, sourceTtl = 10000, ...options } = {}) {
    if (!Number.isSafeInteger(sourceTtl) || sourceTtl < 1) throw new TypeError('invalid source lease options');
    this.#enabled = enabled === true; this.#ttl = sourceTtl;
    this.#model = new DictationSourceSyncModel({ ...options, enabled: this.#enabled });
  }
  #clear(reason) {
    this.#token = null; this.#deadlines = { lock: null, settings: null };
    this.#observed = { lock: null, settings: null }; this.#reason = reason;
  }
  #sync() { if (this.#model.snapshot().phase === 'offline' && this.#token) this.#clear('source-offline'); }
  #expire(now, reason) {
    this.#model.lostAt(now, this.#token); this.#clear(reason);
  }
  advance(now) {
    if (!this.#enabled || !this.#model.advance(now)) return false;
    this.#sync();
    if (this.#token && Object.values(this.#deadlines).some(deadline => now >= deadline)) this.#expire(now, 'source-expired');
    return true;
  }
  beginAt(now) {
    if (!this.advance(now) || this.#model.snapshot().phase !== 'offline') return null;
    if (now > Number.MAX_SAFE_INTEGER - this.#ttl) { this.#reason = 'clock-exhausted'; return null; }
    const token = this.#model.beginAt(now); if (!token) return null;
    this.#token = token; this.#started = now; this.#reason = null;
    this.#deadlines = { lock: now + this.#ttl, settings: now + this.#ttl };
    return token;
  }
  receiveAt(now, token, envelope = {}) {
    const { kind, channel, epoch, version, value, observedAt } = envelope;
    const state = this.#model.snapshot().state;
    if (!this.#enabled || !this.#token || token !== this.#token || !['snapshot', 'update'].includes(kind) ||
      !Object.hasOwn(this.#deadlines, channel) || epoch !== state.lifetime.state.coordinator.epoch ||
      !Number.isSafeInteger(version) || version <= state.versions[channel] || typeof value !== 'boolean') return false;
    // Snapshot time comes from trusted observation, never from arrival. A newer
    // source version does not turn a delayed cached value into fresh evidence.
    if (kind === 'snapshot' && (!Number.isSafeInteger(observedAt) || observedAt < this.#started || observedAt > now ||
      (this.#observed[channel] !== null && observedAt < this.#observed[channel]))) return false;
    if (!this.advance(now) || token !== this.#token) return false;
    if (kind === 'snapshot' && observedAt > Number.MAX_SAFE_INTEGER - this.#ttl) {
      this.#expire(now, 'clock-exhausted'); return false;
    }
    if (kind === 'snapshot' && now >= observedAt + this.#ttl) {
      this.#expire(now, 'source-expired'); return false;
    }
    if (!this.#model.receiveAt(now, token, envelope)) return false;
    if (kind === 'snapshot') {
      this.#observed[channel] = observedAt; this.#deadlines[channel] = observedAt + this.#ttl;
    }
    return true;
  }
  lostAt(now, token) {
    if (!this.#enabled || !this.#token || token !== this.#token || !this.advance(now) || token !== this.#token) return false;
    const result = this.#model.lostAt(now, token); if (result) this.#clear('source-lost'); return result;
  }
  dispatchAt(now, command, ...args) {
    if (!this.advance(now)) return null;
    const result = this.#model.dispatchAt(now, command, ...args); this.#sync(); return result;
  }
  copyTextAt(now, copy) { return this.advance(now) ? this.#model.copyTextAt(now, copy) : null; }
  candidate() { return this.#enabled ? this.#model.candidate() : null; }
  sample() { return this.#enabled ? this.#model.sample() : null; }
  commit(frame) { return this.#enabled && this.#model.commit(frame); }
  snapshot() {
    return Object.freeze({ reason: this.#reason, deadlines: Object.freeze({ ...this.#deadlines }),
      observed: Object.freeze({ ...this.#observed }), state: this.#model.snapshot() });
  }
}
