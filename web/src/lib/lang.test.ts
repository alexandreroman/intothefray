import { LANGS, setLang, storedLang } from './lang';
import { getPref, setPref } from './prefs';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('lang', () => {
  it('is English by default', () => {
    expect(storedLang()).toBe('en');
  });

  it('stores and reads the chosen language', () => {
    setLang('fr');

    expect(getPref('itf-lang')).toBe('fr');
    expect(storedLang()).toBe('fr');
  });

  it('falls back to English for an unknown stored value', () => {
    setPref('itf-lang', 'de');
    expect(storedLang()).toBe('en');
  });

  it('lists English and French under their own names', () => {
    expect(LANGS).toEqual([
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'Français' },
    ]);
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
    expect(storedLang()).toBe('fr');
  });
});
