import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BeamCard, ConversationEffect, DictationEffect } from './effects.jsx';
import './style.css';
import './probe.css';

const view = new URLSearchParams(location.search).get('view');
function Probe() {
  const [state, setState] = useState({ demo: null, hotkeyEnabled: false });
  const [error, setError] = useState('');
  async function command(name, args) {
    try { await invoke(name, args); setError(''); }
    catch { setError('验证动作失败（可能热键冲突）；未修改用户配置'); }
  }
  useEffect(() => {
    let disposed = false;
    const subscription = listen('probe-state', event => { if (!disposed) setState(event.payload); });
    subscription.then(async () => {
      const snapshot = await invoke('probe_snapshot');
      if (!disposed) setState(snapshot);
    }).catch(() => { if (!disposed) setError('无法读取验证壳状态'); });
    const cancel = event => { if (event.key === 'Escape') command('probe_hide'); };
    window.addEventListener('keydown', cancel);
    return () => { disposed = true; subscription.then(unlisten => unlisten()).catch(() => {}); window.removeEventListener('keydown', cancel); };
  }, []);
  if (view === 'overlay') {
    const phase = state.demo === 'dictation' ? 'processing' : state.demo || 'hidden';
    const Effect = state.demo === 'dictation' ? DictationEffect : ConversationEffect;
    return <main className="probe-overlay"><Effect phase={phase} level={0.55} text="T0 合成效果 · 未录音 · Esc 隐藏" /></main>;
  }
  if (view === 'chooser') return <main className="probe-chooser"><BeamCard>
    <button onClick={() => command('probe_open', { page: 'history' })}>历史记录</button>
    <button onClick={() => command('probe_open', { page: 'settings' })}>设置</button>
    {error && <p role="alert">{error}</p>}
  </BeamCard></main>;
  if (view !== 'history' && view !== 'settings') return null;
  return <main className="probe-page"><BeamCard>
    <h1>{view === 'history' ? '历史记录' : '设置'} · T0 验证</h1>
    <p>隔离壳：无麦克风、聊天、真实历史或配置读写。</p>
    {view === 'history' ? <p>尚未接入加密历史；这里不是清空后的历史。</p> : <>
      <div className="probe-actions">{[['listening', '收音外观'], ['processing', '思考外观'], ['speaking', '回复外观'], ['dictation', '听写思考']].map(([value, label]) =>
        <button key={value} onClick={() => command('probe_demo', { value })}>{label}</button>
      )}<button onClick={() => command('probe_hide')}>隐藏浮层</button></div>
      <label><input type="checkbox" checked={state.hotkeyEnabled} onChange={event => command('probe_hotkey', { enabled: event.target.checked })} />
        临时测试热键：Cmd/Ctrl + Shift + F8（退出即释放）</label>
      <p>不注册右 Ctrl；无输入框写入。Esc 只在浮层可见时注册。非激活、全屏、多屏仍需实测。</p>
      <label>键盘输入验证<input aria-label="键盘输入验证" placeholder="仅当前页面，不保存" /></label>
    </>}
    {error && <p role="alert">{error}</p>}
    <button onClick={() => command('probe_quit')}>退出验证壳</button>
  </BeamCard></main>;
}
createRoot(document.getElementById('root')).render(<Probe />);
