// Offline default-off single parent owner + fixed validation child experiment.
// IPC ACK is preparation only: parent original frame commit owns all display.
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DictationCopyFrameModel } from './dictation-copy-frame-model.mjs';
import { exactMessage, validJobId } from './dictation-presentation-worker.mjs';

export class DictationPresentationController {
  #model; #child = null; #consumer; #ready = false; #failed = false; #closing = false;
  #busy = null; #queued = null; #childClosed = true; #deliveryFailed = false;
  #done; #resolve; #timer = null; #deadline = null; #timeout; #enabled; #inConsumer = false;
  constructor({ enabled = false, consumer = () => {}, workerFactory, workerTimeoutMs = 5000, ...options } = {}) {
    if (typeof consumer !== 'function' || (workerFactory !== undefined && typeof workerFactory !== 'function') ||
      !Number.isSafeInteger(workerTimeoutMs) || workerTimeoutMs < 1 || workerTimeoutMs > 30000) throw new TypeError('invalid controller options');
    this.#enabled = enabled === true; this.#timeout = workerTimeoutMs;
    this.#model = new DictationCopyFrameModel({ ...options, enabled: enabled === true }); this.#consumer = consumer;
    this.#done = new Promise(resolve => { this.#resolve = resolve; });
    if (enabled !== true) { this.#resolve(); return; }
    try {
      this.#child = workerFactory ? workerFactory() : fork(fileURLToPath(new URL('./dictation-presentation-worker.mjs', import.meta.url)), [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'], execArgv: [], env: { PATH: process.env.PATH || '' },
      });
      this.#childClosed = false; this.#arm();
      // Drain only: never log display text or inherited child errors/payloads.
      this.#child.stdout?.resume(); this.#child.stderr?.resume();
      this.#child.on('message', message => this.#message(message));
      this.#child.on('error', () => this.#fail());
      this.#child.on('disconnect', () => { if (!this.#closing) this.#fail(); });
      this.#child.on('close', () => {
        this.#childClosed = true; this.#ready = false; this.#busy = null; this.#queued = null;
        if (!this.#closing) this.#fail();
        clearTimeout(this.#timer); clearTimeout(this.#deadline); this.#resolve();
      });
    } catch { this.#failed = true; this.#resolve(); }
  }
  #arm() { clearTimeout(this.#deadline); this.#deadline = setTimeout(() => this.#fail(), this.#timeout); }
  #notify(presentation) {
    if (!this.#enabled || this.#deliveryFailed) return;
    try { this.#inConsumer = true; this.#consumer(presentation); }
    catch { this.#deliveryFailed = true; this.#fail(); }
    finally { this.#inConsumer = false; }
  }
  #hide() {
    this.#queued = null;
    if (this.#busy) this.#busy.frame = null;
    // Invalid command is deliberately used only to invalidate local delivery.
    this.#model.dispatchAt(-1, 'controller-invalidate');
    this.#notify(this.#model.snapshot().presentation);
  }
  #fail() {
    if (this.#failed) return;
    this.#failed = true; this.#ready = false; clearTimeout(this.#deadline); this.#hide(); this.#retire();
  }
  #retire() {
    if (!this.#child || this.#childClosed || this.#timer) return;
    // Only our owned child; no other processes, no restart or task retry.
    try { this.#child.kill('SIGTERM'); } catch { /* close remains the only proof */ }
    this.#timer = setTimeout(() => { if (!this.#childClosed) { try { this.#child.kill('SIGKILL'); } catch {} } }, 1000);
    this.#timer.unref?.();
  }
  #send(message) {
    try { this.#child.send(message, error => { if (error) this.#fail(); }); }
    catch { this.#fail(); }
  }
  #pump() {
    if (!this.#ready || this.#failed || this.#closing || this.#busy || !this.#queued) return;
    const frame = this.#queued; this.#queued = null;
    const id = randomUUID(); this.#busy = { id, frame }; this.#arm();
    this.#send({ type: 'prepare', id, presentation: frame.presentation });
  }
  #message(message) {
    if (this.#failed || this.#closing) return;
    if (exactMessage(message, ['type']) && message.type === 'ready' && !this.#ready) {
      this.#ready = true; clearTimeout(this.#deadline); this.#pump(); return;
    }
    if (!exactMessage(message, ['type', 'id']) || message.type !== 'prepared' || !validJobId(message.id) ||
      !this.#ready || !this.#busy || message.id !== this.#busy.id) { this.#fail(); return; }
    const { frame } = this.#busy; this.#busy = null; clearTimeout(this.#deadline);
    if (frame && this.#model.commit(frame)) this.#notify(this.#model.snapshot().presentation);
    this.#pump();
  }
  #ingress(method, ...args) {
    if (this.#inConsumer) throw new Error('consumer reentry rejected');
    this.#hide(); // Consumer invalidation precedes potentially throwing business.
    if ((this.#failed || this.#closing) && !['advance', 'reportAt', 'stoppedAt'].includes(method) &&
      !(method === 'dispatchAt' && ['close', 'disconnect', 'released', 'hide'].includes(args[1]))) return null;
    try { return this.#model[method](...args); }
    finally {
      if (!this.#failed && !this.#closing) { this.#queued = this.#model.sample(); this.#pump(); }
    }
  }
  advance(now) { return this.#ingress('advance', now); }
  beginAt(now) { return this.#ingress('beginAt', now); }
  receiveAt(now, token, envelope) { return this.#ingress('receiveAt', now, token, envelope); }
  lostAt(now, token) { return this.#ingress('lostAt', now, token); }
  dispatchAt(now, command, ...args) { return this.#ingress('dispatchAt', now, command, ...args); }
  prepareAt(now, session, copy) { return this.#ingress('prepareAt', now, session, copy); }
  checkedAt(now, token, evidence) { return this.#ingress('checkedAt', now, token, evidence); }
  handoffAt(now, token) { return this.#ingress('handoffAt', now, token); }
  reportAt(now, job, outcome) { return this.#ingress('reportAt', now, job, outcome); }
  stoppedAt(now, job, evidence) { return this.#ingress('stoppedAt', now, job, evidence); }
  candidate() { return this.#model.candidate(); }
  snapshot() { return this.#model.snapshot(); }
  diagnostic() { return this.#model.diagnostic(); }
  workerState() { return Object.freeze({ ready: this.#ready, failed: this.#failed, closing: this.#closing,
    inFlight: this.#busy !== null, queued: this.#queued !== null, childClosed: this.#childClosed, deliveryFailed: this.#deliveryFailed }); }
  close() {
    if (this.#inConsumer) throw new Error('consumer reentry rejected');
    if (!this.#closing) { this.#closing = true; clearTimeout(this.#deadline); this.#hide(); this.#retire(); }
    return this.#done; // Resolves only on own child's close (or no child created).
  }
}
