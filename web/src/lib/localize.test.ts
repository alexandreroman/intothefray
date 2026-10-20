import { localizedFace, localizedName } from './localize';
import type { PackFace } from './types';

function face(extra: Partial<PackFace> = {}): PackFace {
  return {
    name: 'Spider-Man',
    subname: 'Peter Parker',
    type: 'hero',
    size: 'std',
    images: ['en.jpg', 'en-cdb.png'],
    ...extra,
  };
}

describe('localizedFace', () => {
  it('overrides the name and subname, and tries the localized images first', () => {
    const spider = face({
      localized: { fr: { name: 'Spider-Man FR', subname: 'Peter FR', images: ['fr.webp'] } },
    });

    expect(localizedFace(spider, 'fr')).toMatchObject({
      name: 'Spider-Man FR',
      subname: 'Peter FR',
      type: 'hero',
      size: 'std',
      images: ['fr.webp', 'en.jpg', 'en-cdb.png'],
    });
  });

  it('keeps the English fields the language does not override', () => {
    const imagesOnly = face({ localized: { fr: { images: ['fr.webp'] } } });
    const nameOnly = face({ localized: { fr: { name: 'Araignée' } } });

    expect(localizedFace(imagesOnly, 'fr')).toMatchObject({
      name: 'Spider-Man',
      subname: 'Peter Parker',
      images: ['fr.webp', 'en.jpg', 'en-cdb.png'],
    });
    expect(localizedFace(nameOnly, 'fr')).toMatchObject({
      name: 'Araignée',
      images: ['en.jpg', 'en-cdb.png'],
    });
  });

  it('is the face itself in English or without an override', () => {
    const localized = face({ localized: { fr: { name: 'Araignée' } } });
    const english = face();

    expect(localizedFace(localized, 'en')).toBe(localized);
    expect(localizedFace(english, 'fr')).toBe(english);
  });

  it('gives the same face and images array on every call', () => {
    const spider = face({ localized: { fr: { images: ['fr.webp'] } } });

    const first = localizedFace(spider, 'fr');
    const second = localizedFace(spider, 'fr');

    expect(second).toBe(first);
    expect(second.images).toBe(first.images);
  });

  it('leaves the English face untouched', () => {
    const spider = face({ localized: { fr: { name: 'Araignée', images: ['fr.webp'] } } });

    localizedFace(spider, 'fr');

    expect(spider.name).toBe('Spider-Man');
    expect(spider.images).toEqual(['en.jpg', 'en-cdb.png']);
  });
});

describe('localizedName', () => {
  it('is the localized name when there is one, else the English one', () => {
    const core = { name: 'Core Set', localized: { fr: { name: 'Boîte de base' } } };

    expect(localizedName(core, 'fr')).toBe('Boîte de base');
    expect(localizedName(core, 'en')).toBe('Core Set');
    expect(localizedName({ name: 'Bomb Scare' }, 'fr')).toBe('Bomb Scare');
  });
});
