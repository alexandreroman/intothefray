import { fold, matchesQuery } from './textFilter';

describe('fold', () => {
  it('drops accents, case and surrounding spaces', () => {
    expect(fold('  Écraser à la Bombe ')).toBe('ecraser a la bombe');
  });
});

describe('matchesQuery', () => {
  it('matches a name holding the query, whatever its case and accents', () => {
    expect(matchesQuery('ecraser', ['Écraser le Rhino'])).toBe(true);
    expect(matchesQuery('ÉCRASER', ['ecraser le rhino'])).toBe(true);
    expect(matchesQuery('rhino', ['Klaw'])).toBe(false);
  });

  it('matches when any of the names holds it: the shown one or the English one', () => {
    expect(matchesQuery('bomb scare', ['Alerte à la bombe', 'Bomb Scare'])).toBe(true);
  });

  it('matches every name with a blank query', () => {
    expect(matchesQuery('  ', ['Klaw'])).toBe(true);
  });
});
