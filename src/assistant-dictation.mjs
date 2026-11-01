import { access } from 'node:fs/promises';
import { polishSpeech } from './assistant-chat.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE = 16000, MAX_CHUNKS = 8, MAX_TEXT = 16000;
const usable = text => typeof text === 'string' && text.length <= MAX_TEXT &&
  !/^none$/i.test(text.trim()) && /[\p{L}\p{N}]/u.test(text);

function audioInfo(audio) {
  // Bound encoded length before allocating, and reject Buffer's permissive decoding.
  if (typeof audio !== 'string' || !audio.length || audio.length > RATE * 18 * 4 / 3 * 4 ||
      audio.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio)) {
    throw new Error('音频格式无效');
  }
  const bytes = Buffer.from(audio, 'base64');
  if (bytes.toString('base64') !== audio || bytes.length < 3200 || bytes.length % 4 || bytes.length > RATE * 18 * 4) {
    throw new Error('音频片段长度无效（每段最多 18 秒）');
  }
  let squares = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const value = bytes.readFloatLE(i);
    if (!Number.isFinite(value) || Math.abs(value) > 2) throw new Error('音频采样无效');
    squares += value * value;
  }
  return { samples: bytes.length / 4, silent: Math.sqrt(squares / (bytes.length / 4)) < .003 };
}

// Race the entire fetch + body parse against cancellation/timeout. Some injected
// transports ignore abort; they must not keep the dictation UI busy indefinitely.
async function abortable(operation, signal) {
  signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }), aborted]);
  } finally { signal.removeEventListener('abort', onAbort); }
}

// A deliberately isolated text producer: no assistant session, history, disk writes,
// playback, command routing, or cloud calls other than explicitly enabled polish.
export class DictationService {
  constructor({ emit, asr, getSettings, getKeys, isBlocked, prepareASR, accessModel = access, fetchRequest = fetch }) {
    this.emit = emit; this.asr = asr; this.getSettings = getSettings; this.getKeys = getKeys;
    this.isBlocked = isBlocked; this.fetch = fetchRequest;
    this.prepareASR = prepareASR ?? (async (config, isCurrent) => {
      await accessModel(config.modelPath);
      if (isCurrent()) await asr.load(config.modelPath);
    });
    this.session = null;
    // Keep model preparation and recognition serialized even after cancellation.
    this.tail = Promise.resolve();
  }
  get active() { return this.session !== null; }
  current(session) { return this.session === session; }
  state(session, name) { if (this.current(session)) this.emit({ type: 'dictationState', id: session.id, name }); }
  fail(session, message) {
    if (!this.current(session)) return;
    this.session = null; session.controller.abort();
    this.emit({ type: 'dictationError', id: session.id, message });
  }
  async begin(id) {
    if (typeof id !== 'string' || !UUID.test(id)) return false;
    if (this.active) {
      // A repeated begin for the current ID poisons that request; a competing ID
      // is refused without cancelling the request already being recorded.
      if (this.session.id === id) this.fail(this.session, '听写请求重复开始');
      else this.emit({ type: 'dictationError', id, message: '已有听写正在进行' });
      return false;
    }
    const config = Object.freeze({ ...this.getSettings() });
    if (!config.dictationEnabled || this.isBlocked()) {
      this.emit({ type: 'dictationError', id, message: !config.dictationEnabled ? '请先启用全局听写' : '助手正在工作，请稍后听写' });
      return false;
    }
    const session = { id, config, keys: Object.freeze({ ...this.getKeys() }), controller: new AbortController(),
      ready: false, finishing: false, count: 0, samples: 0, texts: [], tail: Promise.resolve() };
    this.session = session;
    this.state(session, 'loading');
    try {
      const prepare = this.tail.then(async () => {
        if (this.current(session)) await this.prepareASR(config, () => this.current(session));
      });
      this.tail = prepare.catch(() => {});
      await prepare;
      if (!this.current(session)) return false;
      session.ready = true;
      this.state(session, 'recording');
      this.emit({ type: 'dictationReady', id });
      return true;
    } catch {
      this.fail(session, '本地听写模型加载失败，请检查模型路径');
      return false;
    }
  }
  async append(input) {
    const { id, index, audio } = input && typeof input === 'object' ? input : {};
    const session = this.session;
    if (!session || id !== session.id) return;
    try {
      if (!session.ready || session.finishing) throw new Error('当前听写状态不接受音频');
      if (!Number.isInteger(index) || index !== session.count || index >= MAX_CHUNKS) throw new Error('听写音频顺序或片段数量无效');
      const info = audioInfo(audio);
      if (session.samples + info.samples > RATE * 120) throw new Error('听写总长度不能超过 120 秒');
      session.count++; session.samples += info.samples;
      const job = this.tail.then(async () => {
        if (!this.current(session) || info.silent) return;
        this.state(session, 'transcribing');
        try {
          const text = await this.asr.transcribe(audio, session.config.wakeWord);
          if (!this.current(session)) return;
          if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('invalid text');
          session.texts[index] = usable(text) ? text.trim() : '';
        } catch { this.fail(session, '本地听写识别失败，请重试'); }
      });
      this.tail = job.catch(() => {});
      session.tail = this.tail;
      await session.tail;
    } catch (error) { this.fail(session, error.message); }
  }
  async finish(input) {
    const { id, count } = input && typeof input === 'object' ? input : {};
    const session = this.session;
    if (!session || id !== session.id) return;
    if (!session.ready || session.finishing || !Number.isInteger(count) || count < 1 || count !== session.count) {
      this.fail(session, '听写结束状态或片段数量无效'); return;
    }
    session.finishing = true;
    await session.tail;
    if (!this.current(session)) return;
    let text = session.texts.filter(Boolean).join('\n');
    if (!usable(text)) { this.fail(session, '未识别到有效文字，请重新听写'); return; }
    if (session.config.dictationPolish) {
      const notice = () => { if (this.current(session)) this.emit({ type: 'dictationNotice', id, message: '润色不可用，已保留本地识别原文' }); };
      if (!session.keys.deepseek) notice();
      else {
        this.state(session, 'polishing');
        try {
          const signal = AbortSignal.any([session.controller.signal, AbortSignal.timeout(10000)]);
          const polished = await abortable(() => polishSpeech(this.fetch, session.config.polishModel,
            session.keys.deepseek, text, signal, {
              maxTokens: Math.min(16384, Math.max(350, text.length * 2 + 128)),
              rejectTruncated: true, minLengthRatio: .7
            }), signal);
          if (!usable(polished)) throw new Error('invalid polish');
          text = polished;
        } catch { notice(); }
      }
    }
    if (!this.current(session)) return;
    this.session = null;
    this.emit({ type: 'dictationResult', id, text });
  }
  cancel(id) {
    const session = this.session;
    if (!session || (id !== undefined && id !== session.id)) return;
    this.session = null; session.controller.abort();
    this.emit({ type: 'dictationState', id: session.id, name: 'cancelled' });
  }
}
