import { execFileSync } from 'node:child_process';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

/** The Git revision of the checkout, with "-dirty" when it has changes (like Go's VCS stamp), or undefined. */
function gitCommit(): string | undefined {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  try {
    const revision = git('rev-parse', 'HEAD').trim();
    const dirty = git('status', '--porcelain').trim() !== '';
    return dirty ? `${revision}-dirty` : revision;
  } catch {
    return undefined; // No Git: the app reports "dev".
  }
}

// Local builds report their checkout, as the server does; CI passes VITE_COMMIT, which wins.
// Tests stub VITE_COMMIT themselves, so they skip the lookup.
if (!process.env.VITE_COMMIT && !process.env.VITEST) {
  const commit = gitCommit();
  if (commit) {
    process.env.VITE_COMMIT = commit;
  }
}

export default defineConfig({
  // Absolute base: routes are real paths (/g/<id>), so assets must not resolve
  // against them. The GitHub Pages build passes its sub-path with --base.
  base: '/',
  // Besides the VITE_* variables, expose the instance name shown in the tab title (see lib/title.ts).
  envPrefix: ['VITE_', 'APP_INSTANCE'],
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
