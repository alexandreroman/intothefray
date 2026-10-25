import { getPref, setPref } from './prefs';

const THEME_KEY = 'itf-theme';

export type Theme = 'official' | 'minimal' | 'felt';

export const THEMES: readonly Theme[] = ['official', 'minimal', 'felt'];

function isTheme(value: string | null): value is Theme {
  return THEMES.some((theme) => theme === value);
}

export function storedTheme(): Theme {
  const stored = getPref(THEME_KEY);
  return isTheme(stored) ? stored : 'official';
}

export function saveTheme(theme: Theme): void {
  setPref(THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
