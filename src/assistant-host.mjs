import {homedir} from 'node:os';
import {join} from 'node:path';
import {CodexTaskStatus} from './codex-task-status.mjs';
import { createInterface } from 'node:readline';
import { AssistantService } from './assistant-service.mjs';
import { LocalASR } from './assistant-asr.mjs';
import { AssistantDictationHost } from './assistant-dictation-host.mjs';
import { CompletionVoiceReminder } from './assistant-reminder.mjs';

process.umask(0o077);
const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
const taskStatus = new CodexTaskStatus(join(homedir(), '.codex/state_5.sqlite'));
const asr = new LocalASR();
const assistant = new AssistantService({ emit, asr });
const dictation = new AssistantDictationHost({ assistant, asr, emit });
const reminder = new CompletionVoiceReminder({ service: assistant, isBusy: () => dictation.active });
// Each operation handles its own concurrency. Abort/listen/stop must be able to
// arrive during inference or an HTTP request; do not serialize the input stream.
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', line => {
  if (line.length > 3 * 1024 * 1024) return;
  (async () => {
    const event = JSON.parse(line);
    // Preserve synchronous ownership of original text/audio before the next line.
    const handled = dictation.handle(event);
    if (handled === true || (handled && await handled)) return;
    switch (event.type) {
      case 'tasks': emit(taskStatus.snapshot()); break;
      case 'configure': await assistant.configure(event.settings, event.keys); break;
      case 'listen':
        assistant.listening = !!event.enabled;
        if (event.enabled) {
          try {
            await assistant.prepareASR();
            if (assistant.listening) { assistant.state('armed', '等待唤醒词'); emit({ type: 'capture', enabled: true }); }
          } catch (error) {
            assistant.listening = false; emit({ type: 'capture', enabled: false });
            assistant.state('error', '本地模型未能加载'); assistant.error(error.message);
          }
        } else { assistant.cancel(); assistant.wake.sleep(); emit({ type: 'capture', enabled: false }); }
        break;
      case 'audio': await assistant.audio(event.audio); break;
      case 'text': await assistant.text(event.text, event.mode); break;
      case 'cancel': assistant.cancel(); assistant.wake.activate(); break;
      case 'sleep': assistant.sleep(); break;
      case 'clear': assistant.clear(); break;
      case 'targets': assistant.targets(); break;
      case 'latest': assistant.latest(); break;
      case 'historyPage': assistant.historyPage(event.before, event.query); break;
      case 'previewVoice': await assistant.previewVoice(); break;
      case 'activate': assistant.wake.activate(); assistant.state('listening', '请说，我在听'); break;
      case 'playbackEnded': assistant.playing = false; assistant.wake.activate(); assistant.state(assistant.listening ? 'listening' : 'idle', assistant.listening ? '可以继续说' : '播放结束'); break;
    }
  })().catch(error => emit({ type: 'error', message: error.message || '本机助理操作失败，请检查配置后再试' }));
});
setInterval(() => { assistant.tick(); reminder.tick(); }, 1000).unref();
input.on('close', () => { dictation.cancel(); taskStatus.close(); assistant.cancel(); assistant.memory.close(); process.exit(0); });
