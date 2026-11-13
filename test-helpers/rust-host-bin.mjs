import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

// Several test files run `cargo build` in rust-host concurrently (node --test
// runs files in parallel). While one build relinks target/debug/moss-host the
// binary can be transiently missing, so a concurrent spawn hits ENOENT. Wait
// for the relink instead of racing it.
export async function ensureHostBinary(host, ms = 90000) {
  const deadline = Date.now() + ms;
  while (!existsSync(host)) {
    if (Date.now() >= deadline) {
      throw new Error(`rust-host 二进制缺失：${host}`);
    }
    await delay(200);
  }
}
