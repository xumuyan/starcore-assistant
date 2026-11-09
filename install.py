"""Install the Codex notify relay while preserving the existing notifier."""
from pathlib import Path
import datetime
import json
import os
import plistlib
import re
import shutil
import subprocess
import tempfile
import tomllib


def replace_notify(source, command):
    replacement = 'notify = ' + json.dumps(command, ensure_ascii=False) + '\n'
    lines = source.splitlines(keepends=True)
    start = None
    for i, line in enumerate(lines):
        if re.match(r'^\s*\[', line):
            break
        if re.match(r'^\s*notify\s*=', line):
            start = i
            break
    if start is None:
        result = replacement + source
    else:
        end = start + 1
        while end <= len(lines):
            try:
                parsed = tomllib.loads(''.join(lines[start:end]))
                if isinstance(parsed.get('notify'), list):
                    break
            except tomllib.TOMLDecodeError:
                pass
            end += 1
        if end > len(lines):
            raise ValueError('Cannot locate complete notify setting')
        result = ''.join(lines[:start]) + replacement + ''.join(lines[end:])
    before = tomllib.loads(source)
    after = tomllib.loads(result)
    before.pop('notify', None)
    actual = after.pop('notify')
    if before != after or actual != command:
        raise ValueError('Refusing to change unrelated configuration')
    return result


def atomic_write(path, content):
    fd, name = tempfile.mkstemp(dir=path.parent)
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    os.replace(name, path)


def main():
    root = Path(__file__).resolve().parent
    state = Path.home() / '.codex-weixin-notifier'
    state.mkdir(mode=0o700, exist_ok=True)
    # launchd must not depend on access to macOS-protected Documents folders.
    runtime = state / 'runtime'
    runtime.mkdir(mode=0o700, exist_ok=True)
    shutil.copytree(root / 'src', runtime / 'src', dirs_exist_ok=True)
    shutil.copytree(root / 'node_modules', runtime / 'node_modules', dirs_exist_ok=True)
    shutil.copy2(root / 'package.json', runtime / 'package.json')
    node = shutil.which('node')
    if not node:
        raise SystemExit('Node.js 22.16+ is required')
    codex = shutil.which('codex')
    # WeChat display pipeline is off by default since 2026-11-09 (user request: 不再在微信显示)。
    # Preserve an explicit true from the previous settings so re-enabling stays possible.
    try:
        previous = json.loads((state / 'runtime-settings.json').read_text('utf-8'))
    except Exception:
        previous = {}
    delivery = bool(previous.get('wechatDelivery'))
    atomic_write(state / 'runtime-settings.json', json.dumps({'codex': codex, 'wechatDelivery': delivery}, ensure_ascii=False))
    command = [node, str(runtime / 'src/notify.mjs')]
    config = Path.home() / '.codex/config.toml'
    source = config.read_text()
    prior = tomllib.loads(source).get('notify', [])
    if prior != command:
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        backup = state / ('codex-config-' + stamp + '.toml')
        backup.write_text(source)
        backup.chmod(0o600)
        own_previous = [node, str(root / 'src/notify.mjs')]
        if prior != own_previous or not (state / 'previous-notify.json').exists():
            atomic_write(state / 'previous-notify.json', json.dumps(prior, ensure_ascii=False))
        atomic_write(config, replace_notify(source, command))
    agents = Path.home() / 'Library/LaunchAgents'
    agents.mkdir(parents=True, exist_ok=True)
    # 微信显示默认停用（2026-11-09 用户要求不再在微信显示）：开关关闭时代理仍注册但 Disabled，
    # 并立即卸载已加载实例；将 runtime-settings.json 设 wechatDelivery=true 后再构建即可恢复。
    disabled = {'Disabled': True}
    plist = agents / 'local.codex-weixin-notifier.plist'
    value = {
        'Label': 'local.codex-weixin-notifier',
        'ProgramArguments': [node, str(runtime / 'src/cli.mjs'), 'start'],
        'WorkingDirectory': str(runtime),
        'RunAtLoad': True,
        'KeepAlive': {'SuccessfulExit': False},
        'ThrottleInterval': 30,
        'StandardOutPath': str(state / 'service.log'),
        'StandardErrorPath': str(state / 'service-error.log'),
        'EnvironmentVariables': {'PATH': str(Path(node).parent) + ':/usr/bin:/bin:/usr/sbin:/sbin'},
    }
    if not delivery:
        value.update(disabled)
    plist.write_bytes(plistlib.dumps(value))
    plist.chmod(0o600)
    watcher_plist = agents / 'local.codex-weixin-desktop-watch.plist'
    watcher = dict(value)
    watcher.update({
        'Label': 'local.codex-weixin-desktop-watch',
        'ProgramArguments': [node, str(runtime / 'src/desktop-watch.mjs')],
        'StandardOutPath': str(state / 'desktop-watch.log'),
        'StandardErrorPath': str(state / 'desktop-watch-error.log'),
    })
    if not delivery:
        watcher.update(disabled)
    watcher_plist.write_bytes(plistlib.dumps(watcher))
    watcher_plist.chmod(0o600)
    print('Codex notify configured; previous notifier preserved. Other TOML settings verified unchanged.')
    if not delivery:
        for label in ('local.codex-weixin-notifier', 'local.codex-weixin-desktop-watch'):
            try:
                subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}/{label}'],
                               check=False, capture_output=True, timeout=15)
            except Exception:
                pass
        print('微信提醒已停用（wechatDelivery=false）：事件由语音提醒消费后删除，不再在微信显示。')
    else:
        print('LaunchAgent prepared; it will start after successful QR login.')


if __name__ == '__main__':
    main()
