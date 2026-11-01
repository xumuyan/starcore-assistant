import { createServer } from 'node:http';
import QRCode from 'qrcode';

const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接微信 ClawBot</title>
<style>body{font:17px system-ui;margin:0;background:#f5f6f8;color:#17202b;display:grid;place-items:center;min-height:100vh}main{text-align:center;background:white;padding:32px;border-radius:20px;max-width:560px;margin:20px}h1{font-size:26px}img{width:min(380px,80vw);height:auto}p{line-height:1.6}small{color:#6b7280}#error{color:#b42318}</style>
<main><h1>连接微信 ClawBot</h1><p>请用手机微信扫一扫，并确认连接。</p><img id="qr" hidden alt="等待生成二维码"><p id="status">正在生成二维码…</p><small id="time"></small><p id="error"></p><p>二维码会自动更新，请扫描本页当前显示的码。<br>成功后到 ClawBot 聊天发送「开启提醒」。</p></main>
<script>
let revision=-1,busy=false;
async function refresh(){
 if(busy)return;busy=true;
 try{
  const s=await fetch('/status',{cache:'no-store',signal:AbortSignal.timeout(4000)}).then(r=>r.json());
  document.querySelector('#error').textContent='';
  document.querySelector('#status').textContent=s.phase==='connected'?'连接成功，请在 ClawBot 中发送「开启提醒」。':s.phase==='failed'?'本次登录已结束，请重新发起登录。':'等待扫码，二维码自动更新中';
  const image=document.querySelector('#qr');
  if(s.phase!=='waiting'){image.hidden=true;return;}
  if(s.revision!==revision && s.revision>0){image.src='/qr.png?v='+s.revision;revision=s.revision;}
  image.hidden=revision<1;
  if(s.generatedAt)document.querySelector('#time').textContent='当前二维码生成于 '+new Date(s.generatedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
 }catch{document.querySelector('#qr').hidden=true;document.querySelector('#error').textContent='登录服务已断开，本页旧二维码已隐藏，请重新发起登录。';}
 finally{busy=false;}
}
refresh();setInterval(refresh,1000);
</script></html>`;

export async function createLoginPage() {
  let image;
  let state = { phase: 'waiting', revision: 0, generatedAt: null };
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const route = req.url.split('?')[0];
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (route === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
    else if (route === '/status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); }
    else if (route === '/qr.png' && image && state.phase === 'waiting') { res.setHeader('Content-Type', 'image/png'); res.end(image); }
    else res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    async update(payload) {
      const next = await QRCode.toBuffer(payload, { width: 520, margin: 3 });
      image = next;
      state = { phase: 'waiting', revision: state.revision + 1, generatedAt: new Date().toISOString() };
    },
    finish(phase) { image = undefined; state = { ...state, phase }; },
    close() { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }
  };
}
