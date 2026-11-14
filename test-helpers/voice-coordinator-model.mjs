// Offline contract model ONLY. Imported by tests, never by the app or preview.
// Object handles represent trusted pre-captured ownership, NOT IPC authentication.
import { initialVoiceView, reduceVoiceView } from '../desktop/frontend/voice-view-state.mjs';

const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const roles = new Set(['capture', 'asr', 'chat', 'tts', 'player', 'writer']);
const events = {
  capture: new Set(['meter']), asr: new Set(['transcript']),
  chat: new Set(['reply', 'reply-muted']), tts: new Set(['synthesis-started', 'playback-failed']),
  player: new Set(['playback-started', 'playback-ended', 'playback-failed', 'meter']), writer: new Set(),
};

export class VoiceCoordinatorModel {
  #enabled; #epoch; #epochs; #max; #run = 0; #session = null;
  #closing = false; #leases = new Map(); #used = new Set(); #requests = new Set();
  #view = initialVoiceView; #connected = true;
  #coalesce; #meter = null;

  constructor({ enabled = false, epoch, maxCounter = Number.MAX_SAFE_INTEGER, coalesceMeters = false } = {}) {
    if (!id(epoch) || !Number.isSafeInteger(maxCounter) || maxCounter < 2) throw new TypeError('invalid model options');
    this.#enabled = enabled === true; this.#epoch = epoch; this.#epochs = new Set([epoch]); this.#max = maxCounter;
    this.#coalesce = coalesceMeters === true;
  }

  snapshot() {
    return Object.freeze({ epoch: this.#epoch, connected: this.#connected, session: this.#session, closing: this.#closing,
      pending: Object.freeze([...this.#leases.values()]), queuedMeters: this.#meter ? 1 : 0, view: this.#view });
  }

  reserve({ origin, mode, requestId } = {}) {
    if (!this.#enabled || !this.#connected || this.#session || this.#run >= this.#max) return null;
    if (!((origin === 'wake' && mode === 'conversation' && id(requestId)) ||
      (origin === 'right-control' && mode === 'dictation' && uuid(requestId)))) return null;
    const key = requestId.toLowerCase();
    if (this.#requests.has(key)) return null;
    this.#requests.add(key);
    this.#session = Object.freeze({ epoch: this.#epoch, run: ++this.#run, origin, mode, requestId });
    return this.#session;
  }

  #current(session) { return session != null && this.#session === session; }
  #owned(ticket) { return ticket != null && this.#leases.get(ticket.resource) === ticket; }

  acquire(session, resource, operationId) {
    if (!this.#current(session) || this.#closing || !roles.has(resource) || !id(operationId) ||
      this.#leases.has(resource) || this.#used.has(operationId)) return null;
    // Preparing permits capture/model preparation only, never output or writing.
    if (!this.#view.active && !['capture', 'asr'].includes(resource)) return null;
    if (session.mode === 'dictation' && ['chat', 'tts', 'player'].includes(resource)) return null;
    // Capture belongs to preparation/listening; it cannot be restarted mid-reply.
    if (resource === 'capture' && this.#view.active && this.#view.activity !== 'listening') return null;
    this.#used.add(operationId);
    const ticket = Object.freeze({ ...session, resource, operationId });
    this.#leases.set(resource, ticket);
    return ticket;
  }

  inputReady(session, capture) {
    if (!this.#current(session) || this.#closing || this.#view.active ||
      !this.#owned(capture) || capture.resource !== 'capture') return false;
    const next = reduceVoiceView(this.#view, { type: 'begin', run: session.run, seq: 0, mode: session.mode });
    if (next === this.#view) return false;
    this.#view = next; return true;
  }

  #apply(payload) {
    // Keep one safe sequence value available for immediate terminal cancellation.
    if (!this.#view.active || this.#view.seq >= this.#max - 1) return false;
    const next = reduceVoiceView(this.#view, { ...payload, run: this.#session.run, seq: this.#view.seq + 1 });
    if (next === this.#view) return false;
    this.#view = next; return true;
  }

  deliver(ticket, event) {
    if (this.#closing || !this.#owned(ticket) || !event || !events[ticket.resource].has(event.type)) return false;
    if (event.type === 'meter' && event.source !== (ticket.resource === 'capture' ? 'input' : 'output')) return false;
    // Copy only view data. Caller-supplied run/seq/phase cannot overwrite identity.
    const payload = { type: event.type, text: event.text, source: event.source, level: event.level };
    if (this.#coalesce && event.type === 'meter') {
      // A single active source/owner: retain only its newest valid sample, no seq yet.
      // Reserve the last ordinary seq for a lifecycle/text event, plus terminal seq.
      if (!this.#view.active || this.#view.seq >= this.#max - 2 ||
        reduceVoiceView(this.#view, { ...payload, run: this.#session.run, seq: this.#view.seq + 1 }) === this.#view) return false;
      this.#meter = { ticket, payload }; return true; // Buffered, NOT delivered.
    }
    const accepted = this.#apply(payload);
    // A successful non-meter event is a barrier; never flush an older sample after it.
    if (accepted) this.#meter = null;
    return accepted;
  }

  flushMeter(session) {
    if (!this.#current(session) || this.#closing || !this.#meter) return false;
    const { ticket, payload } = this.#meter; this.#meter = null;
    if (!this.#owned(ticket) || this.#view.seq >= this.#max - 2) return false;
    return this.#apply(payload);
  }

  process(session) {
    if (!this.#current(session) || this.#closing || this.#leases.has('capture')) return false;
    const accepted = this.#apply({ type: 'process' });
    if (accepted) this.#meter = null;
    return accepted;
  }

  close(session, type = 'cancel') {
    if (!this.#current(session) || !['cancel', 'end', 'fail'].includes(type)) return false;
    if (this.#closing) return true; // Idempotent; do not issue a second terminal event.
    this.#closing = true; // Invalidate deliveries BEFORE hiding the view.
    this.#meter = null; // Terminal events bypass sampling; no flush or async wait.
    if (this.#view.active) this.#view = reduceVoiceView(this.#view,
      { type, run: session.run, seq: this.#view.seq + 1 });
    this.#settle(); return true;
  }

  released(ticket, { stopped = false } = {}) {
    // This is a separate synthetic ownership acknowledgement, not a view event.
    // Failed/timeout acknowledgements retain the gate. No timers or retries here.
    if (stopped !== true || !this.#owned(ticket)) return false;
    if (this.#meter?.ticket === ticket) this.#meter = null;
    this.#leases.delete(ticket.resource); this.#settle(); return true;
  }

  #settle() {
    if (this.#closing && this.#leases.size === 0) { this.#session = null; this.#closing = false; }
  }

  disconnect(epoch) {
    // Synthetic transport loss: block new reservations even AFTER leases drain.
    // Release acknowledgements use the separately retained local owner tickets.
    if (epoch !== this.#epoch) return false;
    this.#connected = false;
    if (this.#session) this.close(this.#session, 'fail');
    return true;
  }

  restart(epoch) {
    // Model of a drained teardown + new view instance, NOT a live process restart.
    if (this.#session || !id(epoch) || this.#epochs.has(epoch)) return false;
    this.#epochs.add(epoch); this.#epoch = epoch; this.#run = 0; this.#connected = true;
    this.#used.clear(); this.#requests.clear(); this.#view = initialVoiceView; this.#meter = null;
    return true;
  }
}
