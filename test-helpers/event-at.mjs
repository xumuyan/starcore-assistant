import { setTimeout as delay } from 'node:timers/promises';

// Test-only stdout snapshot helper. Waiting for row N does not prove row N+1
// arrived in the same chunk. Wait for the EXACT position; never skip a wrong
// intervening event to find a later matching one. Do not include payloads in errors.
export async function waitForEventAt(readEvents, index, { timeoutMs = 10000, pollMs = 25 } = {}) {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(timeoutMs) || timeoutMs < 0 ||
      !Number.isFinite(pollMs) || pollMs <= 0) throw new TypeError('invalid event wait options');
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const events = readEvents();
    if (events.length > index) return events[index];
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error(`等待第 ${index} 条事件超时（已有 ${events.length} 条）`);
    await delay(Math.min(pollMs, remaining));
  }
}
