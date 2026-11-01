export class LocalASR {
  model = null;
  session = null;
  path = null;
  tail = Promise.resolve();
  exclusive(operation) {
    const next = this.tail.then(operation); this.tail = next.catch(() => {}); return next;
  }
  load(path) { return this.exclusive(async () => {
    if (this.path === path && this.session) return this.model.backend;
    this.dispose();
    const { TranscribeModel } = await import('transcribe-cpp');
    this.model = await TranscribeModel.load(path, { backend: 'auto' });
    this.session = this.model.createSession({ nThreads: 4 });
    this.path = path;
    return this.model.backend;
  }); }
  transcribe(base64, wakeWord) { return this.exclusive(async () => {
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length % 4 || bytes.length < 3200 || bytes.length > 16000 * 4 * 24) throw new Error('音频片段格式或长度无效');
    // Copy into aligned memory; native code borrows the array until it finishes.
    const pcm = new Float32Array(bytes.length / 4);
    for (let i = 0; i < pcm.length; i++) pcm[i] = bytes.readFloatLE(i * 4);
    if (pcm.some(x => !Number.isFinite(x) || Math.abs(x) > 2)) throw new Error('音频采样无效');
    const result = await this.session.run(pcm, { timestamps: 'none', vocabulary: [wakeWord, 'Codex'] });
    return String(result.text ?? '').trim();
  }); }
  dispose() { this.session?.dispose(); this.model?.dispose(); this.session = this.model = this.path = null; }
}
