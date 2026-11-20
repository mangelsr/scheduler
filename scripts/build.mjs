import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';

const rootDir = resolve(import.meta.dirname, '..');
const distDir = resolve(rootDir, 'dist');

async function main() {
  // 1. Build HTML extension pages (planner.html + popup.html) via Vite
  await viteBuild({
    configFile: resolve(rootDir, 'vite.config.ts'),
  });

  // 2. Bundle content script as standalone IIFE (required for MV3 content scripts)
  await esbuild({
    entryPoints: [resolve(rootDir, 'src/content/index.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome114',
    outfile: resolve(distDir, 'content.js'),
    sourcemap: false,
    minify: true,
  });

  // 3. Bundle background service worker as ESM
  await esbuild({
    entryPoints: [resolve(rootDir, 'src/background/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome114',
    outfile: resolve(distDir, 'background.js'),
    sourcemap: false,
    minify: true,
  });

  // 4. Copy content stylesheet (Vite already copies public/ into dist/)
  mkdirSync(distDir, { recursive: true });
  copyFileSync(resolve(rootDir, 'src/content/content.css'), resolve(distDir, 'content.css'));
  console.log('Extension build complete in dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
