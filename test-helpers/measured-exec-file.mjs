// Test-only failure context. No retries, timeout changes or argument/output logs.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export function createMeasuredExecFileSync({ execute = execFileSync, now = () => performance.now() } = {}) {
  return function measuredExecFileSync(file, args, options) {
    const start = now();
    try { return execute(file, args, options); }
    catch (error) {
      // Preserve the original thrown value, code, status, signal and cause.
      // Never inspect args, env, input, stdout or stderr for this annotation.
      try {
        if (error instanceof Error && Object.isExtensible(error)) {
          const name = typeof file === 'string' ? basename(file) : '';
          const diagnostic = Object.freeze({
            executable: ['node', 'cargo', 'moss-host'].includes(name) ? name : 'subprocess',
            elapsedMs: Math.max(0, Math.round(now() - start)),
            timeoutMs: Number.isSafeInteger(options?.timeout) && options.timeout >= 0 ? options.timeout : null,
            code: ['ETIMEDOUT', 'ENOENT', 'EACCES', 'ENOBUFS'].includes(error.code) ? error.code : null,
            status: Number.isSafeInteger(error.status) ? error.status : null,
            signal: typeof error.signal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(error.signal) ? error.signal : null,
        });
        error.executionDiagnostic = diagnostic;
        const line = `test subprocess diagnostic: ${JSON.stringify(diagnostic)}`;
        error.message += `\n${line}`;
        if (typeof error.stack === 'string') error.stack += `\n${line}`;
        }
      } catch { /* Diagnostics must never replace the original failure. */ }
      throw error;
    }
  };
}
export const measuredExecFileSync = createMeasuredExecFileSync();
