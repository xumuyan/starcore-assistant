import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { events, stateDir } from './store.mjs';
import { remoteEnabled, latestTarget, requests } from './remote-store.mjs';

const labels = ['local.codex-weixin-notifier', 'local.codex-weixin-desktop-watch'];
const domain = `gui/${process.getuid()}`;
// 可替换的 launchctl/plutil 仅用于测试；生产固定系统路径。
const launchctl = process.env.MOSS_LAUNCHCTL || '/bin/launchctl';
const plutil = process.env.MOSS_PLUTIL || '/usr/bin/plutil';
// 微信显示停用（2026-11-09 用户要求）：runtime-settings.json wechatDelivery=false 时 plist 为 Disabled。
const delivery = read('runtime-settings.json').wechatDelivery !== false;
function plistDisabled(label) {
  try {
    const parsed = JSON.parse(execFileSync(plutil, ['-convert', 'json', '-o', '-', join(homedir(), 'Library/LaunchAgents', `${label}.plist`)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    return parsed.Disabled === true;
  } catch { return false; }
}
function loaded(label) {
  try {
    const text = execFileSync(launchctl, ['print', `${domain}/${label}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /^\s*state = running\s*$/m.test(text);
  } catch { return false; }
}
function read(name) {
  try { return JSON.parse(readFileSync(join(stateDir, name), 'utf8')); } catch { return {}; }
}
const command = process.argv[2] ?? 'status';
if (command === 'start') {
  for (const label of labels) {
    // 用户停用（Disabled）的代理绝不重新引导；否则开始监听会把微信代理拉回来。
    if (plistDisabled(label)) continue;
    // A registered service may be waiting to restart. Don't register it twice.
    try { execFileSync(launchctl, ['print', `${domain}/${label}`], { stdio: 'ignore' }); }
    catch {
      try { execFileSync(launchctl, ['bootstrap', domain, join(homedir(), 'Library/LaunchAgents', `${label}.plist`)], { stdio: 'ignore' }); } catch {}
    }
  }
} else if (command === 'stop') {
  for (const label of [...labels].reverse()) {
    try { execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' }); } catch {}
  }
} else if (command !== 'status') {
  throw new Error('Unsupported command');
}
const service = read('status.json');
const desktop = read('desktop-status.json');
const list = events();
const botRunning = loaded(labels[0]);
const watcherRunning = loaded(labels[1]);
const index = join(stateDir, 'weixin/openclaw-weixin/accounts.json');
let bound = false;
try { bound = existsSync(index) && JSON.parse(readFileSync(index, 'utf8')).length > 0; } catch {}
const remote = requests();
console.log(JSON.stringify({
  delivery,
  serviceRunning: botRunning,
  watching: watcherRunning && desktop.running === true && !desktop.error && Date.now() - Date.parse(desktop.checkedAt) < 15000,
  bound,
  ready: botRunning && service.ready === true,
  paused: service.paused === true,
  sent: list.filter(e => e.status === 'sent').length,
  pending: list.filter(e => e.status === 'pending').length,
  uncertain: list.filter(e => ['sending', 'uncertain'].includes(e.status)).length,
  remoteEnabled: remoteEnabled(),
  remoteProject: latestTarget()?.project ?? null,
  remoteThreadId: latestTarget()?.threadId ?? null,
  remoteStatus: remote.find(r => r.status === 'running') ? '执行中' : remote.some(r => ['submitting', 'submitted'].includes(r.status)) ? '已投递，等待桌面执行' : remote.some(r => r.status === 'pending') ? '等待投递' : '空闲',
  latest: list.at(-1) ? { project: list.at(-1).project, summary: list.at(-1).summary, status: list.at(-1).status } : null
}));
