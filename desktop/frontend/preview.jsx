import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationEffect, DictationEffect } from './effects.jsx';
import './style.css';
import { referenceSequence } from './reference-sequence.mjs';

// Explicitly isolated component lab, not a working assistant or a production entry point.
function Preview() {
  const [phase, setPhase] = useState('hidden');
  const [mode, setMode] = useState('conversation');
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  function stop() { setPlaying(false); setPhase('hidden'); setLevel(0); setText(''); }
  useEffect(() => {
    const cancel = event => { if (event.key === 'Escape') stop(); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timers = referenceSequence.map(frame => setTimeout(() => {
      setPhase(frame.phase); setLevel(frame.level); setText(frame.text);
      if (frame.phase === 'hidden') setPlaying(false);
    }, frame.at));
    return () => timers.forEach(clearTimeout);
  }, [playing, run]);
  function rehearse() { setMode('conversation'); setPlaying(true); setRun(value => value + 1); }
  const Effect = mode === 'dictation' ? DictationEffect : ConversationEffect;
  return <main>
    <header className="preview-controls">
      <h1>libraries.dev · 语音主界面</h1>
      <p>仅视觉样例 · 未录音 · 未连接聊天、历史、设置或 Tauri</p>
      <button onClick={rehearse}>播放完整语音流程（合成）</button>
      <label>模式<select disabled={playing} value={mode} onChange={e => setMode(e.target.value)}>
        <option value="conversation">唤醒对话</option><option value="dictation">按键听写</option>
      </select></label>
      <label>阶段<select disabled={playing} value={phase} onChange={e => setPhase(e.target.value)}>
        <option value="hidden">隐藏</option><option value="listening">收音外观</option>
        <option value="processing">思考外观</option><option value="speaking">回复外观</option>
      </select></label>
      <label>手动模拟电平<input disabled={playing} type="range" min="0" max="1" step="0.01" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      <label>示例文字<input disabled={playing} value={text} maxLength={8000} onChange={e => setText(e.target.value)} /></label>
      <button onClick={stop}>隐藏（Esc）</button>
    </header>
    <div className="preview-stage"><Effect phase={phase} level={level} text={text} /></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
