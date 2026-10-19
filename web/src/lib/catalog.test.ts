import type { CardPool, Index } from './types';

const index: Index = {
  version: 1,
  lang: 'en',
  packs: [{ code: 'core', name: 'Core Set', file: 'core.json', position: 1 }],
  scenarios: [],
  sets: [],
};

const face = { name: 'Spider-Man', type: 'hero', size: 'std' as const, images: ['a.png', 'b.png'] };

const pool: CardPool = {
  version: 1,
  cards: [
    {
      code: '01001',
      faces: [face, { ...face, name: 'Peter Parker' }],
      back: 'player',
      quantity: 1,
      aliases: ['01001a', '01001b'],
    },
    // 01043d is both the canonical code of the next card and an alias of this one.
    { code: '01043', faces: [face], back: 'player', quantity: 3, aliases: ['01043a', '01043d'] },
    { code: '01043d', faces: [face], back: 'player', quantity: 1 },
  ],
};

const otherPool: CardPool = {
  version: 1,
  cards: [{ code: '01094', faces: [{ ...face, name: 'Rhino' }], back: 'villain', quantity: 1 }],
};

const API = 'https://api.example';

let fetchMock: ReturnType<typeof vi.fn>;

// A fresh module per test: the catalog memoises what it fetches.
async function loadCatalog() {
  vi.resetModules();
  return import('./catalog');
}

function responseFor(url: string): Response {
  const bodies: Record<string, object> = {
    '/packs/en/index.json': index,
    [`${API}/api/games/g1/cards`]: pool,
    [`${API}/api/games/g2/cards`]: otherPool,
  };
  const body = bodies[url];
  return body ? Response.json(body) : Response.json({ error: 'game not found' }, { status: 404 });
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', API);
  fetchMock = vi.fn((url: string) => Promise.resolve(responseFor(url)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('catalog', () => {
  it('memoises the index', async () => {
    const { loadIndex } = await loadCatalog();
    await loadIndex();
    await loadIndex();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/packs/en/index.json');
  });

  it('fetches the cards of a game from the API', async () => {
    const { loadGameCards } = await loadCatalog();
    await loadGameCards('g1');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${API}/api/games/g1/cards`);
  });

  it('knows nothing before the cards of a game are loaded', async () => {
    const { knownCard } = await loadCatalog();
    expect(knownCard('01001')).toBeNull();
  });

  it('registers canonical codes and aliases, with the face of an alias', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');

    expect(knownCard('01001')?.face).toBe(0);
    const back = knownCard('01001b');
    expect(back?.card.code).toBe('01001');
    expect(back?.face).toBe(1);
    expect(knownCard('99999')).toBeNull();
  });

  it('matches codes case-insensitively', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');
    expect(knownCard('01001B')?.face).toBe(1);
  });

  it('gives face 0 to the alias of a single-face card', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');

    const info = knownCard('01043a');
    expect(info?.card.code).toBe('01043');
    expect(info?.face).toBe(0);
  });

  it('lists each card of the pool once, aliases aside', async () => {
    const { gameCards, loadGameCards } = await loadCatalog();
    expect(gameCards()).toEqual([]);

    await loadGameCards('g1');

    expect(gameCards().map((card) => card.code)).toEqual(['01001', '01043', '01043d']);
  });

  it('lists only the cards of the last game loaded', async () => {
    const { gameCards, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');
    await loadGameCards('g2');
    expect(gameCards().map((card) => card.code)).toEqual(['01094']);
  });

  it('lets a canonical code win over the alias of another card', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');
    expect(knownCard('01043d')?.card.code).toBe('01043d');
  });

  it('shares one load between calls for the same game', async () => {
    const { loadGameCards } = await loadCatalog();
    await Promise.all([loadGameCards('g1'), loadGameCards('g1')]);
    await loadGameCards('g1');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries after a failure', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(loadGameCards('g1')).rejects.toThrow('offline');

    await loadGameCards('g1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(knownCard('01001')).not.toBeNull();
  });

  it('rejects on an error status', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await expect(loadGameCards('unknown')).rejects.toThrow('404');
    expect(knownCard('01001')).toBeNull();
  });

  it('starts over from an empty catalog for another game', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    await loadGameCards('g1');
    await loadGameCards('g2');

    expect(knownCard('01001')).toBeNull();
    expect(knownCard('01094')?.card.faces[0]?.name).toBe('Rhino');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a late answer for a game left in the meantime', async () => {
    const { knownCard, loadGameCards } = await loadCatalog();
    let answer: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    const first = loadGameCards('g1');
    await loadGameCards('g2');

    answer(responseFor(`${API}/api/games/g1/cards`));
    await first;
    expect(knownCard('01001')).toBeNull();
    expect(knownCard('01094')).not.toBeNull();
  });
});
