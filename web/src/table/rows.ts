// The view modes of the table. "All" shows the whole surface. "Villain +
// player" shows the villain's row and one player's row right under it. The
// rows are the setup's bands of the table (internal/game/setup.go), never
// moved on the server; the screen only draws them spread over its height,
// each row's empty band squeezed or stretched (spreadRows), and in "Villain +
// player" the shown player's row right under the villain's. A RowMap turns a
// height of the table into where it is drawn, and back; a TableMap does so with
// a whole point, which dock mode also moves across (dockLayout.ts).

import { getPref, setPref } from '../lib/prefs';
import type { PileView, Point } from '../lib/types';
import { GRID } from './layout';

/**
 * The height of the villain's row, in table units: it covers [0, 440), leaving
 * room for a row of cards between its cards and the first player's row. It
 * mirrors villainRowHeight in internal/game/setup.go.
 */
export const VILLAIN_ROW_HEIGHT = 440;

/** The height of a player's row, in table units: row r ≥ 1 covers [440 + 220·(r−1), 440 + 220·r). */
export const ROW_HEIGHT = 220;

/**
 * How far below the top of its row the setup lays a row's cards and piles, in
 * table units: the owner's name lies above them. It mirrors rowContentY in
 * internal/game/setup.go.
 */
export const ROW_LABEL_ROOM = 30;

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

/** Every height drawn where it is: the default of the components that draw the table, and of tests. */
export const ALL_ROWS: RowMap = {
  toDisplay: (y) => y,
  toTable: (y) => y,
};

/**
 * Where points of the table are drawn, in drawn units of the surface, and
 * back: the one map every layer that draws the table or reads a point of it
 * goes through. Rows drawn spread (tableMapOf) move heights only; dock mode
 * (dockLayout.ts) scales the table and wraps its rows.
 */
export interface TableMap {
  /**
   * Where a point of the table is drawn, or null when it is not shown. A
   * point of an item, named by its id, is drawn with that item.
   */
  toDisplay(p: Point, itemId?: string): Point | null;
  /** The point of the table drawn at a point of the surface. */
  toTable(p: Point): Point;
  /**
   * Dock mode only (dockLayout.ts): where a card `width` table units wide,
   * dropped with its middle drawn at `p`, goes among the units of its row,
   * those of `exclude` left out.
   */
  insertAt?(p: Point, width: number, exclude?: ReadonlySet<string>): Point;
}

/** The map of rows drawn where `rows` draws their heights, every width drawn as it is. */
export function tableMapOf(rows: RowMap): TableMap {
  return {
    toDisplay(p) {
      const y = rows.toDisplay(p.y);
      return y === null ? null : { x: p.x, y };
    },
    toTable: (p) => ({ x: p.x, y: rows.toTable(p.y) }),
  };
}

/** Every point drawn where it is: the default of the components that draw the table, and of tests. */
export const ALL_TABLE: TableMap = tableMapOf(ALL_ROWS);

/** The height of the top of a row of the table. */
export function rowTop(row: number): number {
  return row === 0 ? 0 : VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (row - 1);
}

/** The height of a row of the table, in table units. */
export function rowHeight(row: number): number {
  return row === 0 ? VILLAIN_ROW_HEIGHT : ROW_HEIGHT;
}

/** The row a height of the table is in; heights above the table count in the villain's row. */
export function rowOf(y: number): number {
  if (y < VILLAIN_ROW_HEIGHT) {
    return 0;
  }
  return 1 + Math.floor((y - VILLAIN_ROW_HEIGHT) / ROW_HEIGHT);
}

// The drawn height of a player's row stays between these, in table units: never closer than the
// table's own rows, never further apart than the villain's row.
const MIN_PITCH = ROW_HEIGHT;
const MAX_PITCH = VILLAIN_ROW_HEIGHT;

// The villain's row is never drawn less high than this, in table units: its active counter, whose
// top lies at 210, ends at 280, and player 1's identity is drawn 30 below the top of its row.
const MIN_VILLAIN_PITCH = 270;

