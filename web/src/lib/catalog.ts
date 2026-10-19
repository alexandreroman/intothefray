import { apiUrl } from './api';
import type { CardPool, Index, PackCard } from './types';

export interface CardInfo {
  card: PackCard;
  face: number;
}

// Absolute, so the index resolves the same from any route (/g/<id> included).
const INDEX_URL = `${import.meta.env.BASE_URL}packs/en/index.json`;

// Same shape as the face codes of the Go catalog: five digits and a letter.
const FACE_CODE = /^\d{5}[a-z]$/;

let indexPromise: Promise<Index> | null = null;
// The card pool of one game: later calls for the same game share its load.
let pool: { gameId: string; promise: Promise<void> } | null = null;
// Lower-cased code or alias to its card.
const cards = new Map<string, CardInfo>();

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function loadIndex(): Promise<Index> {
  indexPromise ??= fetchJSON<Index>(INDEX_URL).catch((error: unknown) => {
    indexPromise = null; // let the next call retry
    throw error;
  });
  return indexPromise;
}

/** Mirrors aliasFace in internal/pack/catalog.go. */
function aliasFace(alias: string, faceCount: number): number {
  if (faceCount === 1 || !FACE_CODE.test(alias)) {
    return 0;
  }
  return alias.charCodeAt(alias.length - 1) - 'a'.charCodeAt(0);
}

function register(poolCards: PackCard[]): void {
  for (const card of poolCards) {
    cards.set(card.code.toLowerCase(), { card, face: 0 });
    for (const alias of card.aliases ?? []) {
      const key = alias.toLowerCase();
      // A canonical code always wins over another card's alias.
      if (!cards.has(key)) {
        cards.set(key, { card, face: aliasFace(key, card.faces.length) });
      }
    }
  }
}

/**
 * Loads the cards of a started game. Later calls for the same game share the same load, a failure
 * lets the next call retry, and another game id starts over from an empty catalog.
 */
export function loadGameCards(gameId: string): Promise<void> {
  if (pool?.gameId === gameId) {
    return pool.promise;
  }
  cards.clear();
  const url = `${apiUrl()}/api/games/${encodeURIComponent(gameId)}/cards`;
  const promise = fetchJSON<CardPool>(url).then(
    (body) => {
      // A late answer for a game left in the meantime must not fill the current catalog.
      if (pool?.promise === promise) {
        register(body.cards);
      }
    },
    (error: unknown) => {
      if (pool?.promise === promise) {
        pool = null; // let the next call retry
      }
      throw error;
    },
  );
  pool = { gameId, promise };
  return promise;
}

/** Resolves a canonical code or an alias, like pack.Catalog.Card, from the cards already loaded. */
export function knownCard(code: string): CardInfo | null {
  return cards.get(code.toLowerCase()) ?? null;
}
