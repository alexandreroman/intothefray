// The view modes of the table. "All" shows the whole surface. "Villain +
// player" shows the villain's row and one player's row right under it: the
// rows are the setup's bands of the table (internal/game/setup.go), and the
// player's band is only drawn higher, never moved on the server. A RowMap
// turns a height of the table into where it is drawn, and back.

import { getPref, setPref } from '../lib/prefs';
import type { PileView } from '../lib/types';

/** The height of a row of the table, in table units: row r covers [330·r, 330·(r+1)). */
export const ROW_HEIGHT = 330;

export type ViewMode = 'all' | 'focus';

const VIEW_KEY = 'itf-view';

/** The stored view mode: "All" unless "Villain + player" was chosen. */
export function storedViewMode(): ViewMode {
  return getPref(VIEW_KEY) === 'focus' ? 'focus' : 'all';
}

export function saveViewMode(mode: ViewMode): void {
  setPref(VIEW_KEY, mode);
}

/** Where heights of the table are drawn, in table units. */
export interface RowMap {
  /** Where a height of the table is drawn, or null when its row is not shown. */
  toDisplay(y: number): number | null;
  /** The height of the table drawn at a height of the surface. */
  toTable(y: number): number;
}

/** "All": every height is drawn where it is. */
export const ALL_ROWS: RowMap = {
  toDisplay: (y) => y,
  toTable: (y) => y,
};

/** The row a height of the table is in; heights above the table count in the villain's row. */
export function rowOf(y: number): number {
  return Math.max(0, Math.floor(y / ROW_HEIGHT));
}

/**
 * "Villain + player": the villain's row (row 0) where it is, and the player's
 * row `row` drawn right under it. Anything drawn below the villain's row
 * belongs to the player's row: the last row of the table runs on downward,
 * so a card dropped below it stays with its player; any other row ends on
 * its last height, so that nothing drawn lands in the hidden row after it.
 */
export function focusRows(row: number, lastRow: number): RowMap {
  const shift = ROW_HEIGHT * (row - 1);
  const bottom = row === lastRow ? Infinity : ROW_HEIGHT * (row + 1) - 1;
  return {
    toDisplay(y) {
      const at = rowOf(y);
      if (at === 0) {
        return y;
      }
      const shown = at === row || (row === lastRow && at > row);
      return shown ? y - shift : null;
    },
    toTable(y) {
      return y < ROW_HEIGHT ? y : Math.min(y + shift, bottom);
    },
  };
}

/** The row of a seat: where its deck lies, or else the setup's row for that seat. */
export function rowOfSeat(piles: readonly PileView[], seat: number): number {
  const deck = piles.find((pile) => pile.kind === 'deck' && pile.owner === seat);
  return deck ? rowOf(deck.y) : seat + 1;
}

/** The lowest row any player's deck lies in. */
export function lastRow(piles: readonly PileView[]): number {
  const decks = piles.filter((pile) => pile.kind === 'deck');
  return Math.max(1, ...decks.map((deck) => rowOf(deck.y)));
}
