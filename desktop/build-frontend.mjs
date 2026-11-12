import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const noticePackages = ['react', 'react-dom', 'scheduler', 'voice-ring', 'voice-glow', 'border-beam', 'thinking-orbs'];
export async function buildFrontend(outdir = resolve(root, 'dist/desktop-preview'), { probe = false } = {}) {
  await mkdir(outdir, { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: [probe ? 'desktop/frontend/probe.jsx' : 'desktop/frontend/preview.jsx'], outdir, bundle: true,
    format: 'iife', target: ['safari16', 'chrome109'], minify: true,
    define: { 'process.env.NODE_ENV': '"production"' }, metafile: true,
    legalComments: 'eof',
  });
  let html = await readFile(resolve(root, 'desktop/frontend/index.html'), 'utf8');
  if (probe) html = html.replace(/preview\.(js|css)/g, 'probe.$1').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, '');
  // Tauri injects the probe CSP from tauri.conf.json; the browser preview stays network-disabled.
  await writeFile(resolve(outdir, 'index.html'), html);
  const notices = await Promise.all([...noticePackages, ...(probe ? ['@tauri-apps/api'] : [])].map(async name => {
    const dir = resolve(root, 'node_modules', name);
    const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
    const license = await readFile(resolve(dir, name === '@tauri-apps/api' ? 'LICENSE-MIT' : 'LICENSE'), 'utf8');
    return `## ${name}@${pkg.version}\n\n${license}\n`;
  }));
  await writeFile(resolve(outdir, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const probe = process.argv.includes('--probe');
  await buildFrontend(probe ? resolve(root, 'dist/desktop-probe') : process.argv[2] ? resolve(process.argv[2]) : undefined, { probe });
  console.log(`DESKTOP_FRONTEND_BUILT (${probe ? 'T0 probe page' : 'browser visual preview'}; synthetic data, no microphone)`);
}
