import { homedir } from 'node:os';

export const assistantDefaults = Object.freeze({
  name: '贾维斯', wakeWord: '贾维斯', autoListen: false, speak: true,
  modelPath: homedir() + '/.speakmore/models/qwen3-asr-0.6b-q8/Qwen3-ASR-0.6B-Q8_0.gguf',
  schemaVersion: 2, chatModel: 'gpt-6-astra', chatBaseUrl: 'https://api.yunqiao.me/v1',
  dictationEnabled: false, dictationHotkey: 'right-option', dictationPolish: false,
  polishModel: 'deepseek-flash', polishEnabled: false, reducedMotion: false,
  voice: 'system', fishModel: 's2.1-pro-free', voiceId: '', target: ''
});
export function validateSettings(input = {}) {
  const value = { ...assistantDefaults };
  for (const field of ['name', 'wakeWord', 'modelPath', 'chatModel', 'chatBaseUrl', 'polishModel', 'voice', 'fishModel', 'voiceId', 'target']) {
    if (typeof input[field] === 'string') value[field] = input[field].trim();
  }
  if (!input.schemaVersion && /^deepseek/.test(value.chatModel)) {
    value.polishModel = value.chatModel; value.chatModel = assistantDefaults.chatModel;
  }
  value.chatBaseUrl = value.chatBaseUrl.replace(/\/+$/, '');
  if (value.chatBaseUrl !== 'https://api.yunqiao.me/v1') throw new Error('当前版本仅向所指定的云桥网关发送聊天密钥');
  if (!value.name || value.name.length > 30) throw new Error('名字请填写 1–30 个字');
  if (!value.wakeWord || value.wakeWord.length > 20 || !/[\p{L}\p{N}]/u.test(value.wakeWord)) throw new Error('唤醒词请填写 1–20 个字，不能只有标点');
  if (!value.modelPath.startsWith('/') || !value.modelPath.endsWith('.gguf')) throw new Error('请选择完整的 GGUF 模型路径');
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.chatModel)) throw new Error('对话模型名称无效');
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.polishModel)) throw new Error('润色模型名称无效');
  if (!['system', 'fish'].includes(value.voice)) throw new Error('语音服务无效');
  if (!['s2.1-pro-free', 's2.1-pro', 's2-pro'].includes(value.fishModel)) throw new Error('Fish 模型无效');
  if (value.voiceId && !/^[a-zA-Z0-9_-]{1,100}$/.test(value.voiceId)) throw new Error('音色 ID 无效');
  if (value.target && !/^[0-9a-f-]{36}$/i.test(value.target)) throw new Error('目标聊天无效');
  for (const field of ['autoListen', 'speak', 'polishEnabled', 'reducedMotion']) if (typeof input[field] === 'boolean') value[field] = input[field];
  for (const field of ['dictationEnabled', 'dictationPolish']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') throw new Error('听写开关必须为布尔值');
    if (typeof input[field] === 'boolean') value[field] = input[field];
  }
  if (input.dictationHotkey !== undefined) {
    if (!['right-option', 'f8', 'f9'].includes(input.dictationHotkey)) throw new Error('听写快捷键无效');
    value.dictationHotkey = input.dictationHotkey;
  }
  return value;
}

// Match the configured phrase only at the beginning, never an arbitrary mention
// inside a conversation heard in the room. Preserve the rest of the instruction.
export function extractWake(text, word) {
  const normalized = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  const needle = normalized(word);
  let prefix = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    prefix += chars[i];
    const current = normalized(prefix);
    if (current === needle) return chars.slice(i + 1).join('').replace(/^[\s\p{P}]+/u, '');
    if (!needle.startsWith(current)) return null;
  }
  return null;
}
export function explicitCodex(text) {
  const match = text.match(/^(?:请\s*)?(?:让|叫|交给|发给|发送给)\s*(?:codex|扣得克斯|代码助手)[，,:：\s]*(.*)$/is);
  return match ? match[1].trim() : null;
}
export function speechText(text) {
  return text.replace(/```[\s\S]*?```/g, '代码已显示在屏幕上。').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*#_`]/g, '').slice(0, 1000);
}

export class WakeSession {
  constructor(now = Date.now) { this.now = now; this.until = 0; }
  sleep() { this.until = 0; }
  activate() { this.until = this.now() + 45000; }
  accept(text, word) {
    const command = extractWake(text, word);
    if (command !== null) { this.activate(); return { wake: true, text: command }; }
    if (this.now() < this.until) { this.activate(); return { wake: false, text }; }
    return null;
  }
}
