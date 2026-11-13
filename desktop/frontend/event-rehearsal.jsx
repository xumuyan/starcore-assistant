import React, { useEffect, useState } from 'react';
import { ConversationEffect, DictationEffect } from './effects.jsx';
import { initialVoiceView, reduceVoiceView } from './voice-view-state.mjs';
import { sequenceForMode } from './reference-sequence.mjs';
import { voiceViewRehearsal, playbackRehearsal } from './voice-view-rehearsal.mjs';

// Separate, explicit lab: does not attach to legacy services or native IPC.
export function EventRehearsal({ onClose, canvasSize, scenario = 'cancellation' }) {
  const [view, setView] = useState(initialVoiceView);
  const [status, setStatus] = useState('准备合成事件');
  useEffect(() => {
    let current = initialVoiceView;
    const frames = scenario.startsWith('full-') ? sequenceForMode(scenario === 'full-dictation' ? 'dictation' : 'conversation')
      : scenario === 'cancellation' ? voiceViewRehearsal : playbackRehearsal(scenario);
    const timers = frames.map(frame => setTimeout(() => {
      const next = reduceVoiceView(current, frame);
      setStatus(`${next === current ? '已忽略' : '已应用'} ${frame.type} · 回合 ${frame.run}`);
      current = next; setView(next);
    }, frame.at));
    const cancel = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', cancel);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', cancel); };
  }, [onClose, scenario]);
  const Effect = view.mode === 'dictation' ? DictationEffect : ConversationEffect;
  return <>
    <p role="status" className="event-status">{status}</p>
    <button onClick={onClose}>返回手动外观检查</button>
    <div className="preview-stage event-stage" data-size={canvasSize} data-run={view.run} data-activity={view.activity} data-level={view.level}>
      <Effect {...view} />
    </div>
  </>;
}
