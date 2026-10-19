import { clearPrefMemory } from '../lib/prefs';
import type { PileView } from '../lib/types';
import {
  ALL_ROWS,
  focusRows,
  lastRow,
  rowOf,
  rowOfSeat,
  saveViewMode,
  storedViewMode,
} from './rows';

function deck(owner: number, y: number): PileView {
  return { id: `deck:p${owner}`, kind: 'deck', owner, x: 0, y, count: 30 };
}

describe('rows', () => {
  it('cuts the table in rows of 330', () => {
    expect([rowOf(-10), rowOf(0), rowOf(329), rowOf(330), rowOf(1000)]).toEqual([0, 0, 0, 1, 3]);
  });

  it("finds a seat's row from its deck, or from the seat without one", () => {
    const piles = [deck(0, 360), deck(1, 690), deck(2, 1020)];
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
    // Three players: the second one's row is row 2, from 660 to 990.
    const rows = focusRows(2, 3);
    expect(rows.toDisplay(30)).toBe(30);
    expect(rows.toDisplay(690)).toBe(360);
    expect(rows.toDisplay(989)).toBe(659);
    // The other players' rows are hidden.
    expect(rows.toDisplay(360)).toBeNull();
    expect(rows.toDisplay(1020)).toBeNull();
    expect(rows.toDisplay(5000)).toBeNull();
  });

  it('lets the last row run on downward', () => {
    const rows = focusRows(3, 3);
    expect(rows.toDisplay(1020)).toBe(360);
    expect(rows.toDisplay(5000)).toBe(4340);
  });

  it('maps what it draws back to the table, the player row taking anything below the villain', () => {
    const rows = focusRows(2, 3);
    for (const y of [0, 30, 329, 660, 690, 989]) {
      expect(rows.toTable(rows.toDisplay(y)!)).toBe(y);
    }
    // Drawn far below the shown rows: still the player's row, run on.
    expect(rows.toTable(2000)).toBe(2330);
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
