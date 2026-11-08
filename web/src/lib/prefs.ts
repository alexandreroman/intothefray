// Every storage access can throw (private windows, blocked site data), and
// the app must work without storage. Values are also kept in memory, so
// they last for the page lifetime (a reconnection still finds its token).

const TOKENS_KEY = 'itf-tokens';
// The most games whose tokens a browser keeps.
const MAX_TOKENS = 50;

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

/** Forgets the in-memory copies; with localStorage cleared too, a test starts with no preference. Test-only. */
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

/**
 * Stores the token of a game, keeping only the MAX_TOKENS games stored last: a game expires after
 * 24 h, so the table would otherwise only grow. The table lists its games oldest first, and a game
 * stored again moves to the end. Its order is the order of the object's keys, which JSON keeps:
 * game ids are letters, never integer-like keys, which an object would sort first.
 */
export function setToken(gameId: string, token: string): void {
  const others = Object.entries(readTokens()).filter(([id]) => id !== gameId);
  const newest = [...others, [gameId, token]].slice(-MAX_TOKENS);
  setPref(TOKENS_KEY, JSON.stringify(Object.fromEntries(newest)));
}
