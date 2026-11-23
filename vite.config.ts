import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return 'nogit';
  }
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = `${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
const buildNo = process.env.GITHUB_RUN_NUMBER ?? 'local';
const label = `v${pkg.version}-build.${buildNo} ${gitSha()} ${stamp}`;

export default defineConfig({
  // Относительный base — пути к ассетам работают и на GitHub Pages (/Game_creating/), и локально.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_LABEL__: JSON.stringify(label),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
