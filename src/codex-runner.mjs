import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, statSync, readSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { redact } from './store.mjs';

export function threadInfo(database, id) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const row = db.prepare('SELECT id,cwd,rollout_path,source,archived FROM threads WHERE id=?').get(id);
    if (!row || row.archived || row.source.includes('subagent')) return null;
    const stat = statSync(row.rollout_path);
    const start = Math.max(0, stat.size - 4 * 1024 * 1024);
    const buffer = Buffer.alloc(stat.size - start);
    const fd = openSync(row.rollout_path, 'r');
    let count;
    try { count = readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
    let status = 'unknown';
    for (const line of buffer.subarray(0, count).toString('utf8').split('\n')) {
      try {
        const item = JSON.parse(line);
        if (item.type !== 'event_msg') continue;
        if (item.payload?.type === 'task_started') status = 'active';
        if (['task_complete', 'turn_aborted'].includes(item.payload?.type)) status = 'idle';
      } catch {}
    }
    return { id: row.id, cwd: row.cwd, status };
  } finally { db.close(); }
}

export function proxyEnvironment() {
  const env = { ...process.env };
  if (env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy) return env;
  try {
    const data = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8' });
    const host = data.match(/^\s*HTTPSProxy\s*:\s*(\S+)/m)?.[1];
    const port = data.match(/^\s*HTTPSPort\s*:\s*(\d+)/m)?.[1];
    if (/HTTPSEnable\s*:\s*1/.test(data) && host && port) {
      env.HTTPS_PROXY = `http://${host}:${port}`;
      env.HTTP_PROXY = env.HTTPS_PROXY;
    }
  } catch {}
  return env;
}

export function runExistingThread(codex, thread, text, { onSpawn = () => {}, spawnProcess = spawn, clientUserMessageId, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    // Queue input for the desktop owner. Do NOT resume/claim its active writer,
    // create a new thread, run a model here, or override its execution settings.
    const child = spawnProcess(codex, ['app-server', '--stdio'], {
      cwd: thread.cwd, env: proxyEnvironment(), stdio: ['pipe', 'pipe', 'pipe']
    });
    let buffer = '';
    let submitted = false;
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
      child.kill('SIGTERM');
    };
    const timer = setTimeout(() => finish({ status: submitted ? 'uncertain' : 'failed', detail: '桌面投递超时，结果未确认；不会自动重发要求' }), timeoutMs);
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    const decoder = new StringDecoder('utf8');
    child.once('spawn', () => onSpawn(child.pid));
    child.stdout.on('data', data => {
      buffer += decoder.write(data);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.id === 1) {
            if (event.error) { finish({ status: 'failed', detail: 'Codex 消息接口初始化失败' }); return; }
            send({ method: 'initialized' });
            submitted = true;
            send({ id: 2, method: 'thread/queue/add', params: { threadId: thread.id, clientUserMessageId, input: [{ type: 'text', text }] } });
          }
          if (event.id === 2) {
            if (event.error) finish({ status: 'failed', detail: redact(event.error.message).slice(0, 300) });
            else if (event.result?.queuedSubmission?.id) finish({ status: 'submitted', submissionId: event.result.queuedSubmission.id });
            else finish({ status: 'uncertain', detail: '桌面未返回明确的队列回执，不会自动重发' });
          }
        } catch {}
      }
    });
    child.stdin.on('error', () => {});
    child.once('error', () => finish({ status: 'failed', detail: '无法启动 Codex 消息接口，请检查客户端安装' }));
    child.once('close', () => finish({ status: submitted ? 'uncertain' : 'failed', detail: 'Codex 消息接口已断开，不会自动重发要求' }));
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'codex_weixin_notifier', version: '0.2.0' }, capabilities: { experimentalApi: true } } });
  });
}
