import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ConversationEffect, DictationEffect } from './effects.jsx';
import { Button, Input, Switch } from './beui.jsx';
import { runSelfCheck, renderedDemo } from './self-check.mjs';
import './style.css';
import './probe.css';
import './beui.css';

const params = new URLSearchParams(location.search);
const view = params.get('view');
const selfCheck = params.get('selfCheck') === '1';
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
      if (selfCheck && !disposed) {
        await invoke('probe_check_ready');
        if (view === 'chooser') runSelfCheck(invoke).catch(() => invoke('probe_check_finish', { passed: false }).catch(() => {}));
      }
    }).catch(() => { if (!disposed) setError('无法读取验证壳状态'); });
    const cancel = event => { if (event.key === 'Escape') command('probe_hide'); };
    window.addEventListener('keydown', cancel);
    return () => { disposed = true; subscription.then(unlisten => unlisten()).catch(() => {}); window.removeEventListener('keydown', cancel); };
  }, []);
  useEffect(() => {
    if (!selfCheck || view !== 'overlay') return;
    // Observe committed React DOM, including unmount on hide; not animation parity.
    // Hidden WKWebViews may suspend animation frames; effects run after DOM commit.
    if (renderedDemo(document, state.demo)) {
      invoke('probe_check_rendered', { demo: state.demo }).catch(() => {});
    }
  }, [state.demo]);
  if (view === 'overlay') {
    const phase = state.demo === 'dictation' ? 'processing' : state.demo || 'hidden';
    const Effect = state.demo === 'dictation' ? DictationEffect : ConversationEffect;
    return <main className="probe-overlay"><Effect phase={phase} level={0.55} text="T0 合成效果 · 未录音 · Esc 隐藏" /></main>;
  }
  // Frameless menu-bar entry: two small pills; opening a page hides this entry.
  if (view === 'chooser') return <main className="probe-chooser">
    <Button size="sm" onClick={() => command('probe_open', { page: 'history' })}>历史记录</Button>
    <Button size="sm" onClick={() => command('probe_open', { page: 'settings' })}>设置</Button>
    {error && <p role="alert">{error}</p>}
  </main>;
  if (view !== 'history' && view !== 'settings') return null;
  return <main className="probe-page"><section className="probe-panel">
    <h1>{view === 'history' ? '历史记录' : '设置'} · T0 验证</h1>
    <p>隔离壳：无麦克风、聊天、真实历史或配置读写。</p>
    {view === 'history' ? <p>尚未接入加密历史；这里不是清空后的历史。</p> : <>
      <div className="probe-actions">{[['listening', '收音外观'], ['processing', '思考外观'], ['speaking', '回复外观'], ['dictation', '听写思考']].map(([value, label]) =>
        <Button key={value} size="sm" onClick={() => command('probe_demo', { value })}>{label}</Button>
      )}<Button size="sm" variant="ghost" onClick={() => command('probe_hide')}>隐藏浮层</Button></div>
      <Switch checked={state.hotkeyEnabled} onCheckedChange={enabled => command('probe_hotkey', { enabled })}
        label="临时测试热键：Cmd/Ctrl + Shift + F8（退出即释放）" />
      <p>不注册右 Ctrl；无输入框写入。Esc 只在浮层可见时注册。非激活、全屏、多屏仍需实测。</p>
      <Input label="键盘输入验证" placeholder="仅当前页面，不保存" className="probe-input" />
    </>}
    {error && <p role="alert">{error}</p>}
    <Button variant="outline" size="sm" onClick={() => command('probe_quit')}>退出验证壳</Button>
  </section></main>;
}
createRoot(document.getElementById('root')).render(<Probe />);
