// Test helpers for the app's stylesheet: jsdom applies no stylesheet, so its rules themselves are checked.

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The app's stylesheet, read from the disk: Vitest hands a stylesheet over empty, even raw. */
export const tokensCss = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

/**
 * The declarations of a rule of tokens.css outside any media query, found by its selector, or its
 * last one: such a rule starts its line.
 */
export function tokensRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n${escaped} \\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? '';
}

/** The declarations of a rule's body, whatever their indent: `['color: red', …]`. */
export function declarations(body: string | undefined): string[] {
  return (body ?? '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== '');
}

/** Whether the page lays no tap highlight of the browser's, a square over the tapped element, anywhere. */
export function hasNoTapHighlight(): boolean {
  return tokensRule('html').includes('-webkit-tap-highlight-color: transparent;');
}
