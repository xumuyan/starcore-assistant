import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationEffect, DictationEffect } from './effects.jsx';
import './style.css';

// Explicitly isolated component lab, not a working assistant or a production entry point.
function Preview() {
  const [phase, setPhase] = useState('hidden');
  const [mode, setMode] = useState('conversation');
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  function cancel(event) { if (event.key === 'Escape') setPhase('hidden'); }
  const Effect = mode === 'dictation' ? DictationEffect : ConversationEffect;
  return <main onKeyDown={cancel}>
    <header className="preview-controls">
      <h1>参考组件集成预览</h1>
      <p>仅视觉样例 · 未录音 · 未连接聊天、历史、设置或 Tauri</p>
      <label>模式<select value={mode} onChange={e => setMode(e.target.value)}>
        <option value="conversation">唤醒对话</option><option value="dictation">按键听写</option>
      </select></label>
      <label>阶段<select value={phase} onChange={e => setPhase(e.target.value)}>
        <option value="hidden">隐藏</option><option value="listening">收音外观</option>
        <option value="processing">思考外观</option><option value="speaking">回复外观</option>
      </select></label>
      <label>手动模拟电平<input type="range" min="0" max="1" step="0.01" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      <label>示例文字<input value={text} maxLength={8000} onChange={e => setText(e.target.value)} /></label>
      <button onClick={() => setPhase('hidden')}>隐藏（Esc）</button>
    </header>
    <div className="preview-stage"><Effect phase={phase} level={level} text={text} /></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
