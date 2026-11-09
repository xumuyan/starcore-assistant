import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { assistantDefaults, validateSettings, explicitCodex, speechText, WakeSession } from './assistant-core.mjs';
import { ConversationMemory, handoffText } from './assistant-memory.mjs';
import { relayChat, polishSpeech } from './assistant-chat.mjs';
import { stateDir, events } from './store.mjs';
import { reminderSpeech } from './assistant-reminder.mjs';
import { latestTarget, saveRequest, requests } from './remote-store.mjs';
import { threadInfo, runExistingThread } from './codex-runner.mjs';
import {projectThread,selectedProject,isProjectQuestion,projectAnswer,projectContext} from './assistant-project.mjs';

export function listTargets(database = join(homedir(), '.codex/state_5.sqlite')) {
  if (!existsSync(database)) return [];
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return db.prepare('SELECT id,title,cwd,source FROM threads WHERE archived=0 ORDER BY updated_at DESC').all()
      .filter(r => !r.source.includes('subagent')).map(r => ({ id: r.id, title: r.title, project: basename(r.cwd) }));
  } finally { db.close(); }
}

function hasDiscussedPlan(context) {
  const user=context.filter(item=>item.role==='user').at(-1)?.content;
  const answer=context.filter(item=>item.role==='assistant').at(-1)?.content;
  // A project lookup or handoff acknowledgement is not a development plan.
  return !!(user && answer && !isProjectQuestion(user) &&
    !/^(?:已交给|你当前|当前使用|本地语音已能)/.test(answer) &&
    /方案|步骤|实现|修复|增加|保留|校验|修改/.test(answer));
}

