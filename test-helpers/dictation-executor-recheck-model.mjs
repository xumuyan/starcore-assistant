// Offline default-off wiring-readiness model for the real input/clipboard
// executor boundary (gap item 2 of the consumer boundary audit). It composes
// the explicit-copy effect model with an executor-side TOCTOU recheck and a
// one-slot executor wait (wait, never queue). No real input, clipboard, timer,
// OS query or production wiring; `enabled` must be true or every entry is a
// rejected no-op. Guard evidence stays a trusted local assumption, never an OS
// permission grant.
import { DictationCopyEffectModel } from './dictation-copy-effect-model.mjs';

// Executor job phases.
// waiting    : a copy was requested while another executor job is in flight;
//              the request is refused and recorded as a wait, never queued.
// admitted   : executor accepted the handle after its own boundary recheck.
// refused    : boundary recheck denied (guard evidence stale or not allowed);
//              nothing was attempted, so the outcome is definitively
//              not-written (no write was issued by this executor).
// uncertain  : mid-flight loss/timeout/expiry; outcome stays unknown until the
//              executor reports (never downgraded to not-written).
// done       : outcome reported and executor stopped; slot released.
export const executorPhases = new Set(['idle', 'waiting', 'admitted', 'refused', 'uncertain', 'done']);

// Valid executor outcomes, same vocabulary as the copy effect boundary.
export const executorOutcomes = new Set(['written', 'not-written', 'unknown']);

export class DictationExecutorRecheckModel {
  #inner; #enabled;
  #job = null; // { handle, admittedAt, checkedNow, recheckedAt, reported, outcome, phase, attempt }
  #stats = { handsOff: 0, rechecksAccepted: 0, rechecksRefused: 0, waitsRecorded: 0, admissionRefused: 0 };
  constructor({ enabled = false, ...options } = {}) {
    this.#enabled = enabled === true;
    this.#inner = new DictationCopyEffectModel({ ...options, enabled: this.#enabled });
  }
  get enabled() { return this.#enabled; }
  get stats() { return Object.freeze({ ...this.#stats }); }
  get executorPhase() { return this.#job ? this.#job.phase : 'idle'; }

  // ---- delegation to the explicit-copy boundary ----------------------------
  advance(now) { return this.#inner.advance(now); }
  beginAt(now) { return this.#inner.beginAt(now); }
  receiveAt(now, token, envelope) { return this.#inner.receiveAt(now, token, envelope); }
  lostAt(now, token) { return this.#inner.lostAt(now, token); }
  dispatchAt(now, command, ...args) { return this.#inner.dispatchAt(now, command, ...args); }
  candidate() { return this.#inner.candidate(); }
  sample() { return this.#inner.sample(); }
  commit(frame) { return this.#inner.commit(frame); }

  // ---- prepare/check/handoff (same lifecycle as the copy effect model) -----
  prepareAt(now, session, copy) { return this.#inner.prepareAt(now, session, copy); }
  checkedAt(now, token, evidence) { return this.#inner.checkedAt(now, token, evidence); }

  // One executor slot. While a job occupies it, a second handoff is a refused
  // wait (recorded, not queued); the caller must retry explicitly later.
  handoffAt(now, token) {
    if (!this.#enabled) return null;
    if (this.#job && this.#job.phase !== 'done') {
      this.#stats.waitsRecorded += 1;
      this.#job = { ...this.#job, phase: 'waiting' };
      return null;
    }
    const handle = this.#inner.handoffAt(now, token);
    if (handle === null) return null;
    this.#job = { handle, admittedAt: now, recheckedAt: null, reported: false,
      outcome: 'unknown', phase: 'idle', attempt: 0 };
    this.#stats.handsOff += 1;
    return handle;
  }

  // ---- executor-boundary TOCTOU recheck ------------------------------------
  // The executor must recheck at its own execution boundary before any real
  // write. `evidence.observedAt` must equal the recheck now (no cached guard
  // snapshots), and `allowed` must be true. The recheck happens exactly once
  // per admitted job; a second recheck is refused without side effects.
  // If the recheck denies, nothing is attempted and the executor records
  // not-written (definitively no write issued by this executor).
  recheckAt(now, handle, { observedAt, allowed } = {}) {
    // A 'waiting' phase only marks a refused second handoff; the original job
    // is still pre-admission, so its boundary recheck remains valid.
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (!this.#job || handle !== this.#job.handle || !['idle', 'waiting'].includes(this.#job.phase)) {
      this.#stats.admissionRefused += 1;
      return { accepted: false, reason: 'no-job-at-boundary' };
    }
    if (observedAt !== now || !Number.isSafeInteger(observedAt) || typeof allowed !== 'boolean') {
      this.#stats.admissionRefused += 1;
      return { accepted: false, reason: 'invalid-evidence' };
    }
    if (!this.advance(now)) return { accepted: false, reason: 'state-advance-failed' };
    if (allowed !== true) {
      this.#job = { ...this.#job, phase: 'refused', outcome: 'not-written', attempt: 0 };
      this.#stats.rechecksRefused += 1;
      return { accepted: true, decision: 'refused-not-written' };
    }
    this.#job = { ...this.#job, phase: 'admitted', recheckedAt: now, attempt: 1 };
    this.#stats.rechecksAccepted += 1;
    return { accepted: true, decision: 'admitted-once' };
  }

  // Executor reports its real result. A refusal above already fixed
  // not-written; a report after refusal/stop is rejected. Mid-flight expiry or
  // loss leaves the outcome unknown; a report may still arrive with unknown
  // and never upgrades to written after uncertainty is latched.
  expireAt(now, handle) {
    if (!this.#enabled || !this.#job || handle !== this.#job.handle) return false;
    if (this.#job.phase === 'refused' || this.#job.phase === 'done') return false;
    this.#job = { ...this.#job, phase: 'uncertain', outcome: 'unknown' };
    return true;
  }

  reportAt(now, handle, outcome) {
    if (!this.#enabled || !this.#job || handle !== this.#job.handle || this.#job.reported) return false;
    if (!executorOutcomes.has(outcome)) return false;
    if (this.#job.phase === 'refused' || this.#job.phase === 'done') return false;
    if (this.#job.phase === 'uncertain' && outcome !== 'unknown') return false;
    if (!this.advance(now)) return false;
    const result = this.#inner.reportAt(now, handle, outcome);
    if (!result) return false;
    this.#job = { ...this.#job, reported: true, outcome };
    return true;
  }

  stoppedAt(now, handle) {
    if (!this.#enabled || !this.#job || handle !== this.#job.handle) return false;
    const result = this.#inner.stoppedAt(now, handle, { stopped: true });
    if (!result) return false;
    this.#job = { ...this.#job, phase: 'done' };
    return true;
  }

  snapshot() {
    const inner = this.#inner.snapshot();
    return Object.freeze({
      executorPhase: this.executorPhase,
      executorJob: this.#job ? Object.freeze({ phase: this.#job.phase, outcome: this.#job.outcome,
        reported: this.#job.reported, rechecked: this.#job.recheckedAt !== null }) : null,
      stats: this.stats, state: inner });
  }
}
