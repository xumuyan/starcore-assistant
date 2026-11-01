import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { stateDir, prepare, events, saveEvent, formatEvent, deliver } from './store.mjs';
import { installSendGuard } from './weixin-runtime.mjs';
import { createLoginPage } from './login-page.mjs';
import { acceptRemote, latestTarget, requests, saveRequest, remoteEnabled, setRemoteEnabled, inboundFilter } from './remote-store.mjs';
import { threadInfo, runExistingThread } from './codex-runner.mjs';

prepare();
// Keep the new binding separate from any old OpenClaw configuration or credentials.
process.env.OPENCLAW_STATE_DIR = join(stateDir, 'weixin');
process.env.OPENCLAW_CONFIG = join(process.env.OPENCLAW_STATE_DIR, 'openclaw.json');
process.env.OPENCLAW_LOG_LEVEL = 'FATAL';
process.umask(0o077);
installSendGuard({ filterInbound: inboundFilter() });
const command = process.argv[2];
const statusFile = join(stateDir, 'status.json');
if (command === 'status') {
  const list = events();
  console.log(JSON.stringify({
    service: existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : { running: false },
    desktop: existsSync(join(stateDir, 'desktop-status.json')) ? JSON.parse(readFileSync(join(stateDir, 'desktop-status.json'), 'utf8')) : { running: false },
    pending: list.filter(e => e.status === 'pending').length,
    uncertain: list.filter(e => ['sending', 'uncertain'].includes(e.status)).length,
    sent: list.filter(e => e.status === 'sent').length
  }, null, 2));
} else if (command === 'login') {
  const page = await createLoginPage();
  console.log(`LOGIN_PAGE ${page.url}`);
  const { login } = await import('weixin-agent-sdk');
  const { default: QRCode } = await import('qrcode');
  const { default: terminalQR } = await import('qrcode-terminal');
  // The SDK exposes QR only via qrcode-terminal. Render that same payload as PNG
  // for the desktop chat, including refreshed codes, without changing the SDK.
  const originalGenerate = terminalQR.generate.bind(terminalQR);
  terminalQR.generate = (value, options, callback) => {
    page.update(value).catch(() => console.error('实时二维码生成失败'));
    const path = join(stateDir, 'login-qr.png');
    QRCode.toFile(path, value, { width: 520, margin: 3 }).then(() => {
      chmodSync(path, 0o600);
      console.log(`QR_READY ${path}`);
    }).catch(() => console.log('二维码图片生成失败，请使用终端二维码。'));
    return originalGenerate(value, options, callback);
  };
  try {
    await login({ log(message) {
    // Only show QR / progress; don't dump protocol logs or credentials.
    const url = message.match(/https:\/\/[^\s]+/)?.[0];
    if (url && /二维码/.test(message)) {
      const path = join(stateDir, 'login-qr.png');
      QRCode.toFile(path, url, { width: 520, margin: 3 }).then(() => {
        chmodSync(path, 0o600);
        console.log(`QR_READY ${path}`);
      }).catch(() => console.log('二维码图片生成失败，请使用终端二维码。'));
    } else if (/成功|等待|扫描|确认|失败|过期/.test(message)) console.log(message);
    } });
    page.finish('connected');
  } catch (error) {
    page.finish('failed');
    await page.close();
    throw error;
  }
  console.log('LOGIN_OK 请启动服务后，在微信 ClawBot 中发送“开启提醒”。');
  const plist = join(homedir(), 'Library/LaunchAgents/local.codex-weixin-notifier.plist');
  if (existsSync(plist)) {
    const result = spawnSync('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plist], { encoding: 'utf8' });
    console.log(result.status === 0 ? '后台通知服务已启动。请在微信发送“开启提醒”。' : '后台服务未自动启动，请运行 npm start。');
  }
  // Keep the success page visible briefly; the notification service is separate.
  setTimeout(() => { page.close(); }, 30000).unref();
} else if (command === 'start') {
  const lock = join(stateDir, 'service.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
    if (alive) throw new Error('通知服务已在运行');
    unlinkSync(lock);
  }
  writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const abort = new AbortController();
  let ready = false;
  let paused = existsSync(statusFile) && JSON.parse(readFileSync(statusFile, 'utf8')).paused === true;
  const mark = (running) => writeFileSync(statusFile, JSON.stringify({ running, ready, paused, updated: new Date().toISOString() }), { mode: 0o600 });
  const stop = () => abort.abort();
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    const { start, isLoggedIn } = await import('weixin-agent-sdk');
    if (!isLoggedIn()) throw new Error('请先运行 npm run login 扫码绑定');
    // Only login account's owner can ask about local notification history.
    const index = JSON.parse(readFileSync(join(process.env.OPENCLAW_STATE_DIR, 'openclaw-weixin', 'accounts.json'), 'utf8'));
    const accountId = Array.isArray(index) ? index[0] : null;
    if (!accountId) throw new Error('未找到绑定账号');
    const account = JSON.parse(readFileSync(join(process.env.OPENCLAW_STATE_DIR, 'openclaw-weixin', 'accounts', `${accountId}.json`), 'utf8'));
    const owner = account.userId;
    if (!owner) throw new Error('缺少绑定用户，请重新扫码');
    for (const event of events()) {
      if (event.status === 'sending') { event.status = 'uncertain'; saveEvent(event); }
    }
    for (const request of requests()) {
      if (request.status === 'submitting') {
        request.status = 'uncertain';
        request.detail = '服务中断后执行结果未确认，不会自动重发';
        saveRequest(request);
      }
    }
    const bot = start({ async chat(request) {
      if (request.conversationId !== owner) return {};
      const text = request.text.trim();
      if (/^(开启提醒|恢复)$/.test(text)) paused = false;
      ready = !paused;
      mark(true);
      if (/^(最新|最近|结果)$/.test(text)) {
        const event = events().at(-1);
        return { text: event ? formatEvent(event) : '还没有收到 Codex 结束事件。' };
      }
      if (/^(暂停|关闭提醒)$/.test(text)) {
        paused = true;
        ready = false;
        mark(true);
        return { text: '已暂停推送。发送“开启提醒”恢复。' };
      }
      if (/^(关闭续写|开启续写)$/.test(text)) {
        const enabled = text === '开启续写';
        setRemoteEnabled(enabled);
        return { text: enabled ? '手机续写已开启，普通文字会发到最近一条任务提醒对应的聊天。' : '手机续写已关闭。已开始的任务会继续；待执行要求将暂停。' };
      }
      if (/^(当前项目|当前聊天)$/.test(text)) {
        const target = latestTarget();
        return { text: target ? `当前目标项目：${target.project}\n模式：最近一条已发送提醒对应的聊天\n手机续写：${remoteEnabled() ? '开启' : '关闭'}` : '暂无可续写聊天，请等待一条新的任务结束提醒。' };
      }
      if (!/^(开启提醒|恢复|状态|帮助)$/.test(text)) {
        if (request.media || !text) return { text: '手机续写目前支持文字要求，请输入文字。' };
        return { text: acceptRemote(text, owner).reply };
      }
      const list = events();
      const target = latestTarget();
      const queued = requests().filter(r => r.status === 'pending').length;
      return { text: `Codex 微信提醒已连接。\n待发送：${list.filter(e => e.status === 'pending').length} 条\n结果未确认：${list.filter(e => e.status === 'uncertain').length} 条\n手机续写：${remoteEnabled() ? '开启' : '关闭'}；待执行 ${queued} 条\n当前目标：${target?.project ?? '等待新提醒'}\n\n普通文字会发给最近一条已发送提醒对应的原聊天。\n支持：当前项目、最新、状态、开启提醒、暂停、关闭续写、开启续写。` };
    } }, { accountId, abortSignal: abort.signal, log(message) {
      if (/error|failed|expired|过期|失败/i.test(message)) console.error('微信连接异常，详细协议内容不写入日志。');
    } });
    mark(true);
    console.log('SERVICE_READY 请在微信 ClawBot 发送“开启提醒”；每次服务重启都需发一条消息。');
    const worker = (async () => {
      while (!abort.signal.aborted) {
        if (ready) {
          const event = events().find(e => e.status === 'pending');
          if (event) {
            const status = await deliver(event, text => bot.sendMessage(text));
            if (status === 'uncertain') { ready = false; mark(true); }
          }
        }
        await sleep(2000, undefined, { signal: abort.signal }).catch(() => {});
      }
    })();
    const remoteWorker = (async () => {
      while (!abort.signal.aborted) {
        if (remoteEnabled()) {
          const request = requests().find(r => r.status === 'pending');
          if (request) {
            let info;
            try { info = threadInfo(join(homedir(), '.codex', 'state_5.sqlite'), request.threadId); } catch {}
            if (!info) {
              request.status = 'failed';
              request.detail = '原聊天已不存在或不可续写，请先回到电脑检查';
              saveRequest(request);
              await bot.sendMessage(`手机续写未执行。\n项目：${request.project}\n${request.detail}`).catch(() => {});
            } else {
              request.status = 'submitting';
              saveRequest(request);
              let result;
              try {
                const config = JSON.parse(readFileSync(join(stateDir, 'runtime-settings.json'), 'utf8'));
                result = await runExistingThread(config.codex, info, request.text, { clientUserMessageId: request.clientUserMessageId, onSpawn(pid) {
                  request.pid = pid;
                  saveRequest(request);
                } });
              } catch { result = { status: 'failed', detail: 'Codex 启动失败，请检查客户端配置' }; }
              const observed = requests().find(r => r.id === request.id) ?? request;
              if (!['running', 'completed'].includes(observed.status)) observed.status = result.status;
              observed.detail = result.detail;
              observed.submissionId = result.submissionId;
              saveRequest(observed);
              if (result.status !== 'submitted') {
                await bot.sendMessage(`手机续写未确认完成。\n项目：${request.project}\n${result.detail}`).catch(() => {});
              }
            }
          }
        }
        await sleep(2000, undefined, { signal: abort.signal }).catch(() => {});
      }
    })();
    await Promise.race([bot.wait(), worker, remoteWorker]);
    abort.abort();
    await Promise.allSettled([worker, remoteWorker, bot.wait()]);
  } finally {
    ready = false;
    mark(false);
    unlinkSync(lock);
  }
} else {
  console.log('使用：npm run login | npm start | npm run status');
  process.exitCode = 1;
}
