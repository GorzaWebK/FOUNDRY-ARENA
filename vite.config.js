import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version;

// Version stamp: the git commit this build was made from. Players compare it
// when joining a room, so an old tab can't join a newer host (or vice versa).
function buildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return 'dev-' + Date.now().toString(36);
  }
}

export default defineConfig({
  // relative asset paths, so the build works from any sub-path (e.g. GitHub Pages)
  base: './',
  server: { port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  define: {
    __BUILD__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __VERSION__: JSON.stringify(VERSION),
  },
});
