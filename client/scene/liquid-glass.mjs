// 沐言 · 苹果液态玻璃折射效果入口（SC-20261110-001）。
//
// 基于 apple-liquid-glass-webgl (MIT, 零依赖)：对选定 DOM 表面用 WebGL2
// 真实折射背后的页面内容（three.js 场景、渐变背景、文字），替代平面模糊。
// - 设置关闭 / 减少动态效果 / 环境无 WebGL2 → 不启用，保持 glass.css 原外观。
// - 库的帧循环在页面静止时完全休眠，不耗电。
// - 元素会打上 data-liquid-glass="webgl"，glass.css 据此去掉原 backdrop-filter
//   避免双重渲染；若库回退到 fallback 模式则销毁实例，继续用原有 CSS 外观。
import { LiquidGlass } from 'apple-liquid-glass-webgl';

// 玻璃表面清单：设置面板、底部控制条、右侧辅助卡片（当前单页助理布局的玻璃表面）。
const SELECTORS = ['#settings-overlay', '.controls .control-strip', '.companion-cards .side-card'];

let instances = [];

export function enableGlass() {
  if (!LiquidGlass.isSupported()) return false;
  disableGlass();
  for (const selector of SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      const glass = new LiquidGlass(element, { material: 'regular' });
      glass.ready.then(() => { if (glass.mode !== 'webgl') glass.destroy(); }).catch(() => glass.destroy());
      instances.push(glass);
    }
  }
  return instances.length > 0;
}

export function disableGlass() {
  for (const glass of instances) { try { glass.destroy(); } catch { /* 已销毁即可忽略 */ } }
  instances = [];
}

// 打开设置时表面从 hidden 变为可见，通知库重新测量。
export function refreshGlass() { LiquidGlass.refreshAll(); }

export const glassSupported = () => LiquidGlass.isSupported();

window.MuYanGlass = { enableGlass, disableGlass, refreshGlass, glassSupported };
