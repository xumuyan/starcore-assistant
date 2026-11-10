// 沐言思考光球：thinking-orbs 引擎（MIT，© Jakub Antalik）的 vanilla 封装。
// 引擎输出纯几何帧（dots/lines），本模块负责 rAF 驱动、状态映射与灰玫主题着色。
import { MODE_FRAMES, resolvePreset, paintFrame } from 'thinking-orbs/engine';

const TINT_LIGHT = { r: 0xa0, g: 0x78, b: 0x82 }; // 灰玫（亮底墨色）
const TINT_DARK = { r: 0xe2, g: 0xc3, b: 0xcc };  // 亮灰玫（暗底墨色，提亮保证对比）

// assistant-state → OrbState 映射；speaking 交给核心动画，光球隐藏
const STATE_MAP = {
  idle: 'breathing',
  listening: 'listening',
  thinking: 'working',
  synthesizing: 'composing',
  executing: 'solving',
};

export function createThinkingOrb(canvas, { size = 64, speedMul = 1.35 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  let state = 'idle';
  let dark = document.body.classList.contains('reduce-motion') ? false :
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  let paused = false;
  let visible = true;
  let time = 0;
  let last = performance.now();
  let raf = 0;

  function drawFrame() {
    const orbState = STATE_MAP[state] || 'breathing';
    const { mode, speed, opts } = resolvePreset(orbState, size === 20 ? 20 : 64);
    // 尺寸档位：引擎只手工调校 64/32/20；20 用 inline 档，其余用 64 档
    const frame = MODE_FRAMES[mode](size, time * speed * speedMul, opts);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    paintFrame(ctx, frame, dark, dark ? TINT_DARK : TINT_LIGHT);
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused && visible && !document.hidden) time += dt;
    drawFrame();
    if (!paused && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function ensureLoop() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop(); else if (!paused) ensureLoop();
  });

  ensureLoop(); // 初始即进入绘制循环（默认 idle 呼吸，非暂停态）

  return {
    setState(next) { if (STATE_MAP[next] && next !== state) { state = next; ensureLoop(); } },
    setDark(next) { dark = !!next; ensureLoop(); },
    setPaused(next) {
      paused = !!next;
      if (paused) stopLoop(); else ensureLoop();
      drawFrame(); // 暂停时保持当前帧静置
    },
    setActive(next) {
      visible = !!next;
      if (visible) ensureLoop(); else stopLoop();
    },
    refresh() { drawFrame(); },
  };
}

export default { createThinkingOrb };
