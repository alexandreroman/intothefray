import { apiUrl, fetchJSON } from './api';

/** How many games are being played, from GET /api/stats: lobbies and ended games are not counted. */
export async function fetchGamesInProgress(): Promise<number> {
  const body = await fetchJSON<{ games?: unknown }>(`${apiUrl()}/api/stats`);
  const games = body.games;
  if (typeof games !== 'number' || !Number.isInteger(games) || games < 0) {
    throw new Error('No count of games in the reply');
  }
  return games;
}
