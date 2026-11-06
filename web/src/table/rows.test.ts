import { clearPrefMemory } from '../lib/prefs';
import type { PileView } from '../lib/types';
import {
  ALL_ROWS,
  ALL_TABLE,
  drawnDelta,
  lastRow,
  ROW_HEIGHT,
  rowOf,
  rowOfSeat,
  rowPitch,
  saveViewMode,
  shownItems,
  spreadRows,
  storedViewMode,
  tableMapOf,
  VILLAIN_ROW_HEIGHT,
  villainPitch,
} from './rows';

function deck(owner: number, y: number): PileView {
  return { id: `deck:p${owner}`, kind: 'deck', owner, x: 0, y, count: 30 };
}

describe('rows', () => {
  it("cuts the table in the villain's row of 440, then rows of 220", () => {
    const heights = [-10, 0, 439, 440, 659, 660, 1000];
    expect(heights.map(rowOf)).toEqual([0, 0, 0, 1, 1, 2, 3]);
  });

  it("finds a seat's row from its deck, or from the seat without one", () => {
    const piles = [deck(0, 470), deck(1, 690), deck(2, 910)];
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
    // Two pitches and the last row's 220: (948 − 220) / 2 = 364, 360 on the grid.
    expect(rowPitch(948, 2)).toBe(360);
    expect(rowPitch(960, 2)).toBe(370);
    // Never closer than the table's rows, nor further apart than the villain's row.
    expect(rowPitch(0, 2)).toBe(ROW_HEIGHT);
    expect(rowPitch(700, 2)).toBe(ROW_HEIGHT);
    expect(rowPitch(5000, 2)).toBe(VILLAIN_ROW_HEIGHT);
    // A third or a fourth deck's row is spaced the same, below the screen's height.
    expect(rowPitch(948, 3)).toBe(360);
    expect(rowPitch(948, 4)).toBe(360);
  });

  it("fits the villain's row and a single deck's row in the height available, on the grid", () => {
    // One pitch and the player's row's 220: 568 − 220 = 348, 340 on the grid.
    expect(rowPitch(568, 1)).toBe(340);
    expect(villainPitch(rowPitch(568, 1))).toBe(340);
    expect(rowPitch(580, 1)).toBe(360);
    // The villain's row drawn at least 270 high, and never higher than it lies.
    expect(villainPitch(rowPitch(0, 1))).toBe(270);
    expect(villainPitch(rowPitch(475, 1))).toBe(270);
    expect(villainPitch(rowPitch(5000, 1))).toBe(VILLAIN_ROW_HEIGHT);
    for (let available = 0; available < 1000; available++) {
      const villain = villainPitch(rowPitch(available, 1));
      expect(villain % 10).toBe(0);
      if (villain > 270) {
        expect(villain + ROW_HEIGHT).toBeLessThanOrEqual(available);
      }
    }
  });

  it("leaves a pitch what the villain's row, drawn higher, leaves of the height", () => {
    // Halved, 740 would give 260: the villain's row 270 high, the one pitch left gets 250.
    expect(rowPitch(740, 2)).toBe(250);
    expect(rowPitch(755, 2)).toBe(260);
    expect(rowPitch(760, 2)).toBe(270);
    for (let available = 700; available < 900; available++) {
      const pitch = rowPitch(available, 2);
      if (pitch > ROW_HEIGHT) {
        expect(villainPitch(pitch) + pitch + ROW_HEIGHT).toBeLessThanOrEqual(available);
      }
    }
  });

  it("draws the villain's row as high as a player's, but clear of the active counter", () => {
    expect(villainPitch(220)).toBe(270);
    expect(villainPitch(270)).toBe(270);
    expect(villainPitch(340)).toBe(340);
  });

  describe("a tablet's minimum, the villain's row at its full height", () => {
    const tablet = VILLAIN_ROW_HEIGHT;

    it("draws the villain's row 440 high with a single deck, whatever the height available", () => {
      for (const available of [0, 475, 568, 820, 5000]) {
        expect(villainPitch(rowPitch(available, 1, tablet), tablet)).toBe(VILLAIN_ROW_HEIGHT);
      }
      // The player's pitch is the same as with the default minimum.
      expect(rowPitch(568, 1, tablet)).toBe(rowPitch(568, 1));
    });

    it("draws the villain's row 440 high with two decks, the one pitch left taking what it leaves", () => {
      // Halved, 948 would give 364: the villain's row 440 high, the pitch 948 − 660 = 288, 280.
      expect(rowPitch(948, 2, tablet)).toBe(280);
      expect(rowPitch(948, 2)).toBe(360);
      // The pitch keeps its own bounds.
      expect(rowPitch(700, 2, tablet)).toBe(ROW_HEIGHT);
      expect(rowPitch(5000, 2, tablet)).toBe(VILLAIN_ROW_HEIGHT);
      for (let available = 0; available < 1200; available++) {
        const pitch = rowPitch(available, 2, tablet);
        expect(villainPitch(pitch, tablet)).toBe(VILLAIN_ROW_HEIGHT);
        if (pitch > ROW_HEIGHT) {
          expect(VILLAIN_ROW_HEIGHT + pitch + ROW_HEIGHT).toBeLessThanOrEqual(available);
        }
      }
    });

    it("draws the villain's row where it lies, the first player's row right under it", () => {
      const rows = spreadRows(ROW_HEIGHT, 2, undefined, tablet);
      for (const y of [-10, 0, 187, 210, 300, 439]) {
        expect(rows.toDisplay(y)).toBe(y);
        expect(rows.toTable(y)).toBe(y);
      }
      expect(rows.toDisplay(440)).toBe(440);
      expect(rows.toDisplay(660)).toBe(660);
      // "Villain + player": the shown row right under the villain's 440.
      expect(spreadRows(ROW_HEIGHT, 3, 2, tablet).toDisplay(660)).toBe(440);
    });

    it('keeps the default minimum of 270 without one', () => {
      expect(villainPitch(220)).toBe(270);
      expect(spreadRows(ROW_HEIGHT, 2).toDisplay(440)).toBe(270);
    });
  });

  describe('"All", one pitch apart', () => {
    // Three rows, drawn at 0, 340 and 680.
    const rows = spreadRows(340, 2);

    it("draws the villain's row where it lies, its empty band squeezed", () => {
      expect(rows.toDisplay(-10)).toBe(-10);
      expect(rows.toDisplay(30)).toBe(30);
      expect(rows.toDisplay(209)).toBe(209);
      // From 210, the 230 units left of the row are drawn in 130.
      expect(rows.toDisplay(210)).toBe(210);
      expect(rows.toDisplay(325)).toBeCloseTo(275);
      expect(rows.toTable(275)).toBeCloseTo(325);
    });

    it("draws a player's row a pitch high, its cards as they lie, the 30 units under them stretched", () => {
      expect(rows.toDisplay(440)).toBe(340);
      expect(rows.toDisplay(470)).toBe(370);
      expect(rows.toDisplay(629)).toBe(529);
      // From 630, the 30 units left of the row are drawn in 150.
      expect(rows.toDisplay(650)).toBeCloseTo(630);
      expect(rows.toDisplay(660)).toBe(680);
      expect(rows.toTable(370)).toBe(470);
      expect(rows.toTable(630)).toBeCloseTo(650);
    });

    it('lets the last row run on downward as it lies', () => {
      expect(rows.toDisplay(690)).toBe(710);
      expect(rows.toDisplay(879)).toBe(899);
      expect(rows.toDisplay(5000)).toBe(5020);
      expect(rows.toTable(5020)).toBe(5000);
    });

    it('draws the rows as close as they go on a screen with no room', () => {
      const close = spreadRows(rowPitch(0, 2), 2);
      // The villain's row 270 high, then 220 for each player's.
      expect(close.toDisplay(470)).toBe(300);
      expect(close.toDisplay(690)).toBe(520);
      expect(close.toTable(300)).toBe(470);
    });

    it('round trips between the table and the surface, keeping the order of heights', () => {
      for (const pitch of [220, 270, 340, 440]) {
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
      // Three players: the second one's row is row 2, from 660 to 880.
      const rows = spreadRows(340, 3, 2);
      expect(rows.toDisplay(30)).toBe(30);
      expect(rows.toDisplay(690)).toBe(370);
      expect(rows.toDisplay(849)).toBe(529);
      expect(rows.toDisplay(879)).toBeCloseTo(675);
      expect(rows.toDisplay(470)).toBeNull();
      expect(rows.toDisplay(910)).toBeNull();
      expect(rows.toDisplay(5000)).toBeNull();
    });

    it('lets the last row run on downward', () => {
      const rows = spreadRows(340, 3, 3);
      expect(rows.toDisplay(910)).toBe(370);
      expect(rows.toDisplay(5000)).toBe(4460);
      expect(rows.toTable(4460)).toBe(5000);
    });

    it('keeps anything drawn below a row that is not the last one in that row', () => {
      const rows = spreadRows(340, 3, 2);
      expect(rows.toTable(679)).toBeLessThan(880);
      expect(rows.toTable(680)).toBe(879);
      expect(rows.toTable(2000)).toBe(879);
      // The last row runs on.
      expect(spreadRows(340, 3, 3).toTable(2000)).toBe(2540);
    });

    // Every height drawn from the top of the surface to well below the shown rows, one table unit apart.
    const DRAWN = Array.from({ length: 2000 }, (_, i) => i - 20);

    it("maps anything drawn below the villain's row to the shown player's row, whichever it is", () => {
      const last = 4;
      for (let shown = 1; shown <= last; shown++) {
        const rows = spreadRows(340, last, shown);
        for (const y of DRAWN) {
          const row = rowOf(rows.toTable(y));
          if (y < 340) {
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
        const rows = spreadRows(340, last, shown);
        // Every height of the shown rows is drawn somewhere and maps back to itself.
        for (let y = -20; y < VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (last + 1); y++) {
          const drawn = rows.toDisplay(y);
          if (drawn !== null) {
            expect(rows.toTable(drawn)).toBeCloseTo(y);
          }
        }
        // Every height drawn in the shown rows maps back to itself.
        const bottom = shown === last ? Infinity : 680;
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

describe('shownItems', () => {
  // Draws every height 10 units lower, and hides the heights of 1000 and more.
  const lower = tableMapOf({
    toDisplay: (y) => (y < 1000 ? y + 10 : null),
    toTable: (y) => y - 10,
  });
  const higher = tableMapOf({ toDisplay: (y) => y - 10, toTable: (y) => y + 10 });

  it('copies each item at its drawn height, and drops those hidden', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();
    const items = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 1200 },
    ];

    expect(shown(items, lower)).toEqual([{ id: 'a', x: 0, y: 10 }]);
    expect(items[0]).toEqual({ id: 'a', x: 0, y: 0 });
  });

  it('keeps the copy of the same item drawn at the same height', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();
    const item = { id: 'a', x: 0, y: 0 };

    const [first] = shown([item], lower);
    const [second] = shown([item], { ...lower });

    expect(second).toBe(first);
  });

  it('makes a new copy of the same item drawn at another height', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();
    const item = { id: 'a', x: 0, y: 100 };

    const [first] = shown([item], lower);
    const [second] = shown([item], higher);

    expect(second).not.toBe(first);
    expect(second).toEqual({ id: 'a', x: 0, y: 90 });
  });

  it('makes a new copy of the same item drawn at another x', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();
    const item = { id: 'a', x: 100, y: 0 };
    const halved = {
      toDisplay: (p: { x: number; y: number }) => ({ x: p.x / 2, y: p.y }),
      toTable: (p: { x: number; y: number }) => p,
    };

    const [first] = shown([item], ALL_TABLE);
    const [second] = shown([item], halved);

    expect(second).not.toBe(first);
    expect(second).toEqual({ id: 'a', x: 50, y: 0 });
  });

  it('hands the map the id of each item', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();
    const asked: (string | undefined)[] = [];
    const map = {
      toDisplay: (p: { x: number; y: number }, id?: string) => {
        asked.push(id);
        return p;
      },
      toTable: (p: { x: number; y: number }) => p,
    };

    shown([{ id: 'a', x: 0, y: 0 }], map);

    expect(asked).toEqual(['a']);
  });

  it('makes a new copy of a new item, even with the same data', () => {
    const shown = shownItems<{ id: string; x: number; y: number }>();

    const [first] = shown([{ id: 'a', x: 0, y: 0 }], lower);
    const [second] = shown([{ id: 'a', x: 0, y: 0 }], lower);

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe('tableMapOf', () => {
  it('moves heights as the rows do and keeps every width', () => {
    const rows = spreadRows(220, 3, 2);
    const map = tableMapOf(rows);

    expect(map.toDisplay({ x: 123, y: 710 })).toEqual({ x: 123, y: rows.toDisplay(710) });
    expect(map.toDisplay({ x: 123, y: 510 })).toBeNull();
    expect(map.toTable({ x: 45, y: 300 })).toEqual({ x: 45, y: rows.toTable(300) });
  });

  it('ALL_TABLE draws every point where it is', () => {
    expect(ALL_TABLE.toDisplay({ x: 12, y: 1234 }, 'card')).toEqual({ x: 12, y: 1234 });
    expect(ALL_TABLE.toTable({ x: 12, y: 1234 })).toEqual({ x: 12, y: 1234 });
  });
});

describe('drawnDelta', () => {
  it('is the offset between where two points are drawn', () => {
    const map = tableMapOf(spreadRows(220, 1));
    const from = { x: 300, y: 295 };
    const to = { x: 100, y: 470 };
    const drawnFrom = map.toDisplay(from)!;
    const drawnTo = map.toDisplay(to)!;

    expect(drawnDelta(map, from, to)).toEqual({
      x: drawnTo.x - drawnFrom.x,
      y: drawnTo.y - drawnFrom.y,
    });
  });

  it('draws a point of an item with its item, and falls back to the table offset when hidden', () => {
    const map = {
      toDisplay: (p: { x: number; y: number }, id?: string) =>
        id === 'hidden' ? null : { x: id === 'wrapped' ? p.x - 100 : p.x, y: p.y },
      toTable: (p: { x: number; y: number }) => p,
    };

    expect(drawnDelta(map, { x: 0, y: 0 }, { id: 'wrapped', x: 150, y: 20 })).toEqual({
      x: 50,
      y: 20,
    });
    expect(drawnDelta(map, { x: 0, y: 0 }, { id: 'hidden', x: 150, y: 20 })).toEqual({
      x: 150,
      y: 20,
    });
  });
});
