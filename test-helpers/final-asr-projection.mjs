// Proposed final-result contract ONLY. No app imports, reducer changes or writer.
// Original coordinator handles simulate local ownership, not IPC authentication.
const hidden = Object.freeze({ activity: 'hidden', text: '', truncated: false });
const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
function displayPrefix(text) {
  let prefix = '';
  for (const { segment } of segmenter.segment(text)) {
    if (prefix.length + segment.length > 8000) break;
    prefix += segment;
  }
  return Object.freeze({ activity: 'final-ready', text: prefix, truncated: prefix.length < text.length });
}

export class FinalAsrProjection {
  #model; #enabled; #session = null; #receipt = null; #business = ''; #display = hidden;
  constructor(model, { enabled = false } = {}) { this.#model = model; this.#enabled = enabled === true; }

  #current() {
    const state = this.#model.snapshot();
    return this.#enabled && state.connected && !state.closing && state.session &&
      state.session.mode === 'dictation' && state.view.active && state.view.activity === 'thinking' ? state : null;
  }

  #synchronize() {
    const state = this.#current();
    if (!state || state.session !== this.#session) {
      // Lazy local cleanup; not a subscription, immediate hardware cancel or secure erasure.
      this.#session = state?.session ?? null; this.#receipt = null; this.#business = ''; this.#display = hidden;
    }
    return state;
  }

  accept(ticket, result) {
    const state = this.#synchronize();
    if (!state || this.#receipt || !state.pending.includes(ticket) || ticket.resource !== 'asr') return null;
    const text = result?.text;
    // Proposed business boundary follows Node's UTF-16 cap; malformed Unicode is
    // rejected here explicitly. No trim/normalization/ellipsis in writer text.
    if (typeof text !== 'string' || text.length > 16000 || !text.isWellFormed() ||
      /^none$/i.test(text.trim()) || !/[\p{L}\p{N}]/u.test(text)) return null;
    this.#business = text; this.#display = displayPrefix(text);
    this.#receipt = Object.freeze({}); // Identity-only receipt, never the payload.
    return this.#receipt;
  }

  snapshot() { this.#synchronize(); return this.#display; }

  writerText(receipt, writer) {
    const state = this.#synchronize();
    if (!state || !this.#receipt || receipt !== this.#receipt || !state.pending.includes(writer) ||
      writer.resource !== 'writer') return null;
    // Read-only candidate payload, NOT permission to paste, proof of insertion or
    // automatic fallback. Focus/requestID and explicit-copy guards stay upstream.
    return this.#business;
  }
}
