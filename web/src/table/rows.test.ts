import { clearPrefMemory } from '../lib/prefs';
import type { PileView } from '../lib/types';
import {
  ALL_ROWS,
  focusRows,
  lastRow,
  ROW_HEIGHT,
  rowOf,
  rowOfSeat,
  saveViewMode,
  storedViewMode,
  VILLAIN_ROW_HEIGHT,
} from './rows';

function deck(owner: number, y: number): PileView {
  return { id: `deck:p${owner}`, kind: 'deck', owner, x: 0, y, count: 30 };
}

describe('rows', () => {
  it("cuts the table in the villain's row of 470, then rows of 330", () => {
    const heights = [-10, 0, 469, 470, 799, 800, 1300];
    expect(heights.map(rowOf)).toEqual([0, 0, 0, 1, 1, 2, 3]);
  });

  it("finds a seat's row from its deck, or from the seat without one", () => {
    const piles = [deck(0, 500), deck(1, 830), deck(2, 1160)];
    expect(rowOfSeat(piles, 1)).toBe(2);
    expect(rowOfSeat([], 1)).toBe(2);
    expect(lastRow(piles)).toBe(3);
    expect(lastRow([])).toBe(1);
  });

  it('"All" draws every height where it is', () => {
    expect(ALL_ROWS.toDisplay(1234)).toBe(1234);
    expect(ALL_ROWS.toTable(1234)).toBe(1234);
  });

  it("draws the villain's row where it is and the player's row right under it", () => {
    // Three players: the second one's row is row 2, from 800 to 1130.
    const rows = focusRows(2, 3);
    expect(rows.toDisplay(30)).toBe(30);
    expect(rows.toDisplay(830)).toBe(500);
    expect(rows.toDisplay(1129)).toBe(799);
    // The other players' rows are hidden.
    expect(rows.toDisplay(500)).toBeNull();
    expect(rows.toDisplay(1160)).toBeNull();
    expect(rows.toDisplay(5000)).toBeNull();
  });

  it('lets the last row run on downward', () => {
    const rows = focusRows(3, 3);
    expect(rows.toDisplay(1160)).toBe(500);
    expect(rows.toDisplay(5000)).toBe(4340);
  });

  // Every height drawn from the top of the surface to well below the shown rows, one table unit apart.
  const DRAWN = Array.from({ length: 2000 }, (_, i) => i - 20);

  it("maps anything drawn below the villain's row to the shown player's row, whichever it is", () => {
    const last = 4;
    for (let shown = 1; shown <= last; shown++) {
      const rows = focusRows(shown, last);
      for (const y of DRAWN) {
        const row = rowOf(rows.toTable(y));
        if (y < VILLAIN_ROW_HEIGHT) {
          expect(row).toBe(0);
        } else if (shown === last) {
          // The last row runs on downward, past its band.
          expect(row).toBeGreaterThanOrEqual(shown);
        } else {
          expect(row).toBe(shown);
        }
      }
    }
  });

  it('round trips between the table and the surface', () => {
    const last = 4;
    for (let shown = 1; shown <= last; shown++) {
      const rows = focusRows(shown, last);
      // Every height of the shown rows is drawn somewhere and maps back to itself.
      for (let y = -20; y < VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (last + 1); y++) {
        const drawn = rows.toDisplay(y);
        if (drawn !== null) {
          expect(rows.toTable(drawn)).toBe(y);
        }
      }
      // Every height drawn in the shown rows maps back to itself.
      const bottom = shown === last ? Infinity : VILLAIN_ROW_HEIGHT + ROW_HEIGHT;
      for (const y of DRAWN.filter((d) => d < bottom)) {
        expect(rows.toDisplay(rows.toTable(y))).toBe(y);
      }
    }
  });

  it('keeps anything drawn below a row that is not the last one in that row', () => {
    const rows = focusRows(2, 3);
    expect(rows.toTable(799)).toBe(1129);
    expect(rows.toTable(800)).toBe(1129);
    expect(rows.toTable(2000)).toBe(1129);
    // The last row runs on.
    expect(focusRows(3, 3).toTable(2000)).toBe(2660);
  });

  it('remembers the view mode, "All" by default', () => {
    localStorage.clear();
    clearPrefMemory();
    expect(storedViewMode()).toBe('all');
    saveViewMode('focus');
    expect(storedViewMode()).toBe('focus');
    expect(localStorage.getItem('itf-view')).toBe('focus');
    saveViewMode('all');
    expect(storedViewMode()).toBe('all');
  });
});
