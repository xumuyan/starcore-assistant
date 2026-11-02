'use strict';
(() => {
  const node = id => document.getElementById(id);
  let panelOrigin = null;
  const titles = { tasks: '任务', chat: '聊天', settings: '设置' };
  window.mossNavigate = page => {
    if (!Object.hasOwn(titles, page)) return;
    if (page !== 'chat' && node('panel-backdrop').hidden) panelOrigin = document.activeElement;
    document.body.dataset.page = page;
    node('panel-backdrop').hidden = page === 'chat';
    node('page-chat').inert = page !== 'chat';
    node('page-chat').hidden = false;
    if (page !== 'chat') node('history-panel').hidden = true;
    node('page-tasks').hidden = page !== 'tasks';
    node('settings-overlay').hidden = page !== 'settings';
    for (const name of Object.keys(titles)) {
      node('nav-' + name).classList.toggle('active', name === page);
      node('nav-' + name).setAttribute('aria-current', name === page ? 'page' : 'false');
    }
    node('page-title').textContent = titles[page];
    if (page === 'chat') { node('composer-panel').hidden = false; panelOrigin?.focus(); }
    else node(page === 'tasks' ? 'close-tasks' : 'settings-close').focus();
  };
  window.mossClosePanels = () => { node('history-panel').hidden = true; window.mossNavigate('chat'); };
  window.mossShowHistory = () => {
    const origin = document.activeElement;
    window.mossNavigate('chat'); panelOrigin = origin;
    node('history-panel').hidden = false; node('panel-backdrop').hidden = false; node('page-chat').inert = true;
    node('history-close').focus();
  };
  window.mossActivePanel = () => !node('history-panel').hidden ? node('history-panel') : document.body.dataset.page === 'tasks' ? node('page-tasks') : document.body.dataset.page === 'settings' ? node('settings-overlay') : null;
  node('panel-backdrop').onclick = window.mossClosePanels;
  for (const page of Object.keys(titles)) node('nav-' + page).onclick = () => { window.mossNavigate(page); if (page === 'settings') bridge('dictationRefresh'); };
  node('close-tasks').onclick = () => window.mossNavigate('chat');
  node('side-codex').onclick = () => { node('mode-codex').onclick(); node('input').focus(); };
  for (const kind of ['dictation','weixin','pet']) node('open-' + kind).onclick = () => { window.mossNavigate('settings'); bridge('dictationRefresh'); node(kind === 'dictation' ? 'dictation-settings' : kind === 'weixin' ? 'reminder-settings' : 'pet-settings').scrollIntoView?.({block:'start'}); };
  const labels = { running: '运行中', completed: '本轮结束', failed: '异常', cancelled: '已取消', unknown: '未知' };
  let lastTasks = null, renderedTasks = '';
  function renderTasks(event) {
    lastTasks = event;
    const tasks = Array.isArray(event.tasks) ? event.tasks : [];
    const running = event.available ? tasks.filter(task => task.status === 'running').length : 0;
    node('chat-task-status').textContent = !event.available ? 'Codex 状态未确认 ↗' : running ? `${running} 个任务运行中 ↗` : tasks.some(task => task.status === 'unknown') ? '任务状态未确认 ↗' : '暂无运行任务 ↗';
    node('running-count').textContent = node('tasks-running').textContent = String(running);
    node('tasks-total').textContent = `${tasks.length} 个聊天`;
    const checked = new Date(event.checkedAt);
    node('tasks-freshness').textContent = Number.isNaN(checked.getTime()) ? '同步时间未知' : '更新于 ' + checked.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    node('tasks-status').textContent = !event.available ? '任务来源暂不可用 · 无法确认当前运行状态' : tasks.length ? '选择聊天，固定下一次交接的目标。' : '暂无可展示的 Codex 聊天。';
    const mini = node('mini-tasks'); mini.replaceChildren();
    const active = event.available ? tasks.filter(task => task.status === 'running').slice(0,3) : [];
    for (const task of active) { const row=document.createElement('div'); row.className='mini-task'; const name=document.createElement('span'); name.textContent=task.project; const status=document.createElement('small'); status.textContent='运行中'; row.append(name,status); mini.append(row); }
    const query = node('task-search').value.trim().toLocaleLowerCase();
    const filter = node('task-filter').value || 'all';
    const visible = tasks.filter(task => {
      const status = event.available && Object.hasOwn(labels, task.status) ? task.status : 'unknown';
      return (filter === 'all' || filter === status) && `${task.project || ''} ${task.title || ''}`.toLocaleLowerCase().includes(query);
    });
    node('tasks-total').textContent = query || filter !== 'all' ? `${visible.length} / ${tasks.length} 个聊天` : `${tasks.length} 个聊天`;
    const signature = JSON.stringify([event.available, visible]);
    node('tasks-empty').hidden = visible.length > 0;
    if (signature === renderedTasks) return;
    renderedTasks = signature;
    const list = node('tasks-list'); list.replaceChildren();
    for (const task of visible) {
      const card = document.createElement('article'); card.className = 'task-card';
      const top = document.createElement('div'); top.className = 'task-card-top';
      const project = document.createElement('span'); project.className = 'task-project'; project.textContent = task.project || '未命名项目';
      const status = event.available && Object.hasOwn(labels, task.status) ? task.status : 'unknown';
      const badge = document.createElement('span'); badge.className = 'status-badge ' + status; badge.textContent = labels[status]; top.append(project, badge);
      const title = document.createElement('h3'); title.textContent = targetLabel(task.title || '未命名聊天'); title.title = title.textContent;
      const bottom = document.createElement('div'); bottom.className = 'task-card-bottom';
      const time = document.createElement('span'); const updated = new Date(task.updatedAt || NaN); time.textContent = Number.isNaN(updated.getTime()) ? '暂无可靠更新时间' : updated.toLocaleString('zh-CN');
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'task-choose'; choose.textContent = '选择并聊天 ↗'; choose.disabled = !task.id;
      choose.onclick = () => {
        if (!targets.some(target => target.id === task.id)) targets.push({ id: task.id, project: task.project, title: task.title });
        settings.target = task.id; targetOptions(); bridge('save', { settings: { ...settings } }); window.mossNavigate('chat');
      };
      bottom.append(time, choose); card.append(top, title, bottom); list.append(card);
    }
  }
  document.addEventListener('assistant-event', ({ detail }) => {
    if (detail.type === 'tasks') renderTasks(detail);
    if (detail.type === 'navigate') window.mossNavigate(detail.page);
    if (detail.type === 'message') { node('focus-speaker').textContent = detail.role === 'user' ? '你' : (settings.name || 'MOSS'); node('focus-content').textContent = detail.content; }
    if (detail.type === 'configured') { node('pet-glance').textContent = detail.settings.petEnabled ? '已开启' : '未开启'; node('focus-speaker').textContent = detail.settings.name || 'MOSS'; }
    if (detail.type === 'dictationStatus') node('dictation-glance').textContent = detail.enabled ? detail.monitoring ? '快捷键已就绪' : '等待权限' : '未开启 · 按键听写';
    if (detail.type === 'snapshot') { const s=detail.snapshot; node('weixin-glance').textContent = !s.bound ? '未绑定' : s.ready ? '可接收提醒' : s.paused ? '已暂停' : '等待会话'; }
    if (detail.type === 'level') node('core-stage').style.setProperty?.('--voice-level', Math.max(0,Math.min(1,detail.value)));
    if (detail.type === 'outputLevel') node('core-stage').style.setProperty?.('--voice-level', Math.max(0,Math.min(1,detail.value)));
  });
  node('task-search').oninput = node('task-filter').onchange = () => { if (lastTasks) renderTasks(lastTasks); };
  node('tasks-refresh').onclick = () => bridge('tasks');
  node('graphics-status').textContent = '轻量玻璃界面 · 无全屏场景动画';
  node('chat-task-status').onclick = () => window.mossNavigate('tasks');
  window.mossNavigate('chat'); bridge('tasks'); setInterval(() => bridge('tasks'), 3000);
})();
