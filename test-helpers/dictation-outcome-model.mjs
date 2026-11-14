// Offline proposal ONLY. No paste/clipboard calls, OS events, timers or IPC.
// Handles simulate trusted local ownership; booleans are synthetic owner proofs.
export class DictationOutcomeModel {
  #model; #projection; #enabled; #session = null; #writer = null; #attempt = null;
  #candidate = null; #copy = null; #text = ''; #status = 'hidden'; #paste = 'unattempted';

  constructor(model, projection, { enabled = false } = {}) {
    this.#model = model; this.#projection = projection; this.#enabled = enabled === true;
  }

  #clear() { this.#text = ''; this.#candidate = null; this.#copy = null; this.#status = 'hidden'; }
  #synchronize() {
    const state = this.#model.snapshot();
    if (state.session && state.session !== this.#session) {
      this.#session = state.session; this.#writer = null; this.#attempt = null;
      this.#paste = 'unattempted'; this.#clear();
    }
    const live = this.#enabled && state.connected && !state.closing && state.session &&
      state.session === this.#session && state.session.mode === 'dictation' &&
      state.view.active && state.view.activity === 'thinking';
    if (!live) this.#clear(); // Lazy cleanup, not physical cancellation or erasure.
    return live ? state : null;
  }

  snapshot() {
    this.#synchronize();
    return Object.freeze({ status: this.#status, pasteDisposition: this.#paste,
      canCopy: this.#candidate !== null && this.#copy === null, copying: this.#copy !== null });
  }

  begin(receipt, writer) {
    const state = this.#synchronize();
    if (!state || this.#attempt || !state.pending.includes(writer) || writer.resource !== 'writer') return null;
    const text = this.#projection.writerText(receipt, writer);
    if (text === null) return null;
    this.#text = text; this.#writer = writer; this.#attempt = Object.freeze({}); this.#status = 'preparing';
    return this.#attempt; // No payload or permission to dispatch a paste.
  }

  result(attempt, writer, disposition) {
    const state = this.#synchronize();
    if (!state || !this.#attempt || attempt !== this.#attempt || writer !== this.#writer ||
      !state.pending.includes(writer) || this.#status !== 'preparing' ||
      !['issued', 'not-issued', 'unknown'].includes(disposition)) return false;
    this.#paste = disposition;
    if (disposition === 'not-issued') {
      this.#status = 'copy-available'; this.#candidate = Object.freeze({});
    } else {
      this.#status = disposition === 'issued' ? 'paste-issued' : 'paste-uncertain'; this.#text = '';
    }
    return true; // Outcome is NOT a stopped acknowledgement or target acceptance.
  }

  candidate() { this.#synchronize(); return this.#candidate; }

  requestCopy(candidate, { userInitiated = false } = {}) {
    if (!this.#synchronize() || !this.#candidate || candidate !== this.#candidate ||
      this.#copy || userInitiated !== true) return null;
    this.#copy = Object.freeze({}); this.#status = 'copying';
    return this.#copy; // A simulated explicit action, not an authenticated UI gesture.
  }

  copyText(copy) {
    if (!this.#synchronize() || !this.#copy || copy !== this.#copy) return null;
    return this.#text; // Read-only candidate, not a clipboard side effect.
  }

  copied(copy, { written } = {}) {
    if (!this.#synchronize() || !this.#copy || copy !== this.#copy || typeof written !== 'boolean') return false;
    this.#copy = null;
    if (written) { this.#candidate = null; this.#text = ''; this.#status = 'copied'; }
    else this.#status = 'copy-available'; // New explicit action required; no automatic retry.
    return true;
  }

  dismiss() {
    if (!this.#synchronize()) return false;
    this.#clear(); return true; // Also models explicit expiry; never schedules a timer.
  }
}
