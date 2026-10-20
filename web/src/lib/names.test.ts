import {
  ADJECTIVES,
  cleanName,
  MAX_NAME_LENGTH,
  NOUNS,
  playerName,
  randomName,
  savePlayerName,
  stripEmoji,
} from './names';
import { getPref, setPref } from './prefs';

afterEach(() => {
  localStorage.clear();
});

describe('randomName', () => {
  it('returns two Title Case words', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomName()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });

  it('picks the words with the given random source', () => {
    expect(randomName(() => 0)).toBe(`${ADJECTIVES[0]} ${NOUNS[0]}`);
    expect(randomName(() => 0.9999)).toBe(`${ADJECTIVES.at(-1)} ${NOUNS.at(-1)}`);
  });

  it('rejects a random source outside [0, 1)', () => {
    expect(() => randomName(() => 1)).toThrow(RangeError);
  });

  it('only builds names the server keeps whole', () => {
    expect(MAX_NAME_LENGTH).toBe(16);
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        const name = `${adjective} ${noun}`;
        expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(name).toMatch(/^[\x20-\x7e]+$/);
      }
    }
  });
});

describe('playerName', () => {
  it('returns the stored name, trimmed', () => {
    setPref('itf-name', '  Alex ');
    expect(playerName()).toBe('Alex');
  });

  it('generates and stores a name when none is stored', () => {
    const name = playerName();
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(getPref('itf-name')).toBe(name);
  });

  it('replaces a blank stored name', () => {
    setPref('itf-name', '   ');
    const name = playerName();
    expect(name.trim()).not.toBe('');
    expect(getPref('itf-name')).toBe(name);
  });

  it('cuts a stored name longer than the limit', () => {
    setPref('itf-name', 'Abcdefghijklmnopqrstuvwxyz');
    expect(playerName()).toBe('Abcdefghijklmnop');
  });

  it('strips emojis from a stored name', () => {
    setPref('itf-name', 'Alex 🔥');
    expect(playerName()).toBe('Alex');
  });

  it('replaces a stored name made of emojis only', () => {
    setPref('itf-name', '🔥🔥');
    const name = playerName();
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(getPref('itf-name')).toBe(name);
  });

  it('returns the same name on a second call', () => {
    expect(playerName()).toBe(playerName());
  });
});

describe('savePlayerName', () => {
  it('stores the name trimmed', () => {
    savePlayerName('  Alex ');
    expect(getPref('itf-name')).toBe('Alex');
    expect(playerName()).toBe('Alex');
  });

  it('stores the name cut to the limit', () => {
    savePlayerName('Abcdefghijklmnopqrstuvwxyz');
    expect(getPref('itf-name')).toBe('Abcdefghijklmnop');
  });
});

describe('stripEmoji', () => {
  it('removes emojis and keeps the spaces', () => {
    expect(stripEmoji('Brave 🔥')).toBe('Brave ');
    expect(stripEmoji('👨\u200d👩\u200d👧 Alex')).toBe(' Alex');
    expect(stripEmoji('Iron  Man')).toBe('Iron  Man');
  });
});

describe('cleanName', () => {
  it.each([
    ['a pictograph', 'Brave 🔥', 'Brave'],
    ['a joined family', '👨\u200d👩\u200d👧 Alex', 'Alex'],
    ['a flag', '🇫🇷Alex', 'Alex'],
    ['a skin tone', '👍🏽Alex', 'Alex'],
    ['a keycap', '1\ufe0f\u20e3', '1'],
  ])('strips %s', (_, name, want) => {
    expect(cleanName(name)).toBe(want);
  });

  it('keeps accented letters, other scripts and inner spaces', () => {
    expect(cleanName('Zoé')).toBe('Zoé');
    expect(cleanName('東京')).toBe('東京');
    expect(cleanName('Iron  Man')).toBe('Iron  Man');
  });

  it('does not count emojis toward the limit', () => {
    const sixteen = 'a'.repeat(MAX_NAME_LENGTH);
    expect(cleanName(`🔥${sixteen}🔥b`)).toBe(sixteen);
  });

  it('returns an empty name for emojis only', () => {
    expect(cleanName('🔥🔥')).toBe('');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(cleanName('é'.repeat(20))).toBe('é'.repeat(16));
    // A letter outside the Basic Multilingual Plane, made of two UTF-16 units.
    expect(Array.from(cleanName('𝒜'.repeat(20)))).toEqual(Array(16).fill('𝒜'));
  });

  it('drops the spaces left at the cut', () => {
    expect(cleanName('  Abcdefghijklmno pqr')).toBe('Abcdefghijklmno');
  });
});
