import { getPref } from './prefs';

export type Theme = 'official' | 'minimal' | 'felt';

export const THEMES: readonly Theme[] = ['official', 'minimal', 'felt'];

function isTheme(value: string | null): value is Theme {
  return THEMES.some((theme) => theme === value);
}

export function storedTheme(): Theme {
  const stored = getPref('itf-theme');
  return isTheme(stored) ? stored : 'official';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
