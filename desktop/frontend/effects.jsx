import React from 'react';
import { VoiceRing } from 'voice-ring';
import { BorderBeam } from 'border-beam';
import { VoiceBeam } from 'voice-glow';
import { ThinkingOrb } from 'thinking-orbs';

// Visual-only adapter. The host will own microphone/audio/ASR; never open a second mic here.
export const phases = Object.freeze(['hidden', 'listening', 'processing', 'speaking']);
export function normalizePhase(phase) { return phases.includes(phase) ? phase : 'hidden'; }
export function normalizeLevel(level) {
  return typeof level === 'number' && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}

export function TextReveal({ text = '' }) {
  // React escapes text; user/assistant content must never be interpreted as HTML.
  const content = String(text).slice(0, 8000);
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(content), item => item.segment)
    : Array.from(content);
  return <p className="transcript">{words.map((word, index) =>
    <span className="reveal-word" key={index} style={{ animationDelay: `${Math.min(index, 30) * 35}ms` }}>{word}</span>
  )}</p>;
}

export function BeamCard({ children }) {
  return <BorderBeam theme="dark"><section className="beam-card">{children}</section></BorderBeam>;
}

export function ConversationEffect({ phase = 'hidden', level = 0, text = '' }) {
  phase = normalizePhase(phase);
  if (phase === 'hidden') return null; // Unmount canvases: no idle animation while hidden.
  return <section className="conversation-effect" data-phase={phase} aria-label="语音对话效果">
    <VoiceRing size={240} state={phase} theme="dark" level={normalizeLevel(level)} />
    {text && <VoiceBeam theme="dark" level={phase === 'processing' ? 0 : normalizeLevel(level)}>
      <BeamCard><TextReveal text={text} /></BeamCard>
    </VoiceBeam>}
  </section>;
}

export function DictationEffect({ phase = 'hidden', level = 0, text = '' }) {
  phase = normalizePhase(phase);
  if (phase === 'hidden') return null;
  return <section className="dictation-effect" data-phase={phase} aria-label="听写效果">
    <VoiceBeam theme="dark" level={phase === 'listening' ? normalizeLevel(level) : 0}>
      <div className="dictation-strip">
        {phase === 'processing' && <ThinkingOrb state="working" size={64} theme="dark" />}
        {text ? <TextReveal text={text} /> : <span>{phase === 'processing' ? '正在识别' : '等待语音'}</span>}
      </div>
    </VoiceBeam>
  </section>;
}
