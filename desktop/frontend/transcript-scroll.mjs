// Follow streaming text unless the user has deliberately scrolled back.
// A small tolerance handles fractional layout pixels and browser rounding.
export function isNearTranscriptEnd({ scrollHeight, scrollTop, clientHeight }, tolerance = 24) {
  return scrollHeight - scrollTop - clientHeight <= tolerance;
}
