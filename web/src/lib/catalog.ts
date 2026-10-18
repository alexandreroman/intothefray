import type { Index, PackCard, PackFace, PackFile } from './types';

export interface CardInfo {
  card: PackCard;
  face: number;
  pack: string;
}

const BASE = 'packs/en/';

// Same shape as the face codes of the Go catalog: five digits and a letter.
const FACE_CODE = /^\d{5}[a-z]$/;

let indexPromise: Promise<Index> | null = null;
let packsPromise: Promise<void> | null = null;
// Lower-cased code or alias to its card.
const cards = new Map<string, CardInfo>();

async function fetchJSON<T>(file: string): Promise<T> {
  const response = await fetch(BASE + file);
  if (!response.ok) {
    throw new Error(`fetch ${file}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function loadIndex(): Promise<Index> {
  indexPromise ??= fetchJSON<Index>('index.json').catch((error: unknown) => {
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

function register(file: PackFile): void {
  for (const card of file.cards) {
    const canonical = card.code.toLowerCase();
    cards.set(canonical, { card, face: 0, pack: file.code });
    for (const alias of card.aliases ?? []) {
      const key = alias.toLowerCase();
      // A canonical code always wins over another card's alias.
      if (!cards.has(key)) {
        cards.set(key, { card, face: aliasFace(key, card.faces.length), pack: file.code });
      }
    }
  }
}

async function loadAllPacks(): Promise<void> {
  const index = await loadIndex();
  const files = await Promise.all(index.packs.map((ref) => fetchJSON<PackFile>(ref.file)));
  files.forEach(register);
}

/** Resolves a canonical code or an alias, like pack.Catalog.Card. */
export async function cardByCode(code: string): Promise<CardInfo | null> {
  const key = code.toLowerCase();
  const known = cards.get(key);
  if (known) {
    return known;
  }
  packsPromise ??= loadAllPacks().catch((error: unknown) => {
    packsPromise = null; // let the next call retry
    throw error;
  });
  await packsPromise;
  return cards.get(key) ?? null;
}

export function imageUrls(face: PackFace): string[] {
  return face.images;
}
