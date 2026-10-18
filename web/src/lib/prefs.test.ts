import { getPref, getToken, setPref, setToken } from './prefs';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('prefs', () => {
  it('stores and reads a preference', () => {
    setPref('itf-name', 'Alex');
    expect(getPref('itf-name')).toBe('Alex');
    expect(getPref('itf-theme')).toBeNull();
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

    expect(getPref('itf-name')).toBeNull();
    expect(() => setPref('itf-name', 'Alex')).not.toThrow();
    expect(getToken('g1')).toBeNull();
    expect(() => setToken('g1', 't')).not.toThrow();
  });

  it('stores tokens per game', () => {
    setToken('g1', 'one');
    setToken('g2', 'two');
    expect(getToken('g1')).toBe('one');
    expect(getToken('g2')).toBe('two');
    expect(getToken('g3')).toBeNull();
  });

  it('ignores a corrupted token table', () => {
    localStorage.setItem('itf-tokens', '{not json');
    expect(getToken('g1')).toBeNull();
    setToken('g1', 'one');
    expect(getToken('g1')).toBe('one');
  });
});
