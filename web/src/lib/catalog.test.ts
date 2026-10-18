import type { Index, PackFile } from './types';

const index: Index = {
  version: 1,
  lang: 'en',
  packs: [{ code: 'core', name: 'Core Set', file: 'core.json', position: 1 }],
  scenarios: [],
  sets: [],
};

const face = { name: 'Spider-Man', type: 'hero', size: 'std' as const, images: ['a.png', 'b.png'] };

const pack: PackFile = {
  code: 'core',
  name: 'Core Set',
  position: 1,
  sets: [],
  cards: [
    {
      code: '01001',
      faces: [face, { ...face, name: 'Peter Parker' }],
      back: 'player',
      quantity: 1,
      aliases: ['01001a', '01001b'],
    },
    { code: '01043', faces: [face], back: 'player', quantity: 3, aliases: ['01043a'] },
    { code: '01043d', faces: [face], back: 'player', quantity: 1 },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

// A fresh module per test: the catalog memoises what it fetches.
async function loadCatalog() {
  vi.resetModules();
  return import('./catalog');
}

beforeEach(() => {
  fetchMock = vi.fn((url: string) => {
    const body = url === 'packs/en/index.json' ? index : url === 'packs/en/core.json' ? pack : null;
    return Promise.resolve(body ? Response.json(body) : new Response('missing', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog', () => {
  it('memoises the index', async () => {
    const { loadIndex } = await loadCatalog();
    await loadIndex();
    await loadIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves aliases', async () => {
    const { cardByCode } = await loadCatalog();

    const back = await cardByCode('01001b');
    expect(back?.card.code).toBe('01001');
    expect(back?.face).toBe(1);
    expect(back?.pack).toBe('core');

    const distinct = await cardByCode('01043d');
    expect(distinct?.card.code).toBe('01043d');
    expect(distinct?.face).toBe(0);
  });

  it('matches codes case-insensitively', async () => {
    const { cardByCode } = await loadCatalog();
    expect((await cardByCode('01001B'))?.face).toBe(1);
  });

  it('gives face 0 to the alias of a single-face card', async () => {
    const { cardByCode } = await loadCatalog();
    const info = await cardByCode('01043a');
    expect(info?.card.code).toBe('01043');
    expect(info?.face).toBe(0);
  });

  it('returns null for an unknown code and fetches the packs once', async () => {
    const { cardByCode } = await loadCatalog();
    expect(await cardByCode('99999')).toBeNull();
    expect(await cardByCode('99998')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // index + one pack
  });

  it('lists the images of a face in order', async () => {
    const { imageUrls } = await loadCatalog();
    expect(imageUrls(face)).toEqual(['a.png', 'b.png']);
  });
});
