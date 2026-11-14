// Pure offline proposal. Caller assembles one synchronous local frame from the
// same owners. Object equality is NOT wire authentication or freshness proof.
const hidden = Object.freeze({ status: 'hidden', text: '', truncated: false,
  level: 0, showOrbs: false, canCopy: false });
const textValid = text => typeof text === 'string' && text.length <= 8000 && text.isWellFormed();
const output = (status, text = '', truncated = false, level = 0, canCopy = false) =>
  Object.freeze({ status, text, truncated, level, showOrbs: status === 'thinking', canCopy });

function validFinal(value) {
  return value && textValid(value.text) && typeof value.truncated === 'boolean' &&
    ((value.activity === 'hidden' && value.text === '' && !value.truncated) || value.activity === 'final-ready');
}
const dispositions = {
  hidden: ['unattempted', 'issued', 'not-issued', 'unknown'], preparing: ['unattempted'],
  'paste-issued': ['issued'], 'paste-uncertain': ['unknown'],
  'copy-available': ['not-issued'], copying: ['not-issued'], copied: ['not-issued'],
};
function validOutcome(value) {
  return value && Object.hasOwn(dispositions, value.status) && dispositions[value.status].includes(value.pasteDisposition) &&
    value.canCopy === (value.status === 'copy-available') && value.copying === (value.status === 'copying');
}

export function selectDictationPresentation({ enabled = false, coordinator, final, outcome, dismissedSession = null } = {}) {
  const state = coordinator; const session = state?.session; const view = state?.view;
  if (enabled !== true || state?.connected !== true || state.closing !== false || !session ||
    session.mode !== 'dictation' || view?.active !== true || view.mode !== 'dictation' ||
    session.epoch !== state.epoch || session.run !== view.run || !Number.isSafeInteger(view.run) || view.run <= 0 ||
    !Number.isSafeInteger(view.seq) || view.seq < 0 || dismissedSession === session) return hidden;

  if (view.activity === 'listening' && view.phase === 'listening') {
    if (!textValid(view.text) || typeof view.level !== 'number' || !Number.isFinite(view.level) ||
      view.level < 0 || view.level > 1) return hidden;
    return output('listening', view.text, false, view.level);
  }
  if (view.activity !== 'thinking' || view.phase !== 'processing' || final?.session !== session ||
    outcome?.session !== session || !validFinal(final.value) || !validOutcome(outcome.value)) return hidden;
  const result = final.value; const writer = outcome.value;
  if (writer.status !== 'hidden') {
    // Every writer branch requires an accepted final. Never expose raw view.text
    // (possibly a synthetic listening transcript) after final readiness.
    if (result.activity !== 'final-ready') return hidden;
    if (['paste-issued', 'paste-uncertain', 'copied'].includes(writer.status)) return output(writer.status);
    return output(writer.status, result.text, result.truncated, 0, writer.canCopy);
  }
  // hidden+non-default disposition can be outcome.dismiss, not fresh processing.
  // Fail closed rather than resurrect final text without an explicit dismissal.
  if (writer.pasteDisposition !== 'unattempted') return hidden;
  return result.activity === 'final-ready' ? output('final-ready', result.text, result.truncated) : output('thinking');
}
