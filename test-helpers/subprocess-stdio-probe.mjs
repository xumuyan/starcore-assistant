// Explicit manual diagnostic only. Never imported by product code or used to
// replace regression calls. Both modes execute only /usr/bin/true.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function probeStdio({ fd, iterations = 3, execute = spawnSync, now = () => performance.now() } = {}) {
  if (!Number.isSafeInteger(fd) || fd < 3 || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 5) {
    throw new TypeError('invalid stdio probe options');
  }
  const records = [];
  for (let index = 0; index < iterations; index++) {
    for (const mode of ['default-pipes', 'regular-file-fds']) {
      const start = now();
      const result = execute('/usr/bin/true', [], {
        timeout: 15000, ...(mode === 'regular-file-fds' ? { stdio: [fd, fd, fd] } : {}),
      });
      records.push(Object.freeze({ mode, index, elapsedMs: Math.max(0, Math.round(now() - start)),
        status: Number.isSafeInteger(result.status) ? result.status : null,
        code: ['ETIMEDOUT', 'ENOENT', 'EACCES', 'ENOBUFS'].includes(result.error?.code) ? result.error.code : null,
        failed: result.status !== 0 || result.error != null,
      }));
    }
  }
  return Object.freeze(records);
}

// Importing this module does not open files or launch subprocesses. Explicit
// --run creates only its own temporary file; no /dev/null workaround in product.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.error('Explicit manual diagnostic: node test-helpers/subprocess-stdio-probe.mjs --run');
    process.exitCode = 2;
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'moss-stdio-probe-'));
    let fd;
    try {
      fd = openSync(join(directory, 'fixture'), 'w+');
      const records = probeStdio({ fd });
      for (const record of records) console.log(JSON.stringify(record));
      if (records.some(record => record.failed)) process.exitCode = 1;
    } finally {
      try { if (fd !== undefined) closeSync(fd); }
      finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }
}