// The top part of a row that is drawn as it is, in table units: a player's row, down to the bottom
// of its cards (30 below its top, 157 high, up to the grid); the villain's row, down to the active
// counter's top. What lies below, an empty band, is drawn squeezed or stretched to the row's drawn
// height.
const ROW_CONTENT = 190;
const VILLAIN_CONTENT = 210;

/**
 * The drawn height of a player's row, in table units, for `available` px of
 * visible height, with players' rows down to `lastRow`: the villain's row and
 * two players' rows fill it, that is two pitches and the last row's own band
 * (its cards and the room under them). The same pitch spaces every player's
 * row, a third or a fourth deck's too, on the grid: a multiple of `step`, the
 * 10-unit GRID unless given. With a single deck, the villain's row and its one
 * player's row fill it: the one pitch, which the villain's row is drawn as
 * high as (villainPitch), takes all the height above the player's band.
 * Computed at zoom 1: zooming out shows more of the table, it does not spread
 * its rows.
 *
 * The villain's row is drawn at least `minVillain` high (villainPitch). A
 * tablet passes VILLAIN_ROW_HEIGHT: a row of cards then fits between the
 * villain's cards and the first player's row, where a finger lays them, and a
 * window short of height scrolls. It also passes its coarser grid's step
 * (grid.ts): every row is then drawn on the lines its drops snap to and its
 * dots lie on.
 */
export function rowPitch(
  available: number,
  lastRow: number,
  minVillain = MIN_VILLAIN_PITCH,
  step = GRID,
): number {
  // A third or a fourth deck's row is drawn below the screen's height, a pitch apart.
  const fittedRows = lastRow === 1 ? 1 : 2;
  let pitch = (available - ROW_HEIGHT) / fittedRows;
  // The villain's row is drawn higher than a pitch this short (villainPitch): with two players'
  // rows, the one pitch left takes what that row leaves.
  if (fittedRows === 2 && pitch < minVillain) {
    pitch = available - ROW_HEIGHT - minVillain;
  }
  const onGrid = Math.floor(pitch / step) * step;
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, onGrid));
}

/**
 * The drawn height of the villain's row for a pitch: the same, so that every
 * row lies as far from the next, but never less than `minVillain`: by default
 * the least height at which the active counter clears player 1's identity. A
 * tablet passes VILLAIN_ROW_HEIGHT, the row's full height, so that a row of
 * cards fits between the villain's cards and the first player's row (rowPitch).
 */
export function villainPitch(pitch: number, minVillain = MIN_VILLAIN_PITCH): number {
  return Math.max(pitch, minVillain);
}

/** A row of the table where it is drawn, in table units. */
interface Band {
  /** The row of the table. */
  row: number;
  tableTop: number;
  tableHeight: number;
  /** Where the row is drawn, and how high. */
  top: number;
  height: number;
  /** The top part of the row drawn as it is (ROW_CONTENT, VILLAIN_CONTENT). */
  content: number;
  /** Whether the row runs on downward as it is: the last row, so that nothing below the table is lost. */
  runsOn: boolean;
}

/** Where an offset into a row is drawn, from the row's drawn top: its content as it is, then its empty tail. */
function drawnOffset(band: Band, offset: number): number {
  if (offset < band.content || band.runsOn) {
    return offset;
  }
  const scale = (band.height - band.content) / (band.tableHeight - band.content);
  return band.content + (offset - band.content) * scale;
}

/** The offset into a row drawn at an offset from its drawn top: drawnOffset, inverted. */
function tableOffset(band: Band, offset: number): number {
  if (offset < band.content || band.runsOn) {
    return offset;
  }
  const scale = (band.tableHeight - band.content) / (band.height - band.content);
  return band.content + (offset - band.content) * scale;
}

