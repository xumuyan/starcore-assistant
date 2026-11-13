import React, { useLayoutEffect, useRef } from 'react';
import { VoiceRing } from 'voice-ring';
import { BorderBeam } from 'border-beam';
import { VoiceBeam } from 'voice-glow';
import { ThinkingOrb } from 'thinking-orbs';
import { transcriptSegments } from './transcript.mjs';
import { isNearTranscriptEnd } from './transcript-scroll.mjs';

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

function TranscriptViewport({ text, className, children }) {
  const viewport = useRef(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (following.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [text]);
  return <div className={className} ref={viewport}
    onScroll={event => { following.current = isNearTranscriptEnd(event.currentTarget); }}>{children}</div>;
}

export function BeamCard({ children, level = 0, text = '' }) {
  // Each upstream wrapper must see the actual rounded card as its first child.
  // VoiceBeam outside BorderBeam sees a square wrapper instead of the card.
  return <BorderBeam theme="dark"><section className="beam-card">
    <VoiceBeam theme="dark" level={normalizeLevel(level)}><TranscriptViewport className="voice-content" text={text}>{children}</TranscriptViewport></VoiceBeam>
  </section></BorderBeam>;
}

export function ConversationEffect({ phase = 'hidden', level = 0, text = '' }) {
  phase = normalizePhase(phase);
  if (phase === 'hidden') return null; // Unmount canvases: no idle animation while hidden.
  return <section className="conversation-effect" data-phase={phase} aria-label="语音对话效果">
    <div className="voice-ring-slot"><VoiceRing size={240} state={phase} theme="dark" level={normalizeLevel(level)} /></div>
    {text && <div className="conversation-transcript" key={phase === 'speaking' ? 'reply' : 'utterance'}>
      <BeamCard text={text} level={phase === 'processing' ? 0 : level}><TextReveal text={text} /></BeamCard>
    </div>}
  </section>;
}

export function DictationEffect({ phase = 'hidden', level = 0, text = '' }) {
  phase = normalizePhase(phase);
  if (phase === 'hidden') return null;
  return <section className="dictation-effect" data-phase={phase} aria-label="听写效果">
    <VoiceBeam theme="dark" level={phase === 'listening' ? normalizeLevel(level) : 0}>
      <div className="dictation-strip">
        <div className="dictation-orb-slot" aria-hidden="true">
          {phase === 'processing' && <ThinkingOrb state="working" size={64} theme="dark" />}
        </div>
        <TranscriptViewport className="dictation-text" text={text}>
          {text ? <TextReveal text={text} /> : <span role="status">{phase === 'processing' ? '正在识别' : '等待语音'}</span>}
        </TranscriptViewport>
      </div>
    </VoiceBeam>
  </section>;
}
