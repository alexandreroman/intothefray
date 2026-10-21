import { afterEach, describe, expect, it, vi } from 'vitest';
import { appCommit, commitUrl, fetchServerCommit, isCommit, shortCommit } from './version';

const SHA = '0123456789abcdef0123456789abcdef01234567';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('appCommit', () => {
  it('is "dev" when VITE_COMMIT is empty', () => {
    vi.stubEnv('VITE_COMMIT', '');
    expect(appCommit()).toBe('dev');
  });

  it('is the configured commit', () => {
    vi.stubEnv('VITE_COMMIT', SHA);
    expect(appCommit()).toBe(SHA);
  });
});

describe('fetchServerCommit', () => {
  it('reads the commit from the API', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ commit: SHA })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchServerCommit()).resolves.toBe(SHA);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/version');
  });

  it('fails on an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
    await expect(fetchServerCommit()).rejects.toThrow('502');
  });

  it('fails on a reply without a commit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(fetchServerCommit()).rejects.toThrow();
  });
});

describe('isCommit', () => {
  it('accepts a full SHA only', () => {
    expect(isCommit(SHA)).toBe(true);
    expect(isCommit('dev')).toBe(false);
    expect(isCommit(`${SHA}-dirty`)).toBe(false);
  });
});

describe('shortCommit', () => {
  it('keeps the first 7 characters of a full SHA', () => {
    expect(shortCommit(SHA)).toBe('0123456');
  });

  it('keeps any other value as is', () => {
    expect(shortCommit('dev')).toBe('dev');
  });
});

describe('commitUrl', () => {
  it('links a full SHA to its commit', () => {
    expect(commitUrl(SHA)).toBe(`https://github.com/alexandreroman/intothefray/commit/${SHA}`);
  });

  it('has no link for any other value', () => {
    expect(commitUrl('dev')).toBeUndefined();
  });
});
