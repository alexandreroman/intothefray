// Every storage access can throw (private windows, blocked site data), and
// the app must work without storage. Values are also kept in memory, so
// they last for the page lifetime (a reconnection still finds its token).

const TOKENS_KEY = 'itf-tokens';

const memory = new Map<string, string>();

export function getPref(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      return stored;
    }
  } catch {
    // Fall through to the in-memory copy.
  }
  return memory.get(key) ?? null;
}

export function setPref(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable: the value lasts for this page only.
  }
}

export function removePref(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is unavailable: only the in-memory copy was there.
  }
}

/** Forgets the in-memory copies, so that each test starts with no preference. Test-only. */
export function clearPrefMemory(): void {
  memory.clear();
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
