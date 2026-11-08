import { clearPrefMemory, getPref, getToken, removePref, setPref, setToken } from './prefs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefs', () => {
  it('stores and reads a preference', () => {
    setPref('itf-name', 'Alex');
    expect(getPref('itf-name')).toBe('Alex');
    expect(getPref('itf-theme')).toBeNull();
  });

  it('survives a throwing storage and keeps values in memory', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('localStorage', broken);

    expect(getPref('itf-memory')).toBeNull();
    expect(getToken('mem-game')).toBeNull();
    expect(() => setPref('itf-memory', 'Alex')).not.toThrow();
    expect(() => setToken('mem-game', 'tok')).not.toThrow();
    expect(getPref('itf-memory')).toBe('Alex');
    expect(getToken('mem-game')).toBe('tok');
    expect(() => removePref('itf-memory')).not.toThrow();
    expect(getPref('itf-memory')).toBeNull();
  });

  it('removes a preference, from the storage and the memory', () => {
    setPref('itf-zoom', '1.5');
    removePref('itf-zoom');
    expect(getPref('itf-zoom')).toBeNull();
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('stores tokens per game', () => {
    setToken('g1', 'one');
    setToken('g2', 'two');
    expect(getToken('g1')).toBe('one');
    expect(getToken('g2')).toBe('two');
    expect(getToken('g3')).toBeNull();
  });

  it('keeps the tokens of the 50 games stored last, a game stored again counting as the newest', () => {
    for (let i = 0; i < 50; i++) {
      setToken(`game-${i}`, `token-${i}`);
    }
    // Stored again, the first game becomes the newest: the second one is now the oldest.
    setToken('game-0', 'token-0b');
    setToken('game-50', 'token-50');

    expect(getToken('game-1')).toBeNull();
    expect(getToken('game-0')).toBe('token-0b');
    expect(getToken('game-2')).toBe('token-2');
    expect(getToken('game-50')).toBe('token-50');
    const stored = JSON.parse(localStorage.getItem('itf-tokens') ?? '{}') as Record<string, string>;
    expect(Object.keys(stored)).toHaveLength(50);
    expect(Object.keys(stored).slice(-2)).toEqual(['game-0', 'game-50']);
  });

  it('ignores a corrupted token table', () => {
    localStorage.setItem('itf-tokens', '{not json');
    expect(getToken('g1')).toBeNull();
    setToken('g1', 'one');
    expect(getToken('g1')).toBe('one');
  });

  it('forgets the in-memory copies once cleared', () => {
    setPref('itf-name', 'Alex');
    localStorage.clear();
    expect(getPref('itf-name')).toBe('Alex');

    clearPrefMemory();
    expect(getPref('itf-name')).toBeNull();
  });
});
