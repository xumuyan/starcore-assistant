// Offline default-off renderer/IPC acknowledgment protocol model.
// Gap items 1 and 3 of docs/verification/2026-11-15-dictation-consumer-boundary.md:
// prepare -> renderer presentation update -> confirmation ack, plus single-consumer
// identity authentication. No real UI, input, clipboard, service or production wiring;
// `enabled` must be true or every entry is a rejected no-op.
import { randomUUID } from 'node:crypto';
import { exactMessage, validJobId, validPresentation } from './dictation-presentation-worker.mjs';

// Ack types are a fixed whitelist; every ack carries the exact three keys and
// the single registered consumer identity token.
export const ackTypes = new Set(['rendered', 'hidden-ack']);
export const ackKeys = ['type', 'id', 'consumer'];

// Protocol states for one in-flight prepare job.
// pending  : prepare sent, waiting for the renderer ack.
// rendered : matching 'rendered' ack validated; presentation update confirmed.
// hidden   : matching 'hidden-ack' validated for an invalidation id.
// failed   : fail-closed latch; latched on late/duplicate/unknown/malformed/
//            impersonated acks and stays failed (no retry, no reset).
export const protocolStates = new Set(['idle', 'pending', 'rendered', 'hidden', 'failed']);

export class DictationRendererAckProtocol {
  #enabled; #consumerId = null; #retired = false;
  #job = null; // { id, kind: 'show'|'hide', state }
  #stats = { preparesSent: 0, acksAccepted: 0, acksRejected: 0 };
  #onFail = null;
  constructor({ enabled = false, onFail } = {}) {
    this.#enabled = enabled === true;
    if (onFail !== undefined && typeof onFail !== 'function') throw new TypeError('invalid onFail');
    this.#onFail = typeof onFail === 'function' ? onFail : null;
  }
  get enabled() { return this.#enabled; }
  get consumerAuthenticated() { return this.#consumerId !== null && !this.#retired; }
  get state() { return this.#job ? this.#job.state : 'idle'; }
  get stats() { return Object.freeze({ ...this.#stats }); }

  // ---- single-consumer identity -------------------------------------------
  // Exactly one consumer identity may ever be registered; a second registration
  // or any registration after retirement is rejected without side effects.
  registerConsumer({ token } = {}) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (this.#consumerId !== null || this.#retired) return { accepted: false, reason: 'consumer-already-bound' };
    if (!validJobId(token)) return { accepted: false, reason: 'invalid-identity' };
    this.#consumerId = token;
    return { accepted: true, consumer: this.#consumerId };
  }
  // Explicit retirement (consumer gone); the slot is never re-bindable.
  retireConsumer({ token } = {}) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (this.#consumerId === null || token !== this.#consumerId) return { accepted: false, reason: 'not-bound-consumer' };
    this.#retired = true;
    this.#consumerId = null;
    this.#fail('consumer-retired');
    return { accepted: true };
  }

  // ---- prepare -> presentation update -> ack -------------------------------
  // Parent side: send a prepare. Only one job may be in flight; a new prepare
  // while one is pending rejects (caller must invalidate first).
  sendPrepare(id, presentation) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (!validJobId(id) || !validPresentation(presentation)) return { accepted: false, reason: 'invalid-prepare' };
    if (!this.consumerAuthenticated) return { accepted: false, reason: 'no-authenticated-consumer' };
    if (this.#job && this.#job.state === 'pending') return { accepted: false, reason: 'job-in-flight' };
    if (this.state === 'failed') return { accepted: false, reason: 'protocol-failed' };
    this.#job = { id, kind: 'show', state: 'pending' };
    this.#stats.preparesSent += 1;
    return { accepted: true, message: Object.freeze({ type: 'prepare', id, presentation }) };
  }
  // Invalidation also becomes a tracked job so its ack is required and checked.
  sendHide(id) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (!validJobId(id)) return { accepted: false, reason: 'invalid-prepare' };
    if (!this.consumerAuthenticated) return { accepted: false, reason: 'no-authenticated-consumer' };
    if (this.state === 'failed') return { accepted: false, reason: 'protocol-failed' };
    this.#job = { id, kind: 'hide', state: 'pending' };
    this.#stats.preparesSent += 1;
    return { accepted: true, message: Object.freeze({ type: 'prepare-hide', id }) };
  }

  // Renderer side: validate a raw inbound message as a parent->renderer prepare.
  // Returns the ack the renderer must send after the DOM update, or a rejection.
  rendererReceive(message, { token } = {}) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (this.#consumerId === null || token !== this.#consumerId) return { accepted: false, reason: 'unauthenticated' };
    if (exactMessage(message, ['type', 'id', 'presentation']) && message.type === 'prepare' &&
      validJobId(message.id) && validPresentation(message.presentation)) {
      return { accepted: true, display: message.presentation, ack: { type: 'rendered', id: message.id, consumer: token } };
    }
    if (exactMessage(message, ['type', 'id']) && message.type === 'prepare-hide' && validJobId(message.id)) {
      return { accepted: true, display: null, ack: { type: 'hidden-ack', id: message.id, consumer: token } };
    }
    return { accepted: false, reason: 'invalid-prepare' };
  }

  // Parent side: consume a raw ack message. Fail-closed on: unknown type,
  // malformed fields, wrong/matching-failed id (late or stray), duplicate ack
  // for an already settled job, and any consumer identity that is not the
  // single registered one (second consumer or impersonation).
  receiveAck(message) {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (!exactMessage(message, ackKeys) || !ackTypes.has(message.type)) return this.#reject('malformed-ack');
    if (!validJobId(message.id) || !validJobId(message.consumer)) return this.#reject('malformed-ack');
    if (!this.consumerAuthenticated || message.consumer !== this.#consumerId) return this.#reject('unauthenticated-consumer');
    if (!this.#job) return this.#reject('stray-ack'); // unknown id / no job in flight
    if (message.id !== this.#job.id) return this.#reject('stray-ack'); // late ack for a superseded id
    if (this.#job.state !== 'pending') return this.#reject('duplicate-ack');
    if (message.type === 'rendered' && this.#job.kind === 'show') { this.#job.state = 'rendered'; }
    else if (message.type === 'hidden-ack' && this.#job.kind === 'hide') { this.#job.state = 'hidden'; }
    else return this.#reject('ack-kind-mismatch');
    this.#stats.acksAccepted += 1;
    return { accepted: true, state: this.#job.state, id: this.#job.id };
  }
  // Supersede the in-flight job (new prepare replaces it); the old job's ack
  // becomes late and will be rejected by receiveAck.
  supersede() {
    if (!this.#enabled) return { accepted: false, reason: 'disabled' };
    if (!this.#job || this.#job.state !== 'pending') return { accepted: false, reason: 'nothing-pending' };
    this.#job = null;
    return { accepted: true };
  }
  #fail(reason) {
    if (this.#job) this.#job = { ...this.#job, state: 'failed' };
    else this.#job = { id: 'none', kind: 'none', state: 'failed' };
    this.#onFail?.(reason);
  }
  #reject(reason) {
    this.#stats.acksRejected += 1;
    this.#fail(reason); // fail-closed: any rejected ack latches the protocol
    return { accepted: false, reason, state: 'failed' };
  }
}

export function newIdentity() { return randomUUID(); }
