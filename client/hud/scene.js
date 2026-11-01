(() => {
  const byId = id => document.getElementById(id);
  function focus(role, content) {
    byId('focus-speaker').textContent = role === 'user' ? '你' : (settings.name || '贾维斯');
    byId('focus-content').textContent = content;
    byId(role === 'user' ? 'recent-user' : 'recent-assistant').textContent = content;
  }
  document.addEventListener('assistant-event', ({ detail: e }) => {
    if (e.type === 'configured') { byId('focus-speaker').textContent = e.settings.name; }
    if (e.type === 'message') focus(e.role, e.content);
    if (e.type === 'history' && e.messages.length) {
      const recentUser = [...e.messages].reverse().find(x => x.role === 'user');
      const recentReply = [...e.messages].reverse().find(x => x.role === 'assistant');
      if (recentUser) byId('recent-user').textContent = recentUser.content;
      const message = recentReply || e.messages.at(-1); focus(message.role, message.content);
    }
    if (e.type === 'configured' && !e.hasGateway) byId('core-detail').textContent = '云桥聊天待配置 · 打开右上角设置填写密钥';
  });
})();
