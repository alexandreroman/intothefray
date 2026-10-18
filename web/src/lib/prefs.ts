// Every storage access can throw (private windows, blocked site data), and
// the app must work without storage.

const TOKENS_KEY = 'itf-tokens';

export function getPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable: the preference lasts for this page only.
  }
}

function readTokens(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(getPref(TOKENS_KEY) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Corrupted value: start over with an empty table.
  }
  return {};
}

export function getToken(gameId: string): string | null {
  return readTokens()[gameId] ?? null;
}

export function setToken(gameId: string, token: string): void {
  setPref(TOKENS_KEY, JSON.stringify({ ...readTokens(), [gameId]: token }));
}
