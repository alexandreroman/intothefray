import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_FILES = ['vite.config.ts', 'eslint.config.js', 'seo.ts', 'seo.test.ts'];

export default defineConfig(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  prettierConfig,
  svelte.configs.prettier,
  // The config files and the build plugin run in Node, the app in the browser.
  {
    ignores: NODE_FILES,
    languageOptions: { globals: globals.browser },
  },
  {
    files: NODE_FILES,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
