import type { DeckView } from './types';

/**
 * A player's deck slots as last shown, each with the key that follows it from view to view. The
 * view gives a slot no identity but its index, which shifts when an earlier slot is removed.
 */
export interface SlotKeys {
  decks: DeckView[];
  keys: number[];
  /** The next key to give: a key is never given twice, so a slot still closing never comes back. */
  next: number;
}

/** A removal of one of the viewer's slots, as they asked for it: the slot and their count then. */
export interface SlotRemoval {
  slot: number;
  from: number;
}

/**
 * The keys of a player's deck slots in a new view, from the slots last shown. A slot is added at
 * the end and removed at any index (the server's addDeck and removeDeck). The viewer's own removal
 * tells which slot went; otherwise the first slot that differs from the one shown before is the one
 * that went, which is right whenever the slots look different, and harmless when they look alike.
 */
export function nextSlotKeys(
  last: SlotKeys | undefined,
  decks: DeckView[],
  removal: SlotRemoval | null = null,
): SlotKeys {
  const keys = last ? [...last.keys] : [];
  let next = last?.next ?? 0;
  const removed = last ? last.decks.length - decks.length : 0;
  if (last && removed > 0) {
    const asked = removal !== null && removed === 1 && removal.from === last.decks.length;
    const start = asked ? removal.slot : firstChange(last.decks, decks);
    keys.splice(start, removed);
  }
  while (keys.length < decks.length) {
    keys.push(next);
    next += 1;
  }
  return { decks, keys, next };
}

/** The first index at which the shorter list of slots differs from the longer one, or its end. */
function firstChange(before: DeckView[], after: DeckView[]): number {
  const index = after.findIndex((deck, i) => signature(deck) !== signature(before[i]));
  return index === -1 ? after.length : index;
}

function signature(deck: DeckView | undefined): string {
  return JSON.stringify([deck?.hero, deck?.deckName, deck?.ready]);
}
