// Offline handshake proposal ONLY. Tokens are local query ownership, not IPC
// authentication. No timer, liveness detector, system query or subscriptions.
import { DictationEventOrderModel } from './dictation-event-order-model.mjs';
const cleanup = new Set(['close', 'disconnect', 'released', 'hide', 'dismiss']);
export class DictationSourceSyncModel {
  #model; #enabled; #phase = 'offline'; #token = null;
  #fresh = { lock: false, settings: false };
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#model = new DictationEventOrderModel({ ...options, enabled: this.#enabled });
  }
  #offline() { this.#phase = 'offline'; this.#token = null; this.#fresh = { lock: false, settings: false }; }
  beginAt(now) {
    if (!this.#enabled || this.#phase !== 'offline' || !this.#model.advance(now)) return null;
    this.#token = Object.freeze({}); this.#phase = 'syncing'; return this.#token;
  }
  lostAt(now, token) {
    if (!this.#enabled || !this.#token || token !== this.#token || !this.#model.advance(now)) return false;
    this.#offline(); // Revoke old query/update ownership before closing business.
    const session = this.#model.snapshot().lifetime.state.coordinator.session;
    if (session) this.#model.dispatchAt(now, 'close', session, 'cancel');
    return true; // Not a resource-stopped proof or automatic voice disconnect.
  }
  receiveAt(now, token, { kind, ...envelope } = {}) {
    if (!this.#enabled || !this.#token || token !== this.#token ||
      !['snapshot', 'update'].includes(kind)) return false;
    if (!this.#model.receiveAt(now, envelope)) return false;
    if (kind === 'snapshot') this.#fresh[envelope.channel] = true;
    if (this.#fresh.lock && this.#fresh.settings) this.#phase = 'ready';
    return true; // Ready means both snapshots observed, not work permitted.
  }
  dispatchAt(now, command, ...args) {
    if (!this.#enabled) return null;
    if (this.#phase !== 'ready' && !cleanup.has(command)) { this.#model.advance(now); return null; }
    const result = this.#model.dispatchAt(now, command, ...args);
    // A changed voice epoch invalidates query envelopes, but never resets the
    // source high-water marks or logical time held by the original model.
    if (command === 'restart' && result !== null && result !== false && result !== undefined) this.#offline();
    return result;
  }
  advance(now) { return this.#enabled && this.#model.advance(now); }
  sample() { return this.#enabled ? this.#model.sample() : null; }
  commit(frame) { return this.#enabled && this.#model.commit(frame); }
  candidate() { return this.#enabled && this.#phase === 'ready' ? this.#model.candidate() : null; }
  copyTextAt(now, copy) {
    if (!this.advance(now) || this.#phase !== 'ready') return null;
    return this.#model.copyTextAt(now, copy);
  }
  snapshot() {
    return Object.freeze({ phase: this.#phase, fresh: Object.freeze({ ...this.#fresh }), state: this.#model.snapshot() });
  }
}
