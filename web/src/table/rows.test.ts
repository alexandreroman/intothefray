import { clearPrefMemory } from '../lib/prefs';
import type { PileView } from '../lib/types';
import {
  ALL_ROWS,
  lastRow,
  ROW_HEIGHT,
  rowOf,
  rowOfSeat,
  rowPitch,
  saveViewMode,
  spreadRows,
  storedViewMode,
  VILLAIN_ROW_HEIGHT,
  villainPitch,
} from './rows';

function deck(owner: number, y: number): PileView {
  return { id: `deck:p${owner}`, kind: 'deck', owner, x: 0, y, count: 30 };
}

describe('rows', () => {
  it("cuts the table in the villain's row of 470, then rows of 270", () => {
    const heights = [-10, 0, 469, 470, 739, 740, 1100];
    expect(heights.map(rowOf)).toEqual([0, 0, 0, 1, 1, 2, 3]);
  });

  it("finds a seat's row from its deck, or from the seat without one", () => {
    const piles = [deck(0, 500), deck(1, 770), deck(2, 1040)];
    expect(rowOfSeat(piles, 1)).toBe(2);
    expect(rowOfSeat([], 1)).toBe(2);
    expect(lastRow(piles)).toBe(3);
    expect(lastRow([])).toBe(1);
  });

  it('ALL_ROWS draws every height where it is', () => {
    expect(ALL_ROWS.toDisplay(1234)).toBe(1234);
    expect(ALL_ROWS.toTable(1234)).toBe(1234);
  });

  it("fits the villain's row and two players' rows in the height available, on the grid", () => {
    // Two pitches and the last row's 270: (1078 − 270) / 2 = 404, 400 on the grid.
    expect(rowPitch(1078, 2)).toBe(400);
    expect(rowPitch(1090, 2)).toBe(410);
    // Never closer than the table's rows, nor further apart than the villain's row.
    expect(rowPitch(0, 2)).toBe(ROW_HEIGHT);
    expect(rowPitch(800, 2)).toBe(ROW_HEIGHT);
    expect(rowPitch(5000, 2)).toBe(VILLAIN_ROW_HEIGHT);
    // A third or a fourth deck's row is spaced the same, below the screen's height.
    expect(rowPitch(1078, 3)).toBe(400);
    expect(rowPitch(1078, 4)).toBe(400);
  });

  it("fits the villain's row and a single deck's row in the height available, on the grid", () => {
    // One pitch and the player's row's 270: 668 − 270 = 398, 390 on the grid.
    expect(rowPitch(668, 1)).toBe(390);
    expect(villainPitch(rowPitch(668, 1))).toBe(390);
    expect(rowPitch(680, 1)).toBe(410);
    // The villain's row drawn at least 310 high, and never higher than it lies.
    expect(villainPitch(rowPitch(0, 1))).toBe(310);
    expect(villainPitch(rowPitch(575, 1))).toBe(310);
    expect(villainPitch(rowPitch(5000, 1))).toBe(VILLAIN_ROW_HEIGHT);
    for (let available = 0; available < 1000; available++) {
      const villain = villainPitch(rowPitch(available, 1));
      expect(villain % 10).toBe(0);
      if (villain > 310) {
        expect(villain + ROW_HEIGHT).toBeLessThanOrEqual(available);
      }
    }
  });

  it("leaves a pitch what the villain's row, drawn higher, leaves of the height", () => {
    // Halved, 850 would give 290: the villain's row 310 high, the one pitch left gets 270.
    expect(rowPitch(850, 2)).toBe(270);
    expect(rowPitch(875, 2)).toBe(290);
    expect(rowPitch(890, 2)).toBe(310);
    for (let available = 800; available < 1000; available++) {
      const pitch = rowPitch(available, 2);
      if (pitch > ROW_HEIGHT) {
        expect(villainPitch(pitch) + pitch + ROW_HEIGHT).toBeLessThanOrEqual(available);
      }
    }
  });

  it("draws the villain's row as high as a player's, but clear of the active counter", () => {
    expect(villainPitch(270)).toBe(310);
    expect(villainPitch(310)).toBe(310);
    expect(villainPitch(400)).toBe(400);
  });

  describe('"All", one pitch apart', () => {
    // Three rows, drawn at 0, 400 and 800.
    const rows = spreadRows(400, 2);

    it("draws the villain's row where it lies, its empty band squeezed", () => {
      expect(rows.toDisplay(-10)).toBe(-10);
      expect(rows.toDisplay(30)).toBe(30);
      expect(rows.toDisplay(259)).toBe(259);
      // From 260, the 210 units left of the row are drawn in 140.
      expect(rows.toDisplay(260)).toBe(260);
      expect(rows.toDisplay(365)).toBeCloseTo(330);
      expect(rows.toTable(330)).toBeCloseTo(365);
    });

    it("draws a player's row a pitch high, its cards as they lie, the 40 units under them stretched", () => {
      expect(rows.toDisplay(470)).toBe(400);
      expect(rows.toDisplay(500)).toBe(430);
      expect(rows.toDisplay(699)).toBe(629);
      expect(rows.toDisplay(720)).toBeCloseTo(715);
      expect(rows.toDisplay(740)).toBe(800);
      expect(rows.toTable(430)).toBe(500);
      expect(rows.toTable(715)).toBeCloseTo(720);
    });

    it('lets the last row run on downward as it lies', () => {
      expect(rows.toDisplay(770)).toBe(830);
      expect(rows.toDisplay(1009)).toBe(1069);
      expect(rows.toDisplay(5000)).toBe(5060);
      expect(rows.toTable(5060)).toBe(5000);
    });

    it('draws the rows as close as they go on a screen with no room', () => {
      const close = spreadRows(rowPitch(0, 2), 2);
      // The villain's row 310 high, then 270 for each player's.
      expect(close.toDisplay(500)).toBe(340);
      expect(close.toDisplay(770)).toBe(610);
      expect(close.toTable(340)).toBe(500);
    });

    it('round trips between the table and the surface, keeping the order of heights', () => {
      for (const pitch of [270, 310, 400, 470]) {
        const spread = spreadRows(pitch, 3);
        let previous = -Infinity;
        for (let y = -20; y < 2000; y++) {
          const drawn = spread.toDisplay(y);
          expect(drawn).not.toBeNull();
          expect(drawn!).toBeGreaterThan(previous);
          expect(spread.toTable(drawn!)).toBeCloseTo(y);
          expect(spread.toDisplay(spread.toTable(y))).toBeCloseTo(y);
          previous = drawn!;
        }
      }
    });
  });

  describe('"Villain + player"', () => {
    it("draws the player's row right under the villain's, a pitch high, and hides the others", () => {
      // Three players: the second one's row is row 2, from 740 to 1010.
      const rows = spreadRows(400, 3, 2);
      expect(rows.toDisplay(30)).toBe(30);
      expect(rows.toDisplay(770)).toBe(430);
      expect(rows.toDisplay(969)).toBe(629);
      expect(rows.toDisplay(1009)).toBeCloseTo(795.75);
      expect(rows.toDisplay(500)).toBeNull();
      expect(rows.toDisplay(1040)).toBeNull();
      expect(rows.toDisplay(5000)).toBeNull();
    });

    it('lets the last row run on downward', () => {
      const rows = spreadRows(400, 3, 3);
      expect(rows.toDisplay(1040)).toBe(430);
      expect(rows.toDisplay(5000)).toBe(4390);
      expect(rows.toTable(4390)).toBe(5000);
    });

    it('keeps anything drawn below a row that is not the last one in that row', () => {
      const rows = spreadRows(400, 3, 2);
      expect(rows.toTable(799)).toBeLessThan(1010);
      expect(rows.toTable(800)).toBe(1009);
      expect(rows.toTable(2000)).toBe(1009);
      // The last row runs on.
      expect(spreadRows(400, 3, 3).toTable(2000)).toBe(2610);
    });

    // Every height drawn from the top of the surface to well below the shown rows, one table unit apart.
    const DRAWN = Array.from({ length: 2000 }, (_, i) => i - 20);

    it("maps anything drawn below the villain's row to the shown player's row, whichever it is", () => {
      const last = 4;
      for (let shown = 1; shown <= last; shown++) {
        const rows = spreadRows(400, last, shown);
        for (const y of DRAWN) {
          const row = rowOf(rows.toTable(y));
          if (y < 400) {
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
        const rows = spreadRows(400, last, shown);
        // Every height of the shown rows is drawn somewhere and maps back to itself.
        for (let y = -20; y < VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (last + 1); y++) {
          const drawn = rows.toDisplay(y);
          if (drawn !== null) {
            expect(rows.toTable(drawn)).toBeCloseTo(y);
          }
        }
        // Every height drawn in the shown rows maps back to itself.
        const bottom = shown === last ? Infinity : 800;
        for (const y of DRAWN.filter((d) => d < bottom)) {
          expect(rows.toDisplay(rows.toTable(y))).toBeCloseTo(y);
        }
      }
    });
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
