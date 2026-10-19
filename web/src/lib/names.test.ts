import { ADJECTIVES, NOUNS, playerName, randomName } from './names';
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
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        const name = `${adjective} ${noun}`;
        expect(name.length).toBeLessThanOrEqual(24);
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

  it('returns the same name on a second call', () => {
    expect(playerName()).toBe(playerName());
  });
});
