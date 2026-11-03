import { formatNewsDate, NEWS } from './news';

describe('NEWS', () => {
  it('gives each entry an id made of its date and a slug', () => {
    for (const entry of NEWS) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.id.startsWith(`${entry.date}-`)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = NEWS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists the newest entry first', () => {
    const ids = NEWS.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it('writes a title and a text for every entry', () => {
    expect(NEWS.length).toBeGreaterThan(0);
    for (const entry of NEWS) {
      expect(entry.title.trim()).not.toBe('');
      expect(entry.text.trim()).not.toBe('');
      if (entry.image) {
        expect(entry.image.src).not.toBe('');
        expect(entry.image.alt.trim()).not.toBe('');
      }
    }
  });
});

describe('formatNewsDate', () => {
  it('spells out the day, the short month and the year', () => {
    expect(formatNewsDate('2026-11-01')).toBe('1 Nov 2026');
    expect(formatNewsDate('2026-09-30')).toBe('30 Sep 2026');
    expect(formatNewsDate('2027-01-15')).toBe('15 Jan 2027');
  });
});