export class AssistantService {
  constructor({ emit, fetchRequest = fetch, asr, dir = stateDir, submit = runExistingThread, getThread = threadInfo, getLatest = latestTarget, getProjectThread = projectThread } = {}) {
    this.emit = emit; this.fetch = fetchRequest; this.asr = asr; this.dir = dir; this.submit = submit;
    this.getThread = getThread; this.getLatest = getLatest; this.config = assistantDefaults; this.keys = {};
    this.getProjectThread=getProjectThread;
    this.wake = new WakeSession(); this.generation = 0; this.controller = null; this.busy = false;
    this.asrBusy = false; this.asrReady = false; this.history = []; this.listening = false; this.playing = false;
    this.root = join(dir, 'assistant'); mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.memory = new ConversationMemory(this.root);
    this.history = this.memory.context(40, 100000);
    for (const request of requests(this.dir).filter(r => r.source === 'mac-assistant' && typeof r.text === 'string')) saveRequest(request, this.dir);
  }
  state(name, detail) { this.emit({ type: 'state', name, detail }); }
  error(message) { this.emit({ type: 'error', message }); }
  record(role, content, source = 'chat') {
    this.memory.append(role, content, source); this.history = this.memory.context(40, 100000);
  }
  historyPage(before, query = '') {
    this.emit({ type: 'historyPage', messages: this.memory.page(Number.isSafeInteger(before) ? before : Number.MAX_SAFE_INTEGER, 50, String(query).slice(0,200)), query });
  }
  async configure(config, keys) {
    const next = validateSettings(config); const changedModel = next.modelPath !== this.config.modelPath;
    this.cancel(); this.wake.sleep(); this.config = next; this.keys = keys ?? {};
    if (changedModel) this.asrReady = false;
    this.emit({ type: 'configured', settings: this.config, hasGateway: !!this.keys.yunqiao, hasDeepSeek: !!this.keys.deepseek, hasFish: !!this.keys.fish });
    this.emit({ type: 'history', messages: this.history }); this.targets();
  }
  targets() {
    try { this.emit({ type: 'targets', targets: listTargets(), latestId: this.getLatest(this.dir)?.threadId ?? '' }); }
    catch { this.error('无法读取本机聊天列表，请确认 Codex 已启动'); }
  }
  async prepareASR() {
    if (this.asrReady) return;
    if (!existsSync(this.config.modelPath)) throw new Error('未找到本地模型，请在设置里选择 Qwen3 ASR GGUF 文件');
    this.state('loading', '正在加载 Qwen3 本地识别模型');
    const backend = await this.asr.load(this.config.modelPath);
    this.asrReady = true; this.emit({ type: 'asr', ready: true, backend });
  }
  cancel() {
    this.generation++; this.controller?.abort(); this.controller = null; this.busy = false; this.playing = false;
    this.emit({ type: 'stopAudio' }); this.state(this.listening ? 'armed' : 'idle', this.listening ? '等待唤醒词' : '语音监听未开启');
  }
  sleep() { this.cancel(); this.wake.sleep(); this.state(this.listening ? 'armed' : 'idle', '已结束连续对话'); }
  clear() { this.cancel(); this.wake.sleep(); this.memory.clear(); this.history = []; this.emit({ type: 'history', messages: [] }); }
  async audio(base64) {
    if (!this.listening || this.asrBusy || this.busy || this.playing) return;
    const generation = this.generation; this.asrBusy = true;
    try {
      await this.prepareASR();
      if (generation !== this.generation || !this.listening) return;
      this.state('transcribing', '正在本机识别语音');
      const text = await this.asr.transcribe(base64, this.config.wakeWord);
      if (generation !== this.generation || !this.listening) return;
      if (!text || text === 'None') { this.state('armed', '等待唤醒词'); return; }
      const accepted = this.wake.accept(text, this.config.wakeWord);
      if (!accepted) { this.state('armed', '等待唤醒词'); return; }
      if (!accepted.text) {
        this.state('listening', '我在，请说'); this.emit({ type: 'earcon' }); return;
      }
      await this.text(accepted.text, 'chat', { voice: true });
    } catch (error) {
      if (generation === this.generation) { this.error(error.message); this.state('error', '本地语音识别不可用'); }
    } finally { this.asrBusy = false; }
  }
  async text(text, mode = 'chat', source = {}) {
    text = String(text ?? '').trim();
    if (!text || text.length > 8000) { this.error('请输入 1–8000 个字'); return; }
    if (this.busy) { this.error('正在回复，可先点击「打断」再提交'); return; }
    this.playing = false; this.emit({ type: 'stopAudio' });
    if (/^(?:结束对话|休眠|退下吧)[。！!\s]*$/.test(text)) { this.sleep(); return; }
    const explicit = explicitCodex(text);
    if (mode === 'codex' || explicit !== null) { await this.codex(mode === 'codex' ? text : explicit); return; }
    const project=selectedProject({target:this.config.target,latest:()=>this.getLatest(this.dir),database:join(homedir(),'.codex/state_5.sqlite'),getThread:this.getProjectThread});
    this.emit({ type: 'message', role: 'user', content: text });
    this.record('user', text, source.voice ? 'voice' : 'chat');
    if(isProjectQuestion(text)){
      const content=projectAnswer(project,text);this.answer(content);
      const generation=++this.generation;this.busy=true;this.controller=new AbortController();
      try{await this.speak(content,generation);}finally{if(generation===this.generation){this.busy=false;this.controller=null;}}
      return;
    }
    if (!this.keys.yunqiao) {
      this.answer('本地语音已能识别。请打开设置，填写云桥 API Key 后，我就可以和你连续对话。也可以直接点击「交给 Codex」发送开发要求。', false); return;
    }
    const generation = ++this.generation; this.busy = true;
    this.controller = new AbortController(); this.state('thinking', '正在组织回复');
    const timeout = setTimeout(() => this.controller?.abort(), 60000);
    try {
      const context = this.memory.context();
      if (source.voice && this.config.polishEnabled && this.keys.deepseek && text.length > 5) {
        try {
          this.state('polishing', '可选的 DeepSeek 语音校对');
          const polished = await polishSpeech(this.fetch, this.config.polishModel, this.keys.deepseek, text,
            AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]));
          if (generation !== this.generation) return;
          context.at(-1).content = polished;
          this.emit({ type: 'polished', original: text, text: polished });
        } catch (error) {
          if (this.controller?.signal.aborted) throw error;
          this.emit({ type: 'notice', message: '本次润色未完成，直接使用识别原文；未重试' });
        }
      }
      this.state('thinking', '云桥聊天正在回复');
      const result = await relayChat(this.fetch, this.config, this.keys.yunqiao, [
        { role: 'system', content: `你是用户的 Mac 私人助理，名字是${this.config.name}。自然简洁地用中文交谈，默认三句话以内。当前时间${new Date().toLocaleString('zh-CN')}。用户的对话完整保存在本机，但本次只携带近期上下文；不知道的旧内容不要假装记得。可以讨论开发问题；实际改文件或跑命令请提示用户说“让 Codex”加具体要求，会连同相关讨论交给选定的原聊天。不得声称已执行未调用的工具，不得虚构电脑状态或联网结果。` }, {role:'system',content:projectContext(project)}, ...context
      ], this.controller.signal);
      const content = result.text;
      if (result.usage) this.emit({ type: 'usage', ...result.usage });
      if (generation !== this.generation) return;
      this.answer(content.trim());
      await this.speak(content, generation);
    } catch (error) {
      if (generation === this.generation) { this.error(error.name === 'AbortError' ? '对话已超时或取消' : error.message); this.state('error', '对话未完成'); }
    } finally { clearTimeout(timeout); if (generation === this.generation) { this.busy = false; this.controller = null; } }
  }
  answer(content, save = true) {
    this.emit({ type: 'message', role: 'assistant', content });
    if (save) this.record('assistant', content);
    this.wake.activate(); this.state(this.listening ? 'listening' : 'idle', this.listening ? '可以继续说，45 秒后回到待唤醒' : '回复已就绪');
  }
  async speak(content, generation, options = {}) {
    if (options.ignoreSpeakSwitch !== true && !this.config.speak) return;
    const text = speechText(content);
    if (this.config.voice === 'system') { this.playing = true; this.emit({ type: 'speak', text }); return; }
    if (!this.keys.fish) { this.error('Fish API Key 未配置，本次使用系统声音'); this.playing = true; this.emit({ type: 'speak', text }); return; }
    this.state('synthesizing', '正在生成 Fish Audio 语音');
    try {
      const response = await this.fetch('https://api.fish.audio/v1/tts', {
        method: 'POST', signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(45000)]),
        headers: { Authorization: `Bearer ${this.keys.fish}`, 'Content-Type': 'application/json', model: this.config.fishModel },
        body: JSON.stringify({ text, format: 'mp3', ...(this.config.voiceId ? { reference_id: this.config.voiceId } : {}) })
      });
      if (!response.ok) throw new Error(`Fish Audio 请求失败（HTTP ${response.status}）`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 20 * 1024 * 1024 || !data.length) throw new Error('语音响应大小异常');
      if (generation === this.generation) { this.playing = true; this.emit({ type: 'play', audio: data.toString('base64') }); }
    } catch (error) {
      if (generation === this.generation && error.name !== 'AbortError') { this.error(error.message + '，本次使用系统声音'); this.playing = true; this.emit({ type: 'speak', text }); }
    }
  }
  async previewVoice() {
    this.cancel(); const generation = this.generation; this.controller = new AbortController(); this.busy = true;
    try { await this.speak(`你好，我是${this.config.name}。随时，听你吩咐。`, generation); }
    finally { if (generation === this.generation) { this.busy = false; this.controller = null; } }
  }
  // Completion voice reminder. Independent of the chat reply switch: enabling the
  // reminder is itself an explicit opt-in. Never recorded into chat history, never
  // routed to Codex or WeChat; reuses the existing voice service and failover.
  reminderEnabled() { return this.config.codexVoiceReminder === true; }
  reminderBusy() { return !!(this.busy || this.asrBusy || this.playing); }
  reminderDropped(event) {
    const project = String(event?.project ?? '').trim() || '未命名项目';
    this.emit({ type: 'notice', message: `「${project}」的 Codex 完成提醒未播报：当时助理正忙，微信提醒不受影响` });
  }
  async announceReminder(event) {
    if (!event || typeof event.id !== 'string') return;
    const generation = ++this.generation;
    this.controller = new AbortController();
    const project = String(event.project ?? '').trim() || '未命名项目';
    this.emit({ type: 'codexReminder', project, threadId: typeof event.threadId === 'string' ? event.threadId : '', summary: String(event.summary ?? '').slice(0, 200) });
    try { await this.speak(reminderSpeech(event), generation, { ignoreSpeakSwitch: true }); }
    finally { if (generation === this.generation) this.controller = null; }
  }
  tick() {
    if (this.listening && !this.busy && !this.asrBusy && !this.playing && this.wake.until > 0 && Date.now() >= this.wake.until) {
      this.wake.sleep(); this.state('armed', '连续对话已结束，等待唤醒词');
    }
  }
  async codex(text) {
    if (!text) { this.error('请在「让 Codex」后面说出开发要求'); return; }
    // Resolve and freeze at receipt; a new reminder must not redirect this job.
    const threadId = this.config.target;
    if (!threadId) { this.error('请先选择一个原 Codex 聊天'); return; }
    let thread;
    try { thread = this.getThread(join(homedir(), '.codex/state_5.sqlite'), threadId); } catch {}
    if (!thread) { this.error('目标聊天不可用，请重新选择'); return; }
    let runtime;
    try { runtime = JSON.parse(readFileSync(join(this.dir, 'runtime-settings.json'), 'utf8')); } catch {}
    if (!runtime?.codex) { this.error('没有找到 Codex 本机接口配置'); return; }
    const context = this.memory.context(12, 10000);
    if (/^(?:刚才|上面|之前|这个|那个)/.test(text) && !hasDiscussedPlan(context)) { this.error('没有可引用的讨论，请先说明具体要求'); return; }
    const submittedText = handoffText(text, context);
    const jobId = randomUUID(); const id = createHash('sha256').update(jobId).digest('hex');
    const request = { id, clientUserMessageId: jobId, threadId, text: submittedText, userText: text, project: basename(thread.cwd), receivedAt: new Date().toISOString(), status: 'submitting', source: 'mac-assistant' };
    // Persist before submission: never leave an accepted but unrecorded job.
    saveRequest(request, this.dir); this.busy = true;
    this.record('user', text, 'codex');
    this.emit({ type: 'message', role: 'user', content: `→ Codex · ${request.project}\n${text}` });
    this.state('executing', `正在投递到 ${request.project}`);
    try {
      const result = await this.submit(runtime.codex, thread, submittedText, { clientUserMessageId: jobId });
      // The watcher may already have advanced the record to running/completed.
      const current = JSON.parse(readFileSync(join(this.dir, 'remote-requests', id + '.json'), 'utf8'));
      if (!['running', 'completed', 'failed'].includes(current.status)) saveRequest({ ...current, ...result }, this.dir);
      const message = result.status === 'submitted' ? `已交给 ${request.project} 的原聊天。Codex 会在该聊天继续，完成后仍通过微信提醒。` : result.detail || '投递结果未确认，不会自动重发。';
      this.record('assistant', message, 'codex');
      this.emit({ type: 'message', role: 'assistant', content: message });
      this.state(result.status === 'submitted' ? 'idle' : 'error', message);
    } catch {
      saveRequest({ ...request, status: 'uncertain', detail: '投递异常，结果未知，不自动重试' }, this.dir);
      this.error('投递结果未知，请先检查原聊天；未自动重发');
    } finally { this.busy = false; }
  }
  latest() {
    const event = events(this.dir).at(-1);
    this.emit({ type: 'message', role: 'assistant', content: event ? `${event.project}\n${event.summary}` : '还没有完成提醒。' });
  }
}
