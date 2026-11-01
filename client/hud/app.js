'use strict';
const $ = id => document.getElementById(id);
const bridge = (action, payload = {}) => window.webkit?.messageHandlers?.assistant?.postMessage({ action, ...payload });
let settings = {}, mode = 'chat', mic = false, targets = [], latestId = '', toastTimer, oldFocus;
const names = { idle: ['准备就绪', '随时，听你吩咐。', 'STANDBY'], armed: ['等待唤醒', '我在，叫我就好。', 'ARMED'], loading: ['载入语音模型', '正在准备聆听。', 'LOADING'], listening: ['连续对话', '我在听，请继续。', 'LISTENING'], transcribing: ['本机识别中', '听见了，正在识别。', 'DECODING'], thinking: ['思考中', '让我想一想。', 'THINKING'], executing: ['正在交给 Codex', '想法，进入行动。', 'DISPATCH'], polishing: ['可选口述校对', '只校对口述，不回答。', 'POLISH'], synthesizing: ['生成语音中', '马上说给你听。', 'SYNTHESIS'], speaking: ['正在回复', '这就是我的想法。', 'SPEAKING'], error: ['需要处理', '有一处需要留意。', 'ATTENTION'] };
function state(name, detail) {
  document.body.classList.toggle('busy', ['thinking','speaking','synthesizing','transcribing','executing','polishing'].includes(name));
  document.dispatchEvent(new CustomEvent('assistant-state', { detail: name }));
  const copy = names[name] || names.idle;
  $('core-stage').dataset.state = name; $('state-caption').textContent = copy[0]; $('core-title').textContent = copy[1]; $('core-label').textContent = copy[2];
  $('core-detail').textContent = detail || (mic ? `说「${settings.wakeWord || '贾维斯'}」开始对话。` : '开启语音，然后叫醒我。');
  $('composer-status').textContent = ['thinking', 'executing', 'synthesizing'].includes(name) ? copy[0] : '';
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 11000); }
function addMessage(role, content) {
  $('empty')?.remove(); const box = document.createElement('div'); box.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = role === 'user' ? 'YOU' : (settings.name || '贾维斯').toUpperCase();
  const text = document.createElement('div'); text.className = 'message-content'; text.textContent = content; box.append(label, text); $('messages').append(box);
  while ($('messages').children.length > 120) $('messages').firstElementChild.remove();
  $('messages').scrollTop = $('messages').scrollHeight;
}
const targetLabel = text => String(text || '未命名聊天').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\//g, '').replace(/\s+/g, ' ').trim();
function closeTargetMenu(restore=false) { $('target-popover').hidden=true; $('target-toggle').setAttribute('aria-expanded','false'); if(restore)$('target-toggle').focus(); }
function targetOptions() {
  const select=$('target'), latest=targets.find(x=>x.id===latestId), selected=targets.find(x=>x.id===settings.target);
  const open=!$('target-popover').hidden, focusedId=document.activeElement?.dataset?.targetId;
  select.replaceChildren(); const rows=[{id:'',project:'跟随最近一条提醒',title:latest?`${latest.project} · ${targetLabel(latest.title)}`:'收到提醒后自动确定目标'} ,...targets];
  if(settings.target&&!selected)rows.push({id:settings.target,project:'已选聊天不可用',title:'请选择其他聊天，或改为自动跟随',unavailable:true});
  const menu=$('target-menu');menu.replaceChildren();
  for(const row of rows){
    const option=document.createElement('option');option.value=row.id;option.textContent=row.project+' / '+targetLabel(row.title);select.append(option);
    const button=document.createElement('button');button.type='button';button.className='target-option';button.setAttribute('role','option');button.setAttribute('aria-selected',String(row.id===(settings.target||'')));button.tabIndex=-1;button.dataset.targetId=row.id;
    const copy=document.createElement('span');copy.className='option-copy';const project=document.createElement('strong');project.textContent=row.project;const title=document.createElement('span');title.textContent=targetLabel(row.title);copy.append(project,title);
    const check=document.createElement('img');check.className='ui-icon option-check';check.src='icons/check.svg';check.alt='';button.append(copy,check);button.title=row.project+' · '+targetLabel(row.title);button.disabled=!!row.unavailable;
    button.onclick=()=>{select.value=row.id;select.dispatchEvent(new Event('change'));closeTargetMenu(true);};menu.append(button);
  }
  select.value=settings.target||'';
  const current=settings.target?selected:latest;
  $('target-mode').textContent=settings.target?'固定聊天':'自动跟随';
  $('target-project').textContent=current?.project||(settings.target?'聊天暂不可用':'等待最近提醒');
  $('target-title').textContent=current?targetLabel(current.title):(settings.target?'点击重新选择目标聊天':'收到提醒后自动连接到对应聊天');
  $('target-toggle').title=[$('target-mode').textContent,$('target-project').textContent,$('target-title').textContent].join(' · ');
  if(open&&focusedId!==undefined){const items=[...menu.children].filter(x=>!x.disabled);(items.find(x=>x.dataset.targetId===focusedId)||items.find(x=>x.getAttribute('aria-selected')==='true')||items[0])?.focus();}
}
function openTargetMenu(edge) {
  $('target-popover').hidden=false;$('target-toggle').setAttribute('aria-expanded','true');
  const options=[...$('target-menu').children].filter(x=>!x.disabled);
  const active=edge==='last'?options.at(-1):options.find(x=>x.getAttribute('aria-selected')==='true')||options[0];active?.focus();
}
$('target-toggle').onclick=()=> $('target-popover').hidden?openTargetMenu():closeTargetMenu();
$('target-toggle').onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();openTargetMenu(e.key==='End'?'last':undefined);}};
$('target-menu').onkeydown=e=>{
  const options=[...$('target-menu').children].filter(x=>!x.disabled),index=options.indexOf(document.activeElement);let next;
  if(e.key==='ArrowDown')next=options[Math.min(index+1,options.length-1)];if(e.key==='ArrowUp')next=options[Math.max(index-1,0)];if(e.key==='Home')next=options[0];if(e.key==='End')next=options.at(-1);
  if(next){e.preventDefault();next.focus();next.scrollIntoView({block:'nearest'});}
};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.target-picker'))closeTargetMenu();});
document.addEventListener('keydown',e=>{if($('target-popover').hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeTargetMenu(true);}else if(e.key==='Tab')closeTargetMenu(true);},true);
function configure(config, gateway, deepseek, fish) {
  settings = config; $('assistant-name').replaceChildren(document.createTextNode(config.name)); const suffix = document.createElement('span'); suffix.textContent = ' / PERSONAL ASSISTANT'; $('assistant-name').append(suffix);
  $('wake-word').textContent = config.wakeWord;
  for (const [key, value] of Object.entries(config)) { const input = $(`set-${key}`); if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } }
  $('gateway-status').textContent = gateway ? '本地已加密保存' : '待填写云桥 Key';
  $('gateway-key').placeholder = gateway ? '已保存 · 留空不修改' : '输入云桥自己的 API Key';
  $('gateway-key').value = ''; $('remove-gateway').checked = false;
  document.body.classList.toggle('reduce-motion', config.reducedMotion);
  $('deepseek-status').textContent = deepseek ? '本地已加密保存' : '待填写 API Key';
  $('chat-setup').hidden = gateway;
  $('deepseek-key').placeholder = deepseek ? '已保存 · 留空不修改' : '输入 DeepSeek API Key'; $('fish-key').placeholder = fish ? '已保存 · 留空不修改' : '输入 Fish Audio API Key';
  $('deepseek-key').value = $('fish-key').value = ''; $('remove-deepseek').checked = $('remove-fish').checked = false;
  $('fish-fields').hidden = config.voice !== 'fish'; $('save-status').textContent = '设置已保存在本机';
  state('idle', gateway ? `说「${config.wakeWord}」开始，或先输入一条消息。` : '本地识别已就绪 · 请先在设置填写云桥聊天密钥'); targetOptions();
}
window.receive = event => {
  document.dispatchEvent(new CustomEvent('assistant-event', { detail: event }));
  switch (event.type) {
    case 'configured': configure(event.settings, event.hasGateway, event.hasDeepSeek, event.hasFish); break;
    case 'dictationStatus':
      $('dictation-status').textContent = `${event.enabled ? (event.monitoring ? '全局按键已就绪' : '全局按键尚未就绪') : '语音输入未启用'} · 输入监控${event.inputMonitoring ? '已允许' : '待授权'} · 辅助功能${event.accessibility ? '已允许' : '待授权'} · 麦克风${event.microphone ? '已允许' : '待授权'}${event.suspended ? ' · 已暂停' : ''}${event.detail ? ' · ' + event.detail : ''}`;
      break;
    case 'state': state(event.name, event.detail); break;
    case 'usage': if (Number.isFinite(event.input) && Number.isFinite(event.output)) $('usage-label').textContent = `最近一次：输入 ${event.input} / 输出 ${event.output} tokens（非费用）`; break;
    case 'notice': toast(event.message); break;
    case 'historyPage': renderHistoryPage(event); break;
    case 'polished': $('core-detail').textContent = '口述校对：' + event.text; break;
    case 'error': toast(event.message); $('save-status').textContent = event.message; break;
    case 'message': addMessage(event.role, event.content); break;
    case 'history': $('messages').replaceChildren(); for (const x of event.messages) addMessage(x.role, x.content); if (!event.messages.length) showEmpty(); break;
    case 'targets': targets = event.targets; latestId = event.latestId; targetOptions(); break;
    case 'modelPath': $('set-modelPath').value = event.path; break;
    case 'preference': settings[event.key] = event.value; if ($(`set-${event.key}`)) $(`set-${event.key}`).checked = event.value; break;
    case 'asr': $('asr-backend').textContent = `QWEN3 · ${event.backend.toUpperCase()}`; break;
    case 'microphone':
      mic = event.enabled; $('listen').setAttribute('aria-label', mic ? '暂停语音监听' : '开启语音监听'); $('listen').querySelector('span:last-child').textContent = mic ? '聆听中' : '开启聆听';
      $('privacy-note').textContent = mic ? '麦克风已开启 · 未唤醒的片段只在本机识别' : '唤醒识别在本机进行 · 语音监听未开启';
      if (!mic) { $('level-label').textContent = 'MIC · OFFLINE'; document.querySelectorAll('.wave b').forEach(b => b.style.height = '3px'); }
      break;
    case 'outputLevel': document.querySelectorAll('.wave b').forEach((b, i) => b.style.height = `${3 + event.value * (9 + (i % 3) * 7)}px`); break;
    case 'level':
      $('level-label').textContent = `MIC · ${Math.round(event.value * 100)}%`;
      document.querySelectorAll('.wave b').forEach((b, i) => b.style.height = `${3 + event.value * (9 + (i % 3) * 7)}px`); break;
    case 'snapshot': renderSnapshot(event.snapshot); break;
  }
};
function renderSnapshot(s) {
  if (typeof s.remoteThreadId === 'string' && latestId !== s.remoteThreadId) { latestId = s.remoteThreadId; targetOptions(); }
  $('codex-state').textContent = s.watching ? `完成监听中 · ${s.remoteStatus}` : '完成监听未运行'; $('codex-dot').classList.toggle('connected', s.watching);
  $('weixin-state').textContent = !s.bound ? '尚未绑定' : s.ready ? '提醒已连接' : s.paused ? '提醒已暂停' : '等待「开启提醒」'; $('weixin-dot').classList.toggle('connected', s.ready);
  $('services-summary').textContent = '本机识别 · 云桥聊天';
  $('service-detail').textContent = `Codex ${s.watching ? '监听中' : '未运行'} · 微信 ${s.ready ? '可推送' : '等待会话'} · 已发送 ${s.sent} · 待发送 ${s.pending} · 结果未确认 ${s.uncertain}`;
  $('task-counts').textContent = `微信已发送 ${s.sent} · 待发送 ${s.pending}`;
  if (s.latest) { $('task-project').textContent = '最近完成 · ' + s.latest.project; $('task-summary').textContent = s.latest.summary.replace(/[*#`]/g, ''); $('task-state').textContent = s.latest.status === 'sent' ? '已提醒' : s.latest.status === 'pending' ? '等待推送' : '结果未确认'; }
}
const emptyTemplate = $('empty').cloneNode(true);
function showEmpty() { const node = emptyTemplate.cloneNode(true); $('messages').append(node); wirePrompts(node); }
function wirePrompts(root) { root.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => { $('input').value = b.dataset.prompt; $('composer-panel').hidden = false; $('input').focus(); }); root.querySelector('#latest-prompt')?.addEventListener('click', () => bridge('latest')); }
wirePrompts(document);
function send() { const text = $('input').value.trim(); if (!text) return; bridge('text', { text, mode }); $('input').value = ''; }
$('send').onclick = send;
$('input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
for (const choice of ['chat', 'codex']) $(`mode-${choice}`).onclick = () => { mode = choice; $('mode-chat').classList.toggle('selected', mode === 'chat'); $('mode-codex').classList.toggle('selected', mode === 'codex'); $('input').placeholder = mode === 'codex' ? '开发要求将发送到上方选中的原 Codex 聊天…' : '说点什么，或输入你的要求…'; $('input').focus(); };
$('listen').onclick = () => { bridge('listen', { enabled: !mic }); if (!mic) state('loading', '正在请求麦克风权限并加载模型'); };
$('interrupt').onclick = () => bridge('cancel');
$('home').onclick = () => bridge('activate');
$('latest').onclick = $('activity-open').onclick = () => bridge('latest');
$('clear').onclick = () => bridge('clear');
$('refresh-targets').onclick = () => bridge('targets');
$('target').onchange = () => { settings.target = $('target').value; targetOptions(); bridge('save', { settings }); };
targetOptions();
function openSettings() { oldFocus = document.activeElement; $('settings-overlay').hidden = false; $('set-name').focus(); bridge('dictationRefresh'); }
function closeSettings() { $('settings-overlay').hidden = true; oldFocus?.focus(); }
document.querySelectorAll('.settings-open').forEach(button => button.onclick = openSettings);
$('settings-close').onclick = closeSettings;
$('settings-overlay').onclick = e => { if (e.target === $('settings-overlay')) closeSettings(); };
document.addEventListener('keydown', e => {
  if (e.metaKey && e.key === '.') { e.preventDefault(); bridge('cancel'); }
  if (e.key === 'Escape') { if (!$('settings-overlay').hidden) closeSettings(); else if (!$('history-panel').hidden) $('history-panel').hidden = true; else if (!$('composer-panel').hidden) $('composer-panel').hidden = true; else bridge('cancel'); }
  if (e.key === 'Tab' && !$('settings-overlay').hidden) {
    const items = [...$('settings-overlay').querySelectorAll('button,input,select')].filter(x => x.offsetParent !== null && !x.disabled);
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
$('set-voice').onchange = () => $('fish-fields').hidden = $('set-voice').value !== 'fish';
$('choose-model').onclick = () => bridge('chooseModel');
$('preview-voice').onclick = () => bridge('previewVoice');
$('migrate-keys').onclick = () => bridge('migrateKeys');
$('mic-settings').onclick = () => bridge('micSettings');
for (const kind of ['input', 'accessibility', 'microphone']) $('dictation-' + kind).onclick = () => bridge('dictationPermission', { kind });
$('dictation-refresh').onclick = () => bridge('dictationRefresh');
$('services-start').onclick = () => bridge('startServices'); $('services-stop').onclick = () => bridge('stopServices'); $('bind').onclick = () => bridge('bind');
$('settings-form').onsubmit = e => {
  e.preventDefault(); const next = { ...settings };
  for (const key of Object.keys(settings)) { const input = $(`set-${key}`); if (input) next[key] = input.type === 'checkbox' ? input.checked : input.value.trim(); }
  $('save-status').textContent = '正在保存…';
  bridge('save', { settings: next, gatewayKey: $('gateway-key').value, removeGateway: $('remove-gateway').checked, deepseekKey: $('deepseek-key').value, fishKey: $('fish-key').value, removeDeepSeek: $('remove-deepseek').checked, removeFish: $('remove-fish').checked });
  $('gateway-key').value = $('deepseek-key').value = $('fish-key').value = '';
};
function clock() { const now = new Date(); $('clock').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }); $('date').textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); }
let historyBefore, historyQuery = '';
function renderHistoryPage(event) {
  $('messages').replaceChildren(); historyBefore = event.messages[0]?.id; historyQuery = event.query || '';
  for (const message of event.messages) addMessage(message.role, message.content);
  if (!event.messages.length) $('messages').textContent = '没有更多匹配的记录。';
  $('history-older').disabled = !event.messages.length;
}
function openHistory() { $('history-panel').hidden = false; bridge('historyPage', {}); }
$('history-open').onclick = $('history-all').onclick = openHistory;
$('history-close').onclick = () => $('history-panel').hidden = true;
$('history-search-go').onclick = () => bridge('historyPage', { query: $('history-search').value.trim() });
$('history-search').onkeydown = e => { if (e.key === 'Enter') $('history-search-go').click(); };
$('history-recent').onclick = () => { $('history-search').value = ''; bridge('historyPage'); };
$('history-older').onclick = () => bridge('historyPage', { before: historyBefore, query: historyQuery });
$('fullscreen').onclick = () => bridge('fullscreen');
$('keyboard-toggle').onclick = () => { $('composer-panel').hidden = !$('composer-panel').hidden; if (!$('composer-panel').hidden) $('input').focus(); };
$('keyboard-close').onclick = () => $('composer-panel').hidden = true;
clock(); setInterval(clock, 1000); bridge('ready');
