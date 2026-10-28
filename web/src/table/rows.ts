// The view modes of the table. "All" shows the whole surface. "Villain +
// player" shows the villain's row and one player's row right under it. The
// rows are the setup's bands of the table (internal/game/setup.go), never
// moved on the server; the screen only draws them spread over its height,
// each row's empty band squeezed or stretched (spreadRows), and in "Villain +
// player" the shown player's row right under the villain's. A RowMap turns a
// height of the table into where it is drawn, and back.

import { getPref, setPref } from '../lib/prefs';
import type { PileView } from '../lib/types';
import { GRID } from './layout';

/**
 * The height of the villain's row, in table units: it covers [0, 470), leaving
 * room between its cards and the first player's row.
 */
export const VILLAIN_ROW_HEIGHT = 470;

/** The height of a player's row, in table units: row r ≥ 1 covers [470 + 270·(r−1), 470 + 270·r). */
export const ROW_HEIGHT = 270;

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

/** The height of the top of a row of the table. */
function rowTop(row: number): number {
  return row === 0 ? 0 : VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (row - 1);
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
// top lies at 250, ends at 320, and player 1's identity is drawn 30 below the top of its row.
const MIN_VILLAIN_PITCH = 310;

// The top part of a row that is drawn as it is, in table units: a player's row, down to the bottom
// of its cards (30 below its top, 196 high); the villain's row, down to the active counter's top.
// What lies below, an empty band, is drawn squeezed or stretched to the row's drawn height.
const ROW_CONTENT = 230;
const VILLAIN_CONTENT = 260;

/**
 * The drawn height of a player's row, in table units, for `available` px of
 * visible height: the villain's row and two players' rows fill it, that is two
 * pitches and the last row's own band (its cards and the room under them).
 * The same pitch spaces every player's row, a third or a fourth deck's too,
 * on the 10-unit grid. Computed at zoom 1: zooming out shows more of the
 * table, it does not spread its rows.
 */
export function rowPitch(available: number): number {
  let pitch = (available - ROW_HEIGHT) / 2;
  // The villain's row is drawn higher than a pitch this short (villainPitch): the one pitch left
  // takes what that row leaves.
  if (pitch < MIN_VILLAIN_PITCH) {
    pitch = available - ROW_HEIGHT - MIN_VILLAIN_PITCH;
  }
  const onGrid = Math.floor(pitch / GRID) * GRID;
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, onGrid));
}

/**
 * The drawn height of the villain's row for a pitch: the same, so that every
 * row lies as far from the next, but never so short that the active counter
 * runs into player 1's identity.
 */
export function villainPitch(pitch: number): number {
  return Math.max(pitch, MIN_VILLAIN_PITCH);
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
 * whatever their height on the table: "All" draws every row, down to the
 * last one, `lastRow`; "Villain + player" the villain's and the shown row
 * right under it, the others hidden. Within a row, its content is drawn as
 * it is and its empty tail squeezed or stretched to the drawn height, so that
 * a card dropped in a gap lands near where it was dropped: drops snap to the
 * table's grid (drag.ts, spotOf), whose lines a stretched tail draws up to 60
 * units apart.
 *
 * The last row of the table runs on downward as it is, so a card dropped
 * below it stays with its player. A shown row that is not the last one ends
 * on its last height, so that nothing drawn lands in the hidden row after it.
 * Heights above the table belong to the villain's row.
 */
export function spreadRows(pitch: number, lastRow: number, shownRow?: number): RowMap {
  const villain = villainPitch(pitch);
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

/**
 * How far below the height `from` the height `to` is drawn: a group of cards
 * keeps its shape as drawn, across rows drawn closer or further apart than
 * they lie. Their offset on the table when either height is hidden.
 */
export function drawnGap(rows: RowMap, from: number, to: number): number {
  const top = rows.toDisplay(from);
  const bottom = rows.toDisplay(to);
  return top === null || bottom === null ? to - from : bottom - top;
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
