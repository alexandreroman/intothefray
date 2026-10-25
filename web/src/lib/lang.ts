import { getPref, setPref } from './prefs';

/** A language of the card data: card names and images. The interface stays in English. */
export type Lang = 'en' | 'fr';

/** Every language of the card data; Options offers only those marked `offered`. */
export const LANGS: readonly { code: Lang; label: string; offered: boolean }[] = [
  { code: 'en', label: 'English', offered: true },
  // Not offered: mc4db answers every French image URL with a placeholder picture. Its data and code
  // stay in place, so setting `offered` to true is all it takes to offer French again.
  { code: 'fr', label: 'Français', offered: false },
];

/** The languages a player can choose in Options. */
export const OFFERED_LANGS = LANGS.filter((lang) => lang.offered);

const LANG_KEY = 'itf-lang';

export function isLang(value: string | null): value is Lang {
  return LANGS.some((lang) => lang.code === value);
}

function isOffered(lang: Lang): boolean {
  return OFFERED_LANGS.some((offered) => offered.code === lang);
}

/** The language chosen in Options, English when none, an unknown one or one not offered is stored. */
export function storedLang(): Lang {
  const stored = getPref(LANG_KEY);
  return isLang(stored) && isOffered(stored) ? stored : 'en';
}

export function setLang(lang: Lang): void {
  setPref(LANG_KEY, lang);
}
