// Offline trusted-source proposal only. No OS events, wall clock or IPC.
import { DictationLifetimeModel } from './dictation-lifetime-model.mjs';
export class DictationEventOrderModel {
  #model; #enabled; #versions = { lock: 0, settings: 0 };
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#model = new DictationLifetimeModel({ ...options, enabled: this.#enabled });
    const epoch = this.#model.snapshot().state.coordinator.epoch;
    // Unknown initial system state must not permit work before both snapshots.
    this.#model.event('lock', epoch); this.#model.event('disable', epoch);
  }
  receiveAt(now, { epoch, channel, version, value } = {}) {
    if (!this.#enabled || epoch !== this.#model.snapshot().state.coordinator.epoch ||
      !Object.hasOwn(this.#versions, channel) || !Number.isSafeInteger(version) ||
      version < 1 || version <= this.#versions[channel] || typeof value !== 'boolean') return false;
    if (!this.#model.advance(now)) return false;
    // A saturated source cannot report a subsequent restriction: fail closed
    // even when its final accepted value would otherwise permit work.
    const saturated = version === Number.MAX_SAFE_INTEGER;
    const type = channel === 'lock' ? (value || saturated ? 'lock' : 'unlock') : (value && !saturated ? 'enable' : 'disable');
    if (!this.#model.event(type, epoch)) return false;
    this.#versions[channel] = version; return true;
  }
  dispatchAt(now, command, ...args) {
    if (!this.#enabled || !this.#model.advance(now)) return null;
    return this.#model.dispatch(command, ...args);
  }
  replaceAt(now, epoch, session) {
    if (!this.#enabled || epoch !== this.#model.snapshot().state.coordinator.epoch ||
      !session || session !== this.#model.snapshot().state.coordinator.session ||
      this.#model.snapshot().state.coordinator.closing) return false;
    return this.#model.advance(now) && this.#model.event('entry-replaced', epoch, session);
  }
  advance(now) { return this.#enabled && this.#model.advance(now); }
  sample() { return this.#enabled ? this.#model.sample() : null; }
  commit(frame) { return this.#enabled && this.#model.commit(frame); }
  candidate() { return this.#enabled ? this.#model.candidate() : null; }
  copyTextAt(now, copy) { return this.advance(now) ? this.#model.copyText(copy) : null; }
  snapshot() { return Object.freeze({ versions: Object.freeze({ ...this.#versions }), lifetime: this.#model.snapshot() }); }
}
