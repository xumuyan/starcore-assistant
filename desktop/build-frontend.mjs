import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const noticePackages = ['react', 'react-dom', 'scheduler', 'voice-ring', 'voice-glow', 'border-beam', 'thinking-orbs'];
export async function buildFrontend(outdir = resolve(root, 'dist/desktop-preview')) {
  await mkdir(outdir, { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['desktop/frontend/preview.jsx'], outdir, bundle: true,
    format: 'iife', target: ['safari16', 'chrome109'], minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, metafile: true,
    legalComments: 'eof',
  });
  await copyFile(resolve(root, 'desktop/frontend/index.html'), resolve(outdir, 'index.html'));
  const notices = await Promise.all(noticePackages.map(async name => {
    const dir = resolve(root, 'node_modules', name);
    const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
    const license = await readFile(resolve(dir, 'LICENSE'), 'utf8');
    return `## ${name}@${pkg.version}\n\n${license}\n`;
  }));
  await writeFile(resolve(outdir, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildFrontend(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log('DESKTOP_FRONTEND_BUILT (visual preview only; no Tauri host or microphone)');
}
