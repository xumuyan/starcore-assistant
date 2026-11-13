import React, { useCallback, useEffect, useState } from 'react';
import { EventRehearsal } from './event-rehearsal.jsx';
import { createRoot } from 'react-dom/client';
import { ConversationEffect, DictationEffect } from './effects.jsx';
import './style.css';
import { sequenceForMode } from './reference-sequence.mjs';

// Explicitly isolated component lab, not a working assistant or a production entry point.
function Preview() {
  const [phase, setPhase] = useState('hidden');
  const [mode, setMode] = useState('conversation');
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const [canvasSize, setCanvasSize] = useState('desktop');
  const [eventRun, setEventRun] = useState(0);
  const [eventsActive, setEventsActive] = useState(false);
  const [eventScenario, setEventScenario] = useState('cancellation');
  const [playbackOutcome, setPlaybackOutcome] = useState('played');
  const closeEvents = useCallback(() => setEventsActive(false), []);
  function stop() { setEventsActive(false); setPlaying(false); setPhase('hidden'); setLevel(0); setText(''); }
  useEffect(() => {
    const cancel = event => { if (event.key === 'Escape') stop(); };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timers = sequenceForMode(mode).map(frame => setTimeout(() => {
      setPhase(frame.phase); setLevel(frame.level); setText(frame.text);
      if (frame.phase === 'hidden') setPlaying(false);
    }, frame.at));
    return () => timers.forEach(clearTimeout);
  }, [playing, run, mode]);
  function rehearse() { setEventsActive(false); setPlaying(true); setRun(value => value + 1); }
  function rehearseEvents(scenario = 'cancellation') { stop(); setEventScenario(scenario); setEventRun(value => value + 1); setEventsActive(true); }
  function changeMode(value) {
    setPlaying(false); setMode(value); setPhase('listening'); setLevel(0.4); setText('');
  }
  const Effect = mode === 'dictation' ? DictationEffect : ConversationEffect;
  return <main>
    <header className="preview-controls">
      <h1>libraries.dev · 语音主界面</h1>
      <p>仅视觉样例 · 未录音 · 未连接聊天、历史、设置或 Tauri</p>
      <button onClick={rehearse}>播放完整语音流程（合成）</button>
      <button onClick={() => rehearseEvents()}>测试取消与迟到事件（合成）</button>
      <label>播放分支<select value={playbackOutcome} onChange={e => setPlaybackOutcome(e.target.value)}>
        <option value="played">正常播放后恢复收音</option><option value="muted">关闭朗读</option>
        <option value="failed">播放失败</option><option value="cancelled">生成中取消</option>
      </select></label>
      <button onClick={() => rehearseEvents(playbackOutcome)}>测试回复与播放状态（合成）</button>
      <p className="preview-mode-hint">{mode === 'dictation'
        ? '按键听写预览：收音长条 → orbs 思考 → 隐藏；点击播放查看。未绑定右 Ctrl，未写入输入框。'
        : '唤醒对话预览：语音环 → 识别文字 → 思考 → 回复 → 隐藏。'}</p>
      <label>模式<select disabled={playing || eventsActive} value={mode} onChange={e => changeMode(e.target.value)}>
        <option value="conversation">唤醒对话</option><option value="dictation">按键听写</option>
      </select></label>
      <label>阶段<select disabled={playing || eventsActive} value={phase} onChange={e => setPhase(e.target.value)}>
        <option value="hidden">隐藏</option><option value="listening">收音外观</option>
        <option value="processing">思考外观</option>{mode === 'conversation' && <option value="speaking">回复外观</option>}
      </select></label>
      <label>手动模拟电平<input disabled={playing || eventsActive} type="range" min="0" max="1" step="0.01" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      <label>示例文字<input disabled={playing || eventsActive} value={text} maxLength={8000} onChange={e => setText(e.target.value)} /></label>
      <label>画布尺寸<select value={canvasSize} onChange={e => setCanvasSize(e.target.value)}>
        <option value="desktop">桌面浮层 620 × 440</option><option value="narrow">窄屏 320 × 440</option>
      </select></label>
      <button onClick={stop}>隐藏（Esc）</button>
    </header>
    {eventsActive ? <EventRehearsal key={eventRun} onClose={closeEvents} canvasSize={canvasSize} scenario={eventScenario} />
      : <div className="preview-stage" data-size={canvasSize}><Effect phase={phase} level={level} text={text} /></div>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
