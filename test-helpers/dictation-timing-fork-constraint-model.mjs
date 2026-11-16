// Offline default-off wiring-readiness model for timer / lock-screen /
// suspend-resume and fork timing constraints (gap items 4 and 5 of the
// consumer boundary audit). Logical clock only: entry checks deadlines first,
// non-monotonic time fail-closes a permanent latch, suspend/resume invalidate
// the current run without auto-revive, and fork admission is gated behind an
// explicit enabled flag plus a one-slot in-flight job with a logical watchdog
// escalation (term -> grace -> kill -> explicit close event). No real timers,
// listeners, processes, signals or production wiring; `enabled` must be true
// or every entry is a rejected no-op.

export const runStates = new Set(['no-run', 'live', 'expired', 'suspended', 'resumed-dead']);
export const forkStates = new Set(['off', 'ready', 'in-flight', 'terminating', 'kill-requested', 'closed', 'failed']);

export class DictationTimingForkModel {
  #enabled; #ttl; #watchdogMs; #graceMs;
  #maxSeen = null; #latched = null; // clock-rewind latch, permanent for this run generation
  #run = null; // { state, token, deadline }
  #suspend = null; // { at, kind }
  #fork = null; // { state, startedAt, deadline, termAt, killAt, closedAt }
  #stats = { runsBegun: 0, runsExpired: 0, runsSuspended: 0, rewindRefused: 0,
    forkAttempts: 0, forkAdmitted: 0, watchdogFired: 0, closesAccepted: 0 };

  constructor({ enabled = false, sourceTtl = 10000, watchdogMs = 5000, forkGraceMs = 1000 } = {}) {
    if (!Number.isSafeInteger(sourceTtl) || sourceTtl < 1) throw new TypeError('invalid sourceTtl');
    if (!Number.isSafeInteger(watchdogMs) || watchdogMs < 1 || watchdogMs > 30000) throw new TypeError('invalid watchdogMs');
    if (!Number.isSafeInteger(forkGraceMs) || forkGraceMs < 1) throw new TypeError('invalid forkGraceMs');
    this.#enabled = enabled === true;
    this.#ttl = sourceTtl; this.#watchdogMs = watchdogMs; this.#graceMs = forkGraceMs;
  }
  get enabled() { return this.#enabled; }
  get latched() { return this.#latched !== null; }
  get stats() { return Object.freeze({ ...this.#stats }); }

  snapshot() {
    return Object.freeze({
      runState: this.#run ? this.#run.state : 'no-run',
      run: this.#run ? Object.freeze({ state: this.#run.state, deadline: this.#run.deadline }) : null,
      forkState: this.#fork ? this.#fork.state : 'off',
      fork: this.#fork ? Object.freeze({ state: this.#fork.state, deadline: this.#fork.deadline ?? null,
        termAt: this.#fork.termAt ?? null, killAt: this.#fork.killAt ?? null, closedAt: this.#fork.closedAt ?? null }) : null,
      suspend: this.#suspend ? Object.freeze({ ...this.#suspend }) : null,
      latchedReason: this.#latched, stats: this.stats });
  }

  // ---- monotonic clock guard ----------------------------------------------
  // Entry check first: every entry must present a logical now that never goes
  // backwards relative to anything seen. A rewind is refused and permanently
  // fail-closes the model until an explicit rebuildAt with a strictly-greater
  // now (a new generation; nothing is auto-revived).
  #timegate(now, { allowLatched = false } = {}) {
    if (!Number.isSafeInteger(now)) return 'invalid-clock';
    if (this.#maxSeen !== null && now < this.#maxSeen) {
      this.#latched = this.#latched ?? 'clock-rewound';
      this.#stats.rewindRefused += 1;
      return 'clock-rewound';
    }
    // While latched the clock is frozen: refused entries do not advance the
    // high-water mark, so a later rebuild needs only a strictly-greater now
    // than the last accepted one.
    if (this.#latched && !allowLatched) return this.#latched;
    if (this.#maxSeen === null || now > this.#maxSeen) this.#maxSeen = now;
    return null;
  }

  // Explicit new generation after a rewind or suspend latch. Requires a
  // strictly-greater now; clears the latch and leaves all runs/forks dead.
  rebuildAt(now) {
    // The rebuild entry is the only way out of a latch; a rewound now is
    // still refused by the monotonic check above.
    const reason = this.#timegate(now, { allowLatched: true });
    if (!this.#enabled || reason) return { accepted: false, reason: reason ?? 'disabled' };
    this.#latched = null;
    this.#run = null; this.#fork = null; this.#suspend = null;
    return { accepted: true };
  }

  // ---- run lifecycle with deadline-first entry check -----------------------
  beginRunAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return null;
    if (this.#run && this.#run.state === 'live') return null; // one live run
    if (this.#suspend) return null; // suspended: needs explicit rebuild first
    if (now >= Number.MAX_SAFE_INTEGER - this.#ttl) return null;
    const token = Object.freeze({});
    this.#run = { state: 'live', token, deadline: now + this.#ttl };
    this.#stats.runsBegun += 1;
    return token;
  }

  #expireRun(now) { this.#run = { state: 'expired', token: this.#run.token, deadline: this.#run.deadline };
    this.#stats.runsExpired += 1; }

  // Deadline is checked first on every entry; expiry is evaluated only at
  // explicit entry points (no automatic timer, no background scheduling).
  #refreshRun(now) {
    if (this.#run && this.#run.state === 'live' && now >= this.#run.deadline) this.#expireRun(now);
  }

  observeAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return { accepted: false, reason: reason ?? 'disabled' };
    this.#refreshRun(now);
    return { accepted: true, runState: this.#run ? this.#run.state : 'no-run' };
  }

  // Explicit lock/suspend event: invalidates a live run immediately. The run
  // is never auto-revived on resume; an explicit rebuildAt starts a new one.
  suspendAt(now, kind) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return false;
    if (!['lock', 'sleep'].includes(kind)) return false;
    this.#refreshRun(now);
    if (this.#run && this.#run.state === 'live') this.#stats.runsSuspended += 1;
    this.#run = this.#run && this.#run.state === 'live' ? { state: 'suspended', token: this.#run.token, deadline: this.#run.deadline } : this.#run;
    this.#suspend = { at: now, kind };
    this.#latched = 'suspended';
    return true;
  }

  resumeAt(now) {
    // Resume is the designated exit of the suspend latch (never of a rewind).
    const reason = this.#timegate(now, { allowLatched: this.#latched === 'suspended' });
    if (!this.#enabled || reason) return false;
    if (!this.#suspend || now <= this.#suspend.at) return false;
    this.#refreshRun(now);
    if (this.#run && this.#run.state === 'suspended') this.#run = { state: 'resumed-dead', token: this.#run.token, deadline: this.#run.deadline };
    this.#suspend = { ...this.#suspend, resumedAt: now };
    return true; // run stays dead; no auto-revive.
  }

  // ---- fork admission and escalation ---------------------------------------
  // Fork requires: global enabled, no rewind/suspend latch, no live run gate
  // violation, and no fork currently in flight. One slot only; a new fork
  // attempt while in flight is refused, never queued.
  forkAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return { accepted: false, reason: reason ?? 'disabled' };
    this.#refreshRun(now);
    if (this.#fork && this.#fork.state !== 'closed' && this.#fork.state !== 'failed') return { accepted: false, reason: 'fork-in-flight' };
    if (this.#run && this.#run.state === 'live') return { accepted: false, reason: 'run-live' };
    this.#fork = { state: 'in-flight', startedAt: now, deadline: now + this.#watchdogMs,
      termAt: null, killAt: null, closedAt: null };
    this.#stats.forkAttempts += 1;
    this.#stats.forkAdmitted += 1;
    return { accepted: true, jobId: this.#fork.startedAt };
  }

  // Logical watchdog: fires only at an explicit entry when now >= deadline.
  // Then escalation must follow term -> grace -> kill; kill is only valid
  // strictly after the grace window; close is only accepted after kill was
  // requested (close-before-kill is a protocol error, rejected).
  watchdogAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return { accepted: false, reason: reason ?? 'disabled' };
    if (!this.#fork || this.#fork.state !== 'in-flight') return { accepted: false, reason: 'no-in-flight-fork' };
    if (now < this.#fork.deadline) return { accepted: true, fired: false };
    this.#fork = { ...this.#fork, state: 'terminating', termAt: now };
    this.#stats.watchdogFired += 1;
    return { accepted: true, fired: true, state: 'terminating' };
  }

  forceKillAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return { accepted: false, reason: reason ?? 'disabled' };
    if (!this.#fork || this.#fork.state !== 'terminating') return { accepted: false, reason: 'not-terminating' };
    if (now < this.#fork.termAt + this.#graceMs) return { accepted: false, reason: 'grace-not-elapsed' };
    this.#fork = { ...this.#fork, state: 'kill-requested', killAt: now };
    return { accepted: true, state: 'kill-requested' };
  }

  // The close promise only resolves on an actual close event: recorded only
  // via this explicit entry, and only once kill has been requested. After
  // close the fork state is terminal; the slot frees for a future forkAt.
  closedAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return false;
    if (!this.#fork || this.#fork.state !== 'kill-requested') return false;
    this.#fork = { ...this.#fork, state: 'closed', closedAt: now };
    this.#stats.closesAccepted += 1;
    return true;
  }

  failForkAt(now) {
    const reason = this.#timegate(now);
    if (!this.#enabled || reason) return false;
    if (!this.#fork || !['in-flight', 'terminating', 'kill-requested'].includes(this.#fork.state)) return false;
    this.#fork = { ...this.#fork, state: 'failed' };
    return true;
  }
}
