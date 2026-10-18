import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages sub-path.
  base: './',
  plugins: [svelte(), svelteTesting()],
  // A busy port must fail loudly: the backend only accepts this origin.
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
  },
});
