// Offline default-off single-instance and data-safety model (SC-20261115-020).
// T1 gap (PLAN.md): single-instance / single-consumer / data safety. This model
// covers, with pure logic only:
//   - single-instance mutual-exclusive claim (one live claim at a time);
//   - duplicate startup is fail-closed (permanent latch, no takeover);
//   - instance retirement is irreversible (the claim slot is never re-bindable);
//   - local data writes land only on a fixed whitelist of EXISTING encrypted
//     record paths; unknown paths and plaintext payloads are refused. The API
//     never accepts file content at all, so no plaintext can enter via this model.
// No real filesystem, clipboard, input injection, system listeners, processes,
// timers or production wiring; `enabled` must be true or every entry is a
// rejected no-op.

export const instanceStates = new Set(['unclaimed', 'claimed', 'retired', 'contended']);
export const writeVerdicts = new Set(['accepted', 'unknown-path', 'retired', 'disabled', 'latched']);

// Path rules, encoded once and checked by tests and by the model itself:
// - the whitelist is fixed at construction from an explicitly provided list of
//   existing encrypted-record paths (caller responsibility to exist on disk in
//   production; the model only checks membership);
// - membership is exact-string; no prefix matching, no normalization, no
//   directory expansion;
// - a write request carries a path and a `kind` tag; only kind 'encrypted-record'
//   on a whitelisted path is accepted. There is no content parameter anywhere.
export const writeKinds = new Set(['encrypted-record', 'plaintext']);

export class DictationSingleInstanceModel {
  #enabled;
  #paths;          // Set of allowed encrypted-record paths (exact strings)
  #state = 'unclaimed';
  #instanceId = null;
  #latched = false; // fail-closed latch: duplicate startup / retired writes
  #stats = { claimsAccepted: 0, claimsRejected: 0, duplicateStartups: 0, writesAccepted: 0, writesRefused: 0 };
  #onFail = null;

  constructor({ enabled = false, encryptedRecordPaths = [], onFail } = {}) {
    this.#enabled = enabled === true;
    if (!Array.isArray(encryptedRecordPaths)) throw new TypeError('encryptedRecordPaths must be an array');
    for (const p of encryptedRecordPaths) {
      if (typeof p !== 'string' || p.length === 0) throw new TypeError('invalid path');
      if (typeof p === 'string' && (p.endsWith('/') || p.endsWith('\\'))) throw new TypeError('path must be a file');
    }
    if (new Set(encryptedRecordPaths).size !== encryptedRecordPaths.length) throw new TypeError('duplicate path');
    if (onFail !== undefined && typeof onFail !== 'function') throw new TypeError('invalid onFail');
    this.#onFail = typeof onFail === 'function' ? onFail : null;
    this.#paths = Object.freeze(new Set(encryptedRecordPaths));
  }

  get enabled() { return this.#enabled; }
  get state() { return this.#state; }
  get latched() { return this.#latched; }
  get instanceId() { return this.#instanceId; }
  get allowedPaths() { return [...this.#paths]; }
  get stats() { return Object.freeze({ ...this.#stats }); }

  #fail(reason) {
    if (this.#onFail) this.#onFail(reason);
  }

  // ---- single-instance claim ------------------------------------------------
  // Exactly one instance may hold the claim. A second claim attempt while one
  // is held is a duplicate startup: refused, latched fail-closed permanently.
  claim(instanceId) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (typeof instanceId !== 'string' || instanceId.length === 0) return { accepted: false, reason: 'invalid-instance' };
    if (this.#latched) return { accepted: false, reason: 'latched' };
    if (this.#state === 'retired') return { accepted: false, reason: 'retired' };
    if (this.#state === 'claimed') {
      this.#stats.duplicateStartups += 1;
      this.#latched = true;
      this.#state = 'contended';
      this.#fail('duplicate-startup');
      return { accepted: false, reason: 'duplicate-startup' };
    }
    this.#state = 'claimed';
    this.#instanceId = instanceId;
    this.#stats.claimsAccepted += 1;
    return { accepted: true, instance: instanceId };
  }

  // Voluntary release of a live claim (not retirement): the slot becomes
  // available again, but only while not latched and not retired.
  release(instanceId) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (this.#latched) return { accepted: false, reason: 'latched' };
    if (this.#state !== 'claimed' || instanceId !== this.#instanceId) {
      return { accepted: false, reason: 'not-holder' };
    }
    this.#state = 'unclaimed';
    this.#instanceId = null;
    return { accepted: true };
  }

  // Retirement is irreversible: after it, no claim ever succeeds again and a
  // holder disappears immediately. There is no unretire.
  retire(instanceId) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (this.#state !== 'claimed' || instanceId !== this.#instanceId) return { accepted: false, reason: 'not-holder' };
    this.#state = 'retired';
    this.#instanceId = null;
    this.#fail('instance-retired');
    return { accepted: true };
  }

  // ---- data safety ----------------------------------------------------------
  // A write request is a (path, kind) pair. Content is never a parameter, so
  // this API cannot carry plaintext data at all. Only kind
  // 'encrypted-record' on an exact whitelisted path is accepted; 'plaintext'
  // is refused everywhere, and unknown paths are refused even for encrypted
  // records (no new files, no new directories).
  beginWrite({ path, kind } = {}) {
    if (!this.#enabled) return { verdict: 'disabled', accepted: false, reason: 'disabled' };
    if (this.#latched) return { verdict: 'latched', accepted: false, reason: 'latched' };
    if (this.#state === 'retired') return { verdict: 'retired', accepted: false, reason: 'retired' };
    if (!this.#paths.has(path) || !writeKinds.has(kind) || kind === 'plaintext') {
      this.#stats.writesRefused += 1;
      const reason = writeKinds.has(kind) && kind !== 'plaintext' ? 'unknown-path' : 'plaintext-or-invalid';
      return { verdict: writeKinds.has(kind) && kind !== 'plaintext' ? 'unknown-path' : 'plaintext-or-invalid', accepted: false, reason };
    }
    this.#stats.writesAccepted += 1;
    return { verdict: 'accepted', accepted: true, path, kind };
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      instanceId: this.#instanceId,
      latched: this.#latched,
      stats: this.stats,
    });
  }
}
