const DEFAULT_API_URL = 'http://localhost:9000';

function apiUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return (configured || DEFAULT_API_URL).replace(/\/+$/, '');
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

/** The WebSocket endpoint of a game, derived from the API URL (http -> ws, https -> wss). */
export function wsUrl(gameId: string): string {
  return `${apiUrl().replace(/^http/, 'ws')}/ws/games/${encodeURIComponent(gameId)}`;
}
