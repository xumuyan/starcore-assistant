import React from 'react';
import { VoiceRing } from 'voice-ring';
import { BorderBeam } from 'border-beam';
import { VoiceBeam } from 'voice-glow';
import { ThinkingOrb } from 'thinking-orbs';
import { transcriptSegments } from './transcript.mjs';

// Visual-only adapter. The host will own microphone/audio/ASR; never open a second mic here.
export const phases = Object.freeze(['hidden', 'listening', 'processing', 'speaking']);
export function normalizePhase(phase) { return phases.includes(phase) ? phase : 'hidden'; }
export function normalizeLevel(level) {
  return typeof level === 'number' && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}

export function TextReveal({ text = '' }) {
  // React escapes content. Newly appended segments animate, committed prefixes stay.
  return <p className="transcript" aria-live="polite" aria-atomic="false">{transcriptSegments(text).map(({ word, offset }, index) =>
    <span className="reveal-word" key={`${offset}:${word}`} style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}>{word}</span>
  )}</p>;
}

export function BeamCard({ children, level = 0 }) {
  // Each upstream wrapper must see the actual rounded card as its first child.
  // VoiceBeam outside BorderBeam sees a square wrapper instead of the card.
  return <BorderBeam theme="dark"><section className="beam-card">
    <VoiceBeam theme="dark" level={normalizeLevel(level)}><div className="voice-content">{children}</div></VoiceBeam>
  </section></BorderBeam>;
}

export function ConversationEffect({ phase = 'hidden', level = 0, text = '' }) {
  phase = normalizePhase(phase);
  if (phase === 'hidden') return null; // Unmount canvases: no idle animation while hidden.
  return <section className="conversation-effect" data-phase={phase} aria-label="语音对话效果">
    <div className="voice-ring-slot"><VoiceRing size={240} state={phase} theme="dark" level={normalizeLevel(level)} /></div>
    {text && <div className="conversation-transcript" key={phase === 'speaking' ? 'reply' : 'utterance'}>
      <BeamCard level={phase === 'processing' ? 0 : level}><TextReveal text={text} /></BeamCard>
    </div>}
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
