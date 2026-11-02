'use strict';
(() => {
  const node = id => document.getElementById(id);
  const titles = { tasks: '任务', chat: '聊天', settings: '设置' };
  window.mossNavigate = page => {
    if (!Object.hasOwn(titles, page)) return;
    document.body.dataset.page = page;
    for (const name of ['tasks', 'chat']) node('page-' + name).hidden = page !== name;
    node('settings-overlay').hidden = page !== 'settings';
    for (const name of Object.keys(titles)) {
      node('nav-' + name).classList.toggle('active', name === page);
      node('nav-' + name).setAttribute('aria-current', name === page ? 'page' : 'false');
    }
    node('page-title').textContent = titles[page];
    if (page === 'chat') { node('history-panel').hidden = false; node('composer-panel').hidden = false; }
  };
  for (const page of Object.keys(titles)) node('nav-' + page).onclick = () => { window.mossNavigate(page); if (page === 'settings') bridge('dictationRefresh'); };
  const labels = { running: '运行中', completed: '本轮结束', failed: '异常', cancelled: '已取消', unknown: '未知' };
  function renderTasks(event) {
    const tasks = Array.isArray(event.tasks) ? event.tasks : [];
    const running = event.available ? tasks.filter(task => task.status === 'running').length : 0;
    node('running-count').textContent = node('tasks-running').textContent = String(running);
    node('tasks-total').textContent = `${tasks.length} 个聊天`;
    const checked = new Date(event.checkedAt);
    node('tasks-freshness').textContent = Number.isNaN(checked.getTime()) ? '同步时间未知' : '更新于 ' + checked.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    node('tasks-status').textContent = !event.available ? '任务来源暂不可用 · 无法确认当前运行状态' : tasks.length ? '选择聊天，固定下一次交接的目标。' : '暂无可展示的 Codex 聊天。';
    const list = node('tasks-list'); list.replaceChildren();
    for (const task of tasks) {
      const card = document.createElement('article'); card.className = 'task-card';
      const top = document.createElement('div'); top.className = 'task-card-top';
      const project = document.createElement('span'); project.className = 'task-project'; project.textContent = task.project || '未命名项目';
      const status = event.available && Object.hasOwn(labels, task.status) ? task.status : 'unknown';
      const badge = document.createElement('span'); badge.className = 'status-badge ' + status; badge.textContent = labels[status]; top.append(project, badge);
      const title = document.createElement('h3'); title.textContent = task.title || '未命名聊天';
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
  });
  node('tasks-refresh').onclick = () => bridge('tasks');
  node('graphics-status').textContent = '轻量玻璃界面 · 无全屏场景动画';
  window.mossNavigate('tasks'); bridge('tasks'); setInterval(() => bridge('tasks'), 3000);
})();
