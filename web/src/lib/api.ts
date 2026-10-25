/**
 * The base URL of the API, without trailing slashes. Empty (same origin) unless VITE_API_URL is set,
 * as it is for the cross-origin GitHub Pages build.
 */
export function apiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return (configured ?? '').replace(/\/+$/, '');
}

/** Fetches `url` and parses its JSON body. An error status rejects with the status code. */
export async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

/** Creates a game hosted by `name`. The token is the host's credential. */
export async function createGame(name: string): Promise<{ id: string; token: string }> {
  const response = await fetch(`${apiUrl()}/api/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await errorText(response));
  }
  return (await response.json()) as { id: string; token: string };
}

/** The server answers errors with {"error": "..."}. */
async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      return body.error;
    }
  } catch {
    // Not JSON: fall back on the status line.
  }
  return `Request failed (${response.status})`;
}

/**
 * The WebSocket endpoint of a game. Without an API URL it follows the page origin; otherwise it is
 * derived from the API URL (http -> ws, https -> wss).
 */
export function wsUrl(gameId: string): string {
  const configured = apiUrl();
  const base = configured
    ? configured.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return `${base}/ws/games/${encodeURIComponent(gameId)}`;
}
