import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

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
