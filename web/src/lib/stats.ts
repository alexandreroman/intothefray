import { apiUrl, fetchJSON } from './api';

/** How many games are in progress, from GET /api/stats: every game that has not expired yet. */
export async function fetchGamesInProgress(): Promise<number> {
  const body = await fetchJSON<{ games?: unknown }>(`${apiUrl()}/api/stats`);
  const games = body.games;
  if (typeof games !== 'number' || !Number.isInteger(games) || games < 0) {
    throw new Error('No count of games in the reply');
  }
  return games;
}
