// Visual fixture only: no microphone access, keys, model calls or native bridge.
window.receive({ type: 'configured', settings: { name: '贾维斯', wakeWord: '贾维斯', chatModel: 'fixture', chatBaseUrl: 'https://api.yunqiao.me/v1', modelPath: '/visual-fixture.gguf', polishEnabled: false, reducedMotion: false, voice: 'system', speak: false, autoListen: false }, hasGateway: true });
window.receive({ type: 'microphone', enabled: true });
document.getElementById('listen').querySelector('span:last-child').textContent = '聆听中';
document.getElementById('core-detail').textContent = '说「贾维斯」继续对话';
document.getElementById('clock').textContent = '14:48';
const target = document.getElementById('target'); target.options[0].textContent = 'Mac 个人助理';
document.getElementById('task-project').textContent = '等待你的下一步';
document.getElementById('task-summary').textContent = '';
document.getElementById('task-state').textContent = '';
document.getElementById('recent-user').textContent = '帮我整理今天的会议要点';
document.getElementById('recent-assistant').textContent = '分析这份产品方案的优缺点';
document.getElementById('privacy-note').textContent = '本地视觉对照 · 未采集语音';
document.querySelectorAll('.wave b').forEach((bar,i) => bar.style.height = [5,10,16,24,32,22,16,10,5][i]+'px');
