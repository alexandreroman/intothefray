import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { DEFAULT_SITE_URL, seo } from './seo';

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

/**
 * Publishes the index of the generated card packs as packs/index.json, a static file the app
 * fetches: localized names live inside it. The cards of a game come from the API, so the pack
 * files themselves stay out. The index is watched, so a watch build picks up regenerated packs
 * (make packs).
 */
function packIndex(): Plugin {
  const source = path.resolve(import.meta.dirname, '../packs/dist/index.json');
  return {
    name: 'pack-index',
    apply: 'build',
    buildStart() {
      if (!fs.existsSync(source)) {
        this.error(`index not found: ${source} (run "make packs")`);
      }
      this.addWatchFile(source);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'packs/index.json',
        source: fs.readFileSync(source),
      });
    },
  };
}

export default defineConfig({
  // The base stays absolute (Vite's default '/', never './'): routes are real paths (/about, /g/), so
  // assets must not resolve against them. The GitHub Pages build passes its sub-path with --base.
  // Besides the VITE_* variables, expose the instance name shown in the tab title (see lib/title.ts).
  envPrefix: ['VITE_', 'APP_INSTANCE'],
  // SITE_URL makes the share previews' URLs absolute; CI passes the GitHub Pages site URL.
  plugins: [svelte(), svelteTesting(), packIndex(), seo(process.env.SITE_URL || DEFAULT_SITE_URL)],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
