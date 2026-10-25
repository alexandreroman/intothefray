import { LANGS, OFFERED_LANGS, setLang, storedLang } from './lang';
import { getPref, setPref } from './prefs';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('lang', () => {
  it('is English by default', () => {
    expect(storedLang()).toBe('en');
  });

  it('stores the chosen language', () => {
    setLang('fr');
    expect(getPref('itf-lang')).toBe('fr');
  });

  it('reads English when it is stored', () => {
    setLang('en');
    expect(storedLang()).toBe('en');
  });

  it('falls back to English for an unknown stored value', () => {
    setPref('itf-lang', 'de');
    expect(storedLang()).toBe('en');
  });

  it('falls back to English for a stored language not offered, and keeps it stored', () => {
    setPref('itf-lang', 'fr');

    expect(storedLang()).toBe('en');
    expect(getPref('itf-lang')).toBe('fr');
  });

  it('knows English and French under their own names', () => {
    expect(LANGS.map(({ code, label }) => ({ code, label }))).toEqual([
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'Français' },
    ]);
  });

  it('offers English only', () => {
    expect(OFFERED_LANGS.map((lang) => lang.code)).toEqual(['en']);
  });

  it('survives a throwing storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('localStorage', broken);

    expect(storedLang()).toBe('en');
    expect(() => setLang('fr')).not.toThrow();
    expect(getPref('itf-lang')).toBe('fr');
  });
});
