import { fetchGamesInProgress } from './stats';

function replyWith(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchGamesInProgress', () => {
  it('reads the count of games from the API', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ games: 12 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchGamesInProgress()).resolves.toBe(12);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/stats');
  });

  it('accepts zero games', async () => {
    replyWith({ games: 0 });
    await expect(fetchGamesInProgress()).resolves.toBe(0);
  });

  it('fails on an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchGamesInProgress()).rejects.toThrow('503');
  });

  it.each([
    ['no count', {}],
    ['a text', { games: '12' }],
    ['a negative count', { games: -1 }],
    ['a fraction', { games: 1.5 }],
    ['null', { games: null }],
  ])('fails on a reply with %s', async (_, body) => {
    replyWith(body);
    await expect(fetchGamesInProgress()).rejects.toThrow();
  });
});
