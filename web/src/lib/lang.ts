import { getPref, setPref } from './prefs';

/** A language of the card data: card names and images. The interface stays in English. */
export type Lang = 'en' | 'fr';

export const LANGS: readonly { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const LANG_KEY = 'itf-lang';

export function isLang(value: string | null): value is Lang {
  return LANGS.some((lang) => lang.code === value);
}

/** The language chosen in Options, English when none or an unknown one is stored. */
export function storedLang(): Lang {
  const stored = getPref(LANG_KEY);
  return isLang(stored) ? stored : 'en';
}

export function setLang(lang: Lang): void {
  setPref(LANG_KEY, lang);
}