/**
 * The rows drawn `pitch` apart (rowPitch), the villain's villainPitch high,
 * at least `minVillain`, whatever their height on the table: "All" draws
 * every row, down to the last one, `lastRow`; "Villain + player" the
 * villain's and the shown row right under it, the others hidden. A tablet
 * passes VILLAIN_ROW_HEIGHT: a row of cards fits between the villain's cards
 * and the first player's row, where a finger lays them, and a window short
 * of height scrolls. Within a row, its content is drawn as
 * it is and its empty tail squeezed or stretched to the drawn height, so that
 * a card dropped in a gap lands near where it was dropped: drops snap to the
 * table's grid (drag.ts, spotOf), whose lines a stretched tail draws up to
 * about 83 units apart.
 *
 * The last row of the table runs on downward as it is, so a card dropped
 * below it stays with its player. A shown row that is not the last one ends
 * on its last height, so that nothing drawn lands in the hidden row after it.
 * Heights above the table belong to the villain's row.
 */
export function spreadRows(
  pitch: number,
  lastRow: number,
  shownRow?: number,
  minVillain = MIN_VILLAIN_PITCH,
): RowMap {
  const villain = villainPitch(pitch, minVillain);
  const rows =
    shownRow === undefined ? Array.from({ length: lastRow + 1 }, (_, row) => row) : [0, shownRow];
  // Top to bottom, as drawn.
  const bands: Band[] = rows.map((row, i) => ({
    row,
    tableTop: rowTop(row),
    tableHeight: row === 0 ? VILLAIN_ROW_HEIGHT : ROW_HEIGHT,
    top: i === 0 ? 0 : villain + pitch * (i - 1),
    height: i === 0 ? villain : pitch,
    content: row === 0 ? VILLAIN_CONTENT : ROW_CONTENT,
    runsOn: row === lastRow,
  }));
  const last = bands[bands.length - 1] as Band;

  /** The band a height of the table is drawn in: its row's, the last row's below the table; none when hidden. */
  function bandOfTable(y: number): Band | undefined {
    const row = rowOf(y);
    const own = bands.find((band) => band.row === row);
    if (own) {
      return own;
    }
    return row > lastRow && last.runsOn ? last : undefined;
  }

  /** The band drawn at a height of the surface: the lowest one starting at or above it, the villain's above the top. */
  function bandOfDisplay(y: number): Band {
    let found = bands[0] as Band;
    for (const band of bands) {
      if (band.top <= y) {
        found = band;
      }
    }
    return found;
  }

  return {
    toDisplay(y) {
      const band = bandOfTable(y);
      return band ? band.top + drawnOffset(band, y - band.tableTop) : null;
    },
    toTable(y) {
      const band = bandOfDisplay(y);
      const offset = y - band.top;
      if (!band.runsOn && offset >= band.height) {
        return band.tableTop + band.tableHeight - 1;
      }
      return band.tableTop + tableOffset(band, offset);
    },
  };
}

/** A point of the table, of an item when it has an id. */
interface Spot extends Point {
  id?: string;
}

/**
 * How far from `from` the point `to` is drawn: a group of cards keeps its
 * shape as drawn, across rows drawn closer or further apart than they lie,
 * or wrapped. Their offset on the table when either point is hidden.
 */
export function drawnDelta(map: TableMap, from: Spot, to: Spot): Point {
  const start = map.toDisplay(from, from.id);
  const end = map.toDisplay(to, to.id);
  if (start === null || end === null) {
    return { x: to.x - from.x, y: to.y - from.y };
  }
  return { x: end.x - start.x, y: end.y - start.y };
}

/**
 * A function that lays items where `map` draws them: each item copied with
 * its drawn corner, those not shown dropped. It keeps each item's copy while
 * the item and its drawn corner stay the same, so a redraw hands an unchanged
 * item's view the same object, and that view does not re-derive. Items are
 * told apart by identity, which holds as views are never changed in place,
 * and an unchanged card keeps its object from one view to the next
 * (lib/reuse.ts).
 */
export function shownItems<T extends { id: string; x: number; y: number }>(): (
  items: readonly T[],
  map: TableMap,
) => T[] {
  const copies = new WeakMap<T, T>();
  return (items, map) =>
    items.flatMap((item) => {
      const drawn = map.toDisplay(item, item.id);
      if (drawn === null) {
        return [];
      }
      let copy = copies.get(item);
      if (copy === undefined || copy.x !== drawn.x || copy.y !== drawn.y) {
        copy = { ...item, x: drawn.x, y: drawn.y };
        copies.set(item, copy);
      }
      return [copy];
    });
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
