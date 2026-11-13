// Keep segment identities stable as an ASR/reply prefix grows. Existing words
// retain their React nodes so new chunks do not replay the whole transcript.
export function transcriptSegments(text = '') {
  const content = String(text).slice(0, 8000);
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(content), item => item.segment)
    : Array.from(content);
  let offset = 0;
  return words.map(word => {
    const segment = { word, offset };
    offset += word.length;
    return segment;
  });
}
