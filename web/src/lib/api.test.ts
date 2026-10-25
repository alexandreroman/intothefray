import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, createGame, fetchJSON, wsUrl } from './api';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('apiUrl', () => {
  it('is empty when VITE_API_URL is unset or empty', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(apiUrl()).toBe('');
  });

  it('drops trailing slashes from the configured URL', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example//');
    expect(apiUrl()).toBe('https://api.example');
  });
});

describe('wsUrl', () => {
  it('uses the page origin when VITE_API_URL is unset', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(wsUrl('a b')).toBe(`ws://${location.host}/ws/games/a%20b`);
  });

  it('uses wss when the page is served over https', () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubGlobal('location', { protocol: 'https:', host: 'game.example' });
    expect(wsUrl('x')).toBe('wss://game.example/ws/games/x');
  });

  it('derives the scheme from the configured URL', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example/');
    expect(wsUrl('x')).toBe('wss://api.example/ws/games/x');
  });
});

describe('createGame', () => {
  it('calls a relative URL when VITE_API_URL is unset', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'g', token: 't' })));
    vi.stubGlobal('fetch', fetchMock);

    await createGame('Alex');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('fetchJSON', () => {
  it('parses the JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ commit: 'abc' }))),
    );

    await expect(fetchJSON('/api/version')).resolves.toEqual({ commit: 'abc' });
  });

  it('rejects with the status of an error answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    await expect(fetchJSON('/api/version')).rejects.toThrow('Request failed (503)');
  });
});
