import { dockItems, markerItemId, type DockTable } from './dockItems';
import type { Placement } from './dockPiles';
import {
  blockRowOf,
  dockFitWidth,
  dockLayout,
  dockShifts,
  type DockItem,
  type DockLayoutInput,
  type Point,
} from './dockLayout';
import { card as fixtureCard } from './fixtures.testing';

// Every expected value below is worked out by hand, in drawn units (table units × 0.6). The rooms
// are set in each test: a 10-unit name room above a row's lines, a 10-unit gap under each line and
// a 20-unit gap under each row. A portrait card is drawn 67.2 × 94.2, the gap between two units 24
// (40 × 0.6): a slot every 91.2. On a row's first line the units lie 18 under its top (30 × 0.6,
// where the setup puts a row's cards), on its other lines at their top. Every unit starts on a half
// column of a grid all rows share: from the left of the frames and piles, −6 here, half a slot
// apart (45.6), at −6, 39.6, 85.2, 130.8, 176.4, 222, 267.6, 313.2, 358.8, 404.4, 450, 495.6,
// 541.2, …: a unit's box starts on a half column, and it takes as many half columns as its drawn
// width needs, two at least: a portrait card (67.2), a small stack or an exhausted card two (a
// slot, 91.2), a landscape card (94.2) three (136.8). Line 0 starts at the first half column past
// the frames and piles and a gap, every other line at the first one.
const ROOMS = { nameRoom: 10, lineGap: 10, rowGap: 20 };

function card(id: string, x: number, y: number, more: Partial<DockItem> = {}): DockItem {
  return { id, x, y, w: 112, h: 157, kind: 'card', ...more };
}

function pile(id: string, x: number, y: number, more: Partial<DockItem> = {}): DockItem {
  return { id, x, y, w: 112, h: 157, kind: 'pile', ...more };
}

function frame(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  more: Partial<DockItem> = {},
): DockItem {
  return { id, x, y, w, h, kind: 'frame', ...more };
}

function expectBox(actual: Placement | null, expected: Placement): void {
  expect(actual).not.toBeNull();
  const box = actual as Placement;
  expect(box.x).toBeCloseTo(expected.x, 6);
  expect(box.y).toBeCloseTo(expected.y, 6);
  expect(box.w).toBeCloseTo(expected.w, 6);
  expect(box.h).toBeCloseTo(expected.h, 6);
}

function expectPoint(
  actual: { x: number; y: number } | null,
  expected: { x: number; y: number },
): void {
  expect(actual).not.toBeNull();
  const point = actual as { x: number; y: number };
  expect(point.x).toBeCloseTo(expected.x, 6);
  expect(point.y).toBeCloseTo(expected.y, 6);
}

/** A drawn portrait card's box at a corner. */
function cardAt(x: number, y: number): Placement {
  return { x, y, w: 67.2, h: 94.2 };
}

// Player 1's row (table top 440): the owner frame around the deck and the discard, the identity at
// 300, then played cards 152 apart (a card and a 40 gap). Drawn: the frame at x −6, the deck at 0,
// the discard at 78, the identity at 176.4 (the indent: the first column past the frame's right
// edge, 252, and a gap, (252 + 40) × 0.6 = 175.2); the frame 12 below the first line's top and
// 106.2 high, so that the
// first line holds 118.2 of content. Its top is 10, the second line's 10 + 118.2 + 10 = 138.2, the
// third's 138.2 + 94.2 + 10 = 242.4. The row's left edge is the frame's, −6: the lines under the
// first start there, under the frame, five slots of 91.2 to 450 in a 500 wrap width.
const PLAYER_PILES: DockItem[] = [
  frame('frame', -10, 460, 262, 177),
  pile('deck', 0, 470, { anchor: 'frame' }),
  pile('discard', 130, 470, { anchor: 'frame' }),
  card('identity', 300, 470),
];

/** Played cards c1, c2, … at 452, 604, 756, 908, 1060, 1212, 1364, … */
function played(count: number): DockItem[] {
  return Array.from({ length: count }, (_, i) => card(`c${i + 1}`, 452 + 152 * i, 470));
}

function playerRow(
  count: number,
  wrapWidth: number,
  more: Partial<DockLayoutInput> = {},
): DockLayoutInput {
  return { items: [...PLAYER_PILES, ...played(count)], rows: [1], wrapWidth, ...ROOMS, ...more };
}

describe('dockLayout', () => {
  it('draws a row that fits the wrap width at 0.6, its units on half columns, the landscape one on three', () => {
    // The villain's row alone, without a name room.
    const layout = dockLayout({
      items: [
        frame('frame', -10, 20, 262, 177),
        pile('deck', 0, 30, { anchor: 'frame' }),
        pile('discard', 130, 30, { anchor: 'frame' }),
        card('villain', 300, 30),
        card('scheme', 460, 30, { w: 157, h: 112 }),
        card('next', 650, 30),
        card('last', 800, 30),
      ],
      rows: [0],
      wrapWidth: 1000,
      nameRoom: 0,
      lineGap: 10,
      rowGap: 20,
    });

    expectBox(layout.itemBox('frame'), { x: -6, y: 12, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('deck'), cardAt(0, 18));
    expectBox(layout.itemBox('discard'), cardAt(78, 18));
    expectBox(layout.itemBox('villain'), cardAt(176.4, 18));
    // A slot past the villain, not 48 × 0.6 past it as on the table; 94.2 wide: three half
    // columns (2.07 of them), to 404.4, and the next card starts on the half column there.
    expectBox(layout.itemBox('scheme'), { x: 267.6, y: 18, w: 94.2, h: 67.2 });
    expectBox(layout.itemBox('next'), cardAt(404.4, 18));
    expectBox(layout.itemBox('last'), cardAt(495.6, 18));
    expect(layout.indent(0)).toBeCloseTo(176.4, 6);
    // A drop goes by the middle of the scheme's half columns, 267.6 + (136.8 − 24) / 2 = 324, not of
    // its card (314.7): before it, between the villain (300..412) and the scheme (460), 436 − 56 =
    // 380; right of it, between the scheme (460..617) and next (650), 633.5 − 56 = 577.5, to 580.
    expect(layout.insertAt({ x: 320, y: 40 }, 112)).toEqual({ x: 380, y: 30 });
    expect(layout.insertAt({ x: 330, y: 40 }, 112)).toEqual({ x: 580, y: 30 });
    expect(layout.rowTop(0)).toBe(0);
    // The frame's 118.2 of content and a 10 line gap; the empty slot, at 586.8, fits the first
    // line, and an empty second line of a card's height and a gap, 104.2; a 20 row gap.
    expect(layout.rowHeight(0)).toBeCloseTo(252.4, 6);
    expect(layout.height).toBeCloseTo(252.4, 6);
    expect(layout.width).toBeCloseTo(586.8 + 67.2, 6);
  });

  it('draws two landscape cards in a row three half columns apart', () => {
    // The main scheme and a side scheme by the villain: 136.8 apart, a gap of 136.8 − 94.2 = 42.6.
    const layout = dockLayout({
      items: [
        frame('frame', -10, 20, 262, 177),
        pile('deck', 0, 30, { anchor: 'frame' }),
        card('villain', 300, 30),
        card('main', 460, 30, { w: 157, h: 112 }),
        card('side', 657, 30, { w: 157, h: 112 }),
        card('minion', 854, 30),
      ],
      rows: [0],
      wrapWidth: 1000,
      ...ROOMS,
    });

    expectBox(layout.itemBox('main'), { x: 267.6, y: 28, w: 94.2, h: 67.2 });
    expectBox(layout.itemBox('side'), { x: 404.4, y: 28, w: 94.2, h: 67.2 });
    // Six half columns past the main scheme: back on a whole slot of the grid.
    expectBox(layout.itemBox('minion'), cardAt(541.2, 28));
    // The empty slot after the minion, at 632.4.
    expect(layout.width).toBeCloseTo(632.4 + 67.2, 6);
  });

  it('wraps a landscape card that does not fit, and lines the cards after it up on half columns', () => {
    // At 450 the side scheme would end at 544.2, past 520: the second line, from −6, to 130.8; the
    // portrait cards after it on 130.8 and 222.
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        ...played(2),
        card('side', 756, 470, { w: 157, h: 112 }),
        card('c3', 953, 470),
        card('c4', 1105, 470),
      ],
      rows: [1],
      wrapWidth: 520,
      ...ROOMS,
    });

    expectBox(layout.itemBox('c2'), cardAt(358.8, 28));
    expectBox(layout.itemBox('side'), { x: -6, y: 138.2, w: 94.2, h: 67.2 });
    expectBox(layout.itemBox('c3'), cardAt(130.8, 138.2));
    expectBox(layout.itemBox('c4'), cardAt(222, 138.2));
  });

  it('keeps a line of portrait cards a slot apart, on whole slots of the grid', () => {
    const layout = dockLayout(playerRow(4, 1000));

    for (const [id, x] of [
      ['identity', 176.4],
      ['c1', 267.6],
      ['c2', 358.8],
      ['c3', 450],
      ['c4', 541.2],
    ] as const) {
      expectBox(layout.itemBox(id), cardAt(x, 28));
    }
  });

  it("wraps a long row onto a second line, from the row's left edge, under the frame", () => {
    // c3 would end at 450 + 67.2 = 517.2, past 500.
    const layout = dockLayout(playerRow(4, 500));

    expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
    expectBox(layout.itemBox('c2'), cardAt(358.8, 28));
    expectBox(layout.itemBox('c3'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c4'), cardAt(85.2, 138.2));
    expect(layout.indent(1)).toBeCloseTo(176.4, 6);
    // 10 + (118.2 + 10) + (94.2 + 10) + 20: the empty slot fits after c4, at 176.4.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
    expect(layout.height).toBeCloseTo(262.4, 6);
  });

  it('wraps a longer row onto three lines, each from the left edge', () => {
    // c3 to c7 fill the second line; c8 at 450 would end at 517.2, past 500.
    const layout = dockLayout(playerRow(9, 500));

    expectBox(layout.itemBox('c3'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c7'), cardAt(358.8, 138.2));
    expectBox(layout.itemBox('c8'), cardAt(-6, 242.4));
    expectBox(layout.itemBox('c9'), cardAt(85.2, 242.4));
    // On the same columns as the first line: c5 under the identity, c6 under c1, c7 under c2.
    expectBox(layout.itemBox('identity'), cardAt(176.4, 28));
    expectBox(layout.itemBox('c5'), cardAt(176.4, 138.2));
    expectBox(layout.itemBox('c6'), cardAt(267.6, 138.2));
    expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
    // The empty slot fits after c9, at 176.4.
    expect(layout.rowHeight(1)).toBeCloseTo(366.6, 6);
  });

  it('draws a row with a hole and a moved card evenly, every unit at the top of its line', () => {
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('c1', 452, 470),
        // A hole before c2; c3 lies lower, c4 far right.
        card('c2', 900, 470),
        card('c3', 950, 530),
        card('c4', 1400, 470),
      ],
      rows: [1],
      wrapWidth: 600,
      ...ROOMS,
    });

    expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
    expectBox(layout.itemBox('c2'), cardAt(358.8, 28));
    expectBox(layout.itemBox('c3'), cardAt(450, 28));
    // It would end at 541.2 + 67.2 = 608.4, past 600.
    expectBox(layout.itemBox('c4'), cardAt(-6, 138.2));
    // Content-sized: 10 + 128.2 + 104.2 + 20, nothing of the 220-unit band of the table.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
  });

  it('orders units by x, then y, then id', () => {
    const layout = dockLayout({
      items: [
        card('b', 452, 470),
        card('a', 452, 470),
        card('low', 452, 510),
        card('first', 300, 560),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // No frame: the grid from 0.
    expectBox(layout.itemBox('first'), cardAt(0, 28));
    expectBox(layout.itemBox('a'), cardAt(91.2, 28));
    expectBox(layout.itemBox('b'), cardAt(182.4, 28));
    expectBox(layout.itemBox('low'), cardAt(273.6, 28));
  });

  it('moves a stack as one unit, as wide and high as its cards, never split', () => {
    // The stack: main at 700, tucked cards 10 right and 20 down each, 132 × 197 in all, drawn
    // 79.2 × 118.2: two half columns, a slot. At 267.6 it would end at 346.8, past 340: it starts the second
    // line.
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('main', 700, 470),
        card('t1', 710, 490, { anchor: 'main' }),
        card('t2', 720, 510, { anchor: 'main' }),
        card('next', 900, 470),
      ],
      rows: [1],
      wrapWidth: 340,
      ...ROOMS,
    });

    expectBox(layout.itemBox('main'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('t1'), cardAt(0, 150.2));
    expectBox(layout.itemBox('t2'), cardAt(6, 162.2));
    // On the column after the stack's: on the second line too.
    expectBox(layout.itemBox('next'), cardAt(85.2, 138.2));
    // A point of a tucked card follows its stack.
    expectPoint(layout.toDisplay({ x: 730, y: 540 }, 't2'), { x: 12, y: 180.2 });
  });

  it('turns an exhausted card in place on its column: exhausting never reflows the row', () => {
    // Turned 15°, a portrait card spans 112 cos 15° + 157 sin 15° across, about its middle: 89.3
    // drawn, within a slot, so two half columns.
    const turned = 112 * Math.cos(Math.PI / 12) + 157 * Math.sin(Math.PI / 12);
    expect(turned * 0.6).toBeLessThan(91.2);
    const row = (exhausted: boolean) =>
      dockLayout({
        items: [
          ...PLAYER_PILES.slice(0, 3),
          card('identity', 300, 470, { exhausted }),
          card('c1', 452, 470, { exhausted }),
          card('c2', 604, 470),
        ],
        rows: [1],
        wrapWidth: 1000,
        ...ROOMS,
      });

    for (const layout of [row(true), row(false)]) {
      expectBox(layout.itemBox('identity'), cardAt(176.4, 28));
      expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
      expectBox(layout.itemBox('c2'), cardAt(358.8, 28));
    }
  });

  it("starts a wrapped exhausted card's box on the first column", () => {
    const turned = 112 * Math.cos(Math.PI / 12) + 157 * Math.sin(Math.PI / 12);
    const reach = ((turned - 112) / 2) * 0.6;
    // c1's box on the column at 267.6, its tilt a reach right of it: it would end at 345.8, past
    // 300.
    const layout = dockLayout({
      items: [...PLAYER_PILES, card('c1', 452, 470, { exhausted: true })],
      rows: [1],
      wrapWidth: 300,
      ...ROOMS,
    });

    expect(267.6 + 67.2 + reach).toBeGreaterThan(300);
    expectBox(layout.itemBox('c1'), cardAt(-6, 138.2));
  });

  it('keeps a marker by its card, and draws it at 0.6', () => {
    // The token, 40 past c7's right edge (1476), makes c7's unit 1600 − 1364 = 236 wide, 141.6
    // drawn, four half columns: from 358.8 it would end at 500.4, past 500, so it starts the third line.
    const items = [
      ...playerRow(7, 500).items,
      { id: 'token', x: 1516, y: 510, w: 84, h: 70, kind: 'marker' as const, anchor: 'c7' },
    ];
    const layout = dockLayout({ ...playerRow(7, 500), items });

    expectBox(layout.itemBox('c7'), cardAt(-6, 242.4));
    expectBox(layout.itemBox('token'), { x: 85.2, y: 266.4, w: 50.4, h: 42 });
    // The empty slot fits after its four half columns, at 176.4: three lines.
    expect(layout.rowHeight(1)).toBeCloseTo(366.6, 6);
  });

  it('keeps the frames and piles left of the indent on line 0, at their scaled place', () => {
    const layout = dockLayout(playerRow(3, 400));

    expectBox(layout.itemBox('frame'), { x: -6, y: 22, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('deck'), cardAt(0, 28));
    expectBox(layout.itemBox('discard'), cardAt(78, 28));
    expectBox(layout.itemBox('identity'), cardAt(176.4, 28));
    expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
    expectBox(layout.itemBox('c2'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c3'), cardAt(85.2, 138.2));
  });

  it('keeps the piles of a row alone on its first line, its indent 0, its empty slot past the frame', () => {
    const layout = dockLayout({
      items: PLAYER_PILES.slice(0, 3),
      rows: [1],
      wrapWidth: 50,
      ...ROOMS,
    });

    expect(layout.indent(1)).toBe(0);
    expectBox(layout.itemBox('discard'), cardAt(78, 28));
    // Its first line, and the empty second one.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
    // The slot on the first column past (252 + 40) × 0.6 = 175.2: 176.4 to 243.6.
    expect(layout.width).toBeCloseTo(243.6, 6);
  });

  it('flows a scenario deck frame past the indent of the villain row as one unit with its piles', () => {
    const layout = dockLayout({
      items: [
        frame('encounter', -10, 20, 262, 177),
        pile('deck', 0, 30, { anchor: 'encounter' }),
        pile('discard', 130, 30, { anchor: 'encounter' }),
        // A compact scenario deck before the first villain: line 0, left of the indent.
        frame('crew1', 290, 20, 200, 132),
        pile('crew1-deck', 300, 30, { w: 80, h: 112, anchor: 'crew1' }),
        pile('crew1-discard', 400, 30, { w: 80, h: 112, anchor: 'crew1' }),
        card('villain1', 540, 30),
        card('scheme', 700, 30, { w: 157, h: 112 }),
        // The next villain's scenario deck, in the middle of the row: 200 × 132, drawn 120 × 79.2.
        frame('crew2', 900, 20, 200, 132),
        pile('crew2-deck', 910, 30, { w: 80, h: 112, anchor: 'crew2' }),
        pile('crew2-discard', 1010, 30, { w: 80, h: 112, anchor: 'crew2' }),
        card('villain2', 1160, 30),
      ],
      rows: [0],
      wrapWidth: 550,
      ...ROOMS,
    });

    // Indent 358.8 (villain 1, on the first column past crew1's frame and a gap:
    // (490 + 40) × 0.6 = 318).
    expect(layout.indent(0)).toBeCloseTo(358.8, 6);
    expectBox(layout.itemBox('crew1'), { x: 174, y: 22, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew1-discard'), { x: 240, y: 28, w: 48, h: 67.2 });
    expectBox(layout.itemBox('villain1'), cardAt(358.8, 28));
    // The scheme on three half columns, to 586.8.
    expectBox(layout.itemBox('scheme'), { x: 450, y: 28, w: 94.2, h: 67.2 });
    // crew2, 120 wide (three half columns), at 586.8 would end past 550: the second line, from the
    // first half column, its piles with it, the frame at the top.
    expectBox(layout.itemBox('crew2'), { x: -6, y: 138.2, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew2-deck'), { x: 0, y: 144.2, w: 48, h: 67.2 });
    expectBox(layout.itemBox('crew2-discard'), { x: 60, y: 144.2, w: 48, h: 67.2 });
    expectBox(layout.itemBox('villain2'), cardAt(130.8, 138.2));
    // 10 + 128.2 + 104.2 + 20: the empty slot fits after villain 2, at 222.
    expect(layout.height).toBeCloseTo(262.4, 6);
  });

  it('stacks the shown rows only in the focus view', () => {
    const layout = dockLayout({
      items: [
        frame('encounter', -10, 20, 262, 177),
        pile('encounter-deck', 0, 30, { anchor: 'encounter' }),
        card('villain', 300, 30),
        pile('p1-deck', 0, 470),
        frame('p2-frame', -10, 680, 262, 177),
        pile('p2-deck', 0, 690, { anchor: 'p2-frame' }),
        card('p2-identity', 300, 690),
      ],
      rows: [0, 2],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // Each row two lines tall: 10 + 128.2 + 104.2 + 20.
    expect(layout.rowTop(0)).toBe(0);
    expect(layout.rowHeight(0)).toBeCloseTo(262.4, 6);
    expect(layout.rowTop(2)).toBeCloseTo(262.4, 6);
    expect(layout.rowTop(1)).toBeNull();
    expect(layout.itemBox('p1-deck')).toBeNull();
    expectBox(layout.itemBox('p2-frame'), { x: -6, y: 284.4, w: 157.2, h: 106.2 });
    // Both rows on the same columns: the villain over the identity.
    expectBox(layout.itemBox('villain'), cardAt(176.4, 28));
    expectBox(layout.itemBox('p2-identity'), cardAt(176.4, 290.4));
    // A point of row 2 is drawn with the unit it lies past: the identity (300, drawn 176.4), 70
    // under its top.
    expectPoint(layout.toDisplay({ x: 500, y: 760 }), { x: 296.4, y: 332.4 });
    expect(layout.toDisplay({ x: 500, y: 560 })).toBeNull();
    expect(layout.height).toBeCloseTo(524.8, 6);
  });

  it('brings a drawn point on every line back to the table, and there again', () => {
    const layout = dockLayout(playerRow(9, 500));
    const points = [
      // Line 0, left of the identity: over the piles, scaled back.
      { drawn: { x: 50, y: 60 }, table: { x: 83.333333, y: 523.333333 } },
      // Line 0, with the identity (300, drawn 176.4): 300 + 73.6 / 0.6, 470 + (60 − 28) / 0.6.
      { drawn: { x: 250, y: 60 }, table: { x: 422.666667, y: 523.333333 } },
      // Line 1, under the frame, with c3 (756, drawn −6): 756 + 26 / 0.6, 470 + 61.8 / 0.6.
      { drawn: { x: 20, y: 200 }, table: { x: 799.333333, y: 573 } },
      // Line 1, with c6 (1212, drawn 267.6): 1212 + 32.4 / 0.6.
      { drawn: { x: 300, y: 200 }, table: { x: 1266, y: 573 } },
      // Line 2, past c9 (1668, drawn 85.2): 1668 + 64.8 / 0.6, 470 + 57.6 / 0.6.
      { drawn: { x: 150, y: 300 }, table: { x: 1776, y: 566 } },
    ];

    for (const { drawn, table } of points) {
      expectPoint(layout.toTable(drawn), table);
      expectPoint(layout.toDisplay(layout.toTable(drawn)), drawn);
    }
  });

  it('counts a point below the table in the last line, and one above in line 0, within the row', () => {
    const layout = dockLayout(playerRow(9, 500));

    // With c9 (1668, drawn 85.2): 1668 + 164.8 / 0.6, the height kept on the row's last unit,
    // 440 + 219.
    expectPoint(layout.toTable({ x: 250, y: 1000 }), { x: 1942.666667, y: 659 });
    expectPoint(layout.toTable({ x: 250, y: -50 }), { x: 422.666667, y: 440 });
  });

  it('puts one unit on each line when the wrap width is narrower than a card', () => {
    const layout = dockLayout(playerRow(2, 50));

    expectBox(layout.itemBox('identity'), cardAt(176.4, 28));
    expectBox(layout.itemBox('c1'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c2'), cardAt(-6, 242.4));
    // 10 + 128.2 + 104.2 + 104.2 + 20, and a line of 104.2 for the empty slot.
    expect(layout.height).toBeCloseTo(366.6 + 104.2, 6);
  });

  it('keeps a row whose units fit its first line two lines tall, the second one empty', () => {
    const layout = dockLayout(playerRow(2, 1000));

    expectBox(layout.itemBox('c2'), cardAt(358.8, 28));
    // 10 + 128.2, then an empty line of a card's height, 94.2 + 10, and the row gap.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
  });

  it('knows no unknown item', () => {
    const layout = dockLayout(playerRow(1, 500));

    expect(layout.itemBox('nope')).toBeNull();
    // An unknown id is drawn with the unit its point lies past: c1, at 452, drawn 267.6.
    expectPoint(layout.toDisplay({ x: 500, y: 510 }, 'nope'), { x: 296.4, y: 52 });
  });

  it('needs a row to show', () => {
    expect(() => dockLayout({ items: [], rows: [], wrapWidth: 500 })).toThrow();
  });
});

describe('an owner line wider than its frame in dock mode', () => {
  // The villain's row of a Crossbones game: the encounter frame (−10..252, drawn −6..151.2), the
  // Experimental Weapons frame 40 past it (292..424, drawn 175.2..254.4) and the villain at 474.
  // At a zoom of 0.558, the villain's line (its avatar, Victory and Set-aside chips) is drawn 217
  // wide from the frame's left edge, to 211, past the frame's 157.2 and over the next frame.
  const CROSSBONES: DockItem[] = [
    frame('encounter', -10, 20, 262, 177),
    pile('deck', 0, 30, { anchor: 'encounter' }),
    pile('discard', 130, 30, { anchor: 'encounter' }),
    frame('weapons', 292, 20, 132, 177),
    pile('weapons-deck', 302, 30, { anchor: 'weapons' }),
    card('villain', 474, 30),
  ];

  function crossbones(lineWidths?: Map<string, number>): DockLayoutInput {
    return { items: CROSSBONES, rows: [0], wrapWidth: 1000, ...ROOMS, lineWidths };
  }

  it('draws the frames at their scaled place when no line passes its frame', () => {
    const layout = dockLayout(crossbones(new Map([['encounter', 150]])));

    expectBox(layout.itemBox('weapons'), { x: 175.2, y: 22, w: 79.2, h: 106.2 });
    // The first half column past (424 + 40) × 0.6 = 278.4: 313.2.
    expectBox(layout.itemBox('villain'), cardAt(313.2, 28));
  });

  it("starts the next frame on the first half column past the line's end and a gap", () => {
    const layout = dockLayout(crossbones(new Map([['encounter', 217]])));

    // The encounter frame takes the line's 217, to 211; a 24 gap: 235, on the half column 267.6.
    expectBox(layout.itemBox('encounter'), { x: -6, y: 22, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('discard'), cardAt(78, 28));
    expectBox(layout.itemBox('weapons'), { x: 267.6, y: 22, w: 79.2, h: 106.2 });
    expectBox(layout.itemBox('weapons-deck'), cardAt(273.6, 28));
    // The villain on the first half column past 267.6 + 79.2 + 24 = 370.8: 404.4.
    expectBox(layout.itemBox('villain'), cardAt(404.4, 28));
    expect(layout.indent(0)).toBeCloseTo(404.4, 6);
    // A point of the moved frame is drawn with it (92.4 right of its scaled place), and back.
    expectPoint(layout.toDisplay({ x: 358, y: 108 }), { x: 307.2, y: 74.8 });
    expectPoint(layout.toTable({ x: 307.2, y: 74.8 }), { x: 358, y: 108 });
    expectPoint(layout.toDisplay({ x: 130, y: 30 }), { x: 78, y: 28 });
    // The empty slot two half columns past the villain: 495.6 to 562.8.
    expect(layout.width).toBeCloseTo(562.8, 6);
  });

  it("starts a row's units past its last frame's line", () => {
    // Alex's frame (−6..151.2) with a line 200 wide, to 194: the identity on the first half column
    // past 194 + 24 = 218, 222, rather than 176.4.
    const layout = dockLayout(playerRow(0, 1000, { lineWidths: new Map([['frame', 200]]) }));

    expectBox(layout.itemBox('identity'), cardAt(222, 28));
    expect(layout.width).toBeGreaterThanOrEqual(194);
  });

  it('gives a frame flowing among the units as many half columns as its line needs', () => {
    // A scenario deck after a card: drawn 120 wide, its line 200: five half columns (4.39), so the
    // card after it starts 228 past it.
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        frame('crew', 460, 460, 200, 132),
        pile('crew-deck', 470, 470, { w: 80, h: 112, anchor: 'crew' }),
        card('after', 700, 470),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
      lineWidths: new Map([['crew', 200]]),
    });

    expectBox(layout.itemBox('crew'), { x: 267.6, y: 28, w: 120, h: 79.2 });
    expectBox(layout.itemBox('after'), cardAt(495.6, 28));
  });
});

describe('a row of no seat in dock mode', () => {
  // A one-player game: Nick Fury dropped at (300, 760), in row 2 (660..880), which no seat has. It
  // flows in player 1's block after its own units: the identity at 176.4, c1 at 267.6, c2 at 358.8,
  // then Fury on the next column, 450, on line 0 (its top 10, its units 18 under it); the empty
  // slot at 541.2 fits the 1000 wrap width. Fury is drawn 450 − 300 × 0.6 = 270 right of its
  // scaled table x.
  const folded = () =>
    dockLayout({
      ...playerRow(2, 1000),
      items: [...playerRow(2, 1000).items, card('fury', 300, 760)],
      seatRows: [1],
    });

  it('is drawn in the block of the last seat row above it, after its units', () => {
    const layout = folded();

    expectBox(layout.itemBox('fury'), cardAt(450, 28));
    expect(layout.rowTop(2)).toBeNull();
    // 10 + 128.2 + 104.2 + 20, as without Fury.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
    expect(layout.width).toBeCloseTo(541.2 + 67.2, 6);
  });

  it('draws a point of its row with its units, and brings it back to its row', () => {
    const layout = folded();

    // With Fury: 320 × 0.6 + 270, 28 + 20 × 0.6.
    expectPoint(layout.toDisplay({ x: 320, y: 780 }), { x: 462, y: 40 });
    expectPoint(layout.toTable({ x: 462, y: 40 }), { x: 320, y: 780 });
  });

  it("takes a drop on its slot into the seat row's band, after the row's own units", () => {
    const layout = folded();

    // Left of Fury's middle (483.6), after it, or on the empty slot: past c2 (604..716), 756 up
    // to the grid, at player 1's card y.
    expect(layout.insertAt({ x: 480, y: 60 }, 112)).toEqual({ x: 760, y: 470 });
    expect(layout.insertAt({ x: 500, y: 60 }, 112)).toEqual({ x: 760, y: 470 });
    expect(layout.insertAt({ x: 560, y: 60 }, 112)).toEqual({ x: 760, y: 470 });
    // On the empty second line too.
    expect(layout.insertAt({ x: 50, y: 180 }, 112)).toEqual({ x: 760, y: 470 });
    // Fury dragged and dropped back on its own slot keeps its spot.
    expect(layout.insertAt({ x: 480, y: 60 }, 112, new Set(['fury']))).toEqual({ x: 300, y: 760 });
  });

  it('keeps every seat row in its own block', () => {
    // A two-player game: player 2's identity in row 2 stays there, under player 1's row.
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        frame('p2-frame', -10, 680, 262, 177),
        card('p2-identity', 300, 690),
      ],
      rows: [1, 2],
      seatRows: [1, 2],
      wrapWidth: 1000,
      ...ROOMS,
    });

    expect(layout.rowTop(2)).toBeCloseTo(262.4, 6);
    expectBox(layout.itemBox('p2-identity'), cardAt(176.4, 262.4 + 28));
  });
});

describe('blockRowOf', () => {
  it('is the row itself for the villain row, a seat row, or a row under no seat row', () => {
    expect(blockRowOf(0, [1])).toBe(0);
    expect(blockRowOf(2, [1, 2])).toBe(2);
    expect(blockRowOf(2, [])).toBe(2);
    expect(blockRowOf(1, [2])).toBe(1);
  });

  it('is the last seat row above a row of no seat', () => {
    expect(blockRowOf(2, [1])).toBe(1);
    expect(blockRowOf(5, [1, 3])).toBe(3);
    expect(blockRowOf(3, [2, 1])).toBe(2);
  });
});

describe('dockLayout at an infinite wrap width', () => {
  it('wraps nothing: every unit on the first line, a slot apart', () => {
    const layout = dockLayout({
      items: [...PLAYER_PILES, ...played(8)],
      rows: [1],
      wrapWidth: Number.POSITIVE_INFINITY,
      ...ROOMS,
    });

    // c8 is the ninth unit: 176.4 + 8 × 91.2.
    expectBox(layout.itemBox('c8'), cardAt(906, 28));
    expectPoint(layout.toTable({ x: 906, y: 28 }), { x: 1516, y: 470 });
  });
});

describe('a drop on a row of dock mode (insertAt)', () => {
  // playerRow(4, 500): the identity, c1 and c2 on line 0, their slots' middles at 210, 301.2 and
  // 392.4; c3 and c4 on line 1, from the left edge, at 27.6 and 118.8, the empty slot after c4, at
  // 176.4. On the table, c1 runs 452..564, c2 604..716, c3 756..868, c4 908..1020. A portrait card
  // is 112 wide.
  const layout = () => dockLayout(playerRow(4, 500));

  it('goes between the two units around it: the middle of their gap, on the grid, at the first one’s y', () => {
    // Before c2: (564 + 604) / 2 − 56 = 528, to 530.
    expect(layout().insertAt({ x: 350, y: 60 }, 112)).toEqual({ x: 530, y: 470 });
    // A landscape card: 584 − 78.5 = 505.5, to 510.
    expect(layout().insertAt({ x: 350, y: 60 }, 157)).toEqual({ x: 510, y: 470 });
  });

  it("goes after a line's last unit, before the next line's first", () => {
    // Between c2 and c3: (716 + 756) / 2 − 56 = 680.
    expect(layout().insertAt({ x: 450, y: 60 }, 112)).toEqual({ x: 680, y: 470 });
  });

  it('goes before the first unit of a wrapped line when dropped left of its middle, under the frame', () => {
    // Left of c3's middle on line 1: before c3, the spot after c2.
    expect(layout().insertAt({ x: 0, y: 200 }, 112)).toEqual({ x: 680, y: 470 });
    expect(layout().insertAt({ x: -20, y: 200 }, 112)).toEqual({ x: 680, y: 470 });
    // Past it, between c3 and c4: (868 + 908) / 2 − 56 = 832, to 830.
    expect(layout().insertAt({ x: 100, y: 200 }, 112)).toEqual({ x: 830, y: 470 });
  });

  it('goes after the last unit, or in the empty slot, 40 past its right edge at the row’s card y', () => {
    expect(layout().insertAt({ x: 150, y: 160 }, 112)).toEqual({ x: 1060, y: 470 });
    expect(layout().insertAt({ x: 200, y: 180 }, 112)).toEqual({ x: 1060, y: 470 });
    expect(layout().insertAt({ x: 396, y: 180 }, 112)).toEqual({ x: 1060, y: 470 });
  });

  it('goes before the first unit when dropped left of the indent', () => {
    // Between the frame's right edge (252) and the identity (300): 276 − 56 = 220, at the row's y.
    expect(layout().insertAt({ x: 50, y: 60 }, 112)).toEqual({ x: 220, y: 470 });
  });

  it('leaves the dragged units out, and keeps a card dropped back in its own place where it lies', () => {
    const c1 = new Set(['c1']);
    // Past c2 without c1: between c2 and c3.
    expect(layout().insertAt({ x: 450, y: 60 }, 112, c1)).toEqual({ x: 680, y: 470 });
    // Between the identity and c2, where c1 lies: its own spot.
    expect(layout().insertAt({ x: 300, y: 60 }, 112, c1)).toEqual({ x: 452, y: 470 });
  });

  it('goes after the last unit when dropped anywhere on the empty second line of a short row', () => {
    // playerRow(2, 1000): the identity, c1 and c2 on the first line; the second, from 138.2, empty.
    // After c2 (604..716): 756, up to the grid.
    const short = dockLayout(playerRow(2, 1000));

    expect(short.insertAt({ x: 300, y: 180 }, 112)).toEqual({ x: 760, y: 470 });
    expect(short.insertAt({ x: 50, y: 180 }, 112)).toEqual({ x: 760, y: 470 });
    // From the row's left edge, under the frame.
    expect(short.insertAt({ x: -6, y: 180 }, 112)).toEqual({ x: 760, y: 470 });
    // A point there reads with c2 (604, drawn 358.8, on line 0): 604 + (−6 − 358.8) / 0.6, and
    // 470 + (180 − 28) / 0.6 kept within the row, 440 + 219.
    expectPoint(short.toTable({ x: -6, y: 180 }), { x: -4, y: 659 });
  });

  it('goes into the row it is dropped on', () => {
    // The villain row (its first line 10 to 128.2, its empty second line to 242.4), then player
    // 1's row from 262.4, its first line from 272.4.
    const twoRows = dockLayout({
      items: [frame('encounter', -10, 20, 262, 177), card('villain', 300, 30), ...PLAYER_PILES],
      rows: [0, 1],
      wrapWidth: 500,
      ...ROOMS,
    });

    // Past the villain (300..412): 412 + 40, up to the grid, at the villain row's card y.
    expect(twoRows.insertAt({ x: 300, y: 60 }, 112)).toEqual({ x: 460, y: 30 });
    // On the villain row's empty second line: after its last unit too.
    expect(twoRows.insertAt({ x: 100, y: 200 }, 112)).toEqual({ x: 460, y: 30 });
    // Past the identity in player 1's row.
    expect(twoRows.insertAt({ x: 300, y: 320 }, 112)).toEqual({ x: 460, y: 470 });
  });

  it('measures a stack by all its cards', () => {
    const stacked = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('main', 452, 470),
        card('tucked', 472, 510, { anchor: 'main' }),
        card('next', 700, 470),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // The two cards' stack, 79.2 drawn, holds two half columns, from 267.6, its middle 301.2; next the
    // column after it, from 358.8, its middle 392.4.
    expectBox(stacked.itemBox('main'), cardAt(267.6, 28));
    expectBox(stacked.itemBox('next'), cardAt(358.8, 28));
    // Between the stack's right edge (584) and next: (584 + 700) / 2 − 56 = 586, to 590.
    expect(stacked.insertAt({ x: 380, y: 60 }, 112)).toEqual({ x: 590, y: 470 });
    // Left of the stack's middle: before it, between the identity (412) and the stack (452),
    // 432 − 56 = 376, to 380.
    expect(stacked.insertAt({ x: 290, y: 60 }, 112)).toEqual({ x: 380, y: 470 });
    // The tucked card dragged away: the stack ends at 564, (564 + 700) / 2 − 56 = 576, to 580.
    expect(stacked.insertAt({ x: 380, y: 60 }, 112, new Set(['tucked']))).toEqual({
      x: 580,
      y: 470,
    });
  });

  it('stays strictly between two units with no grid line between them', () => {
    const close = dockLayout({
      items: [...PLAYER_PILES, card('a', 452, 470), card('b', 455, 470)],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // Before b: at a's x, a grid line lower, so that it sorts after a and before b.
    expect(close.insertAt({ x: 380, y: 60 }, 112)).toEqual({ x: 452, y: 480 });
  });
});

describe('a drag previewed on the rows', () => {
  // playerRow(4, 1000): the identity, c1 to c4 on the first line, on the columns 176.4, 267.6,
  // 358.8, 450 and 541.2, 28 down (10 + 18); the empty slot on 632.4. A drop's middle drawn at 350,
  // left of c2's middle (392.4), goes between c1 (452..564) and c2 (604): 530.
  const wide = () => playerRow(4, 1000);
  const HAND_CARD = { unitId: 'h', insertAt: { x: 530, y: 470 }, size: { w: 112, h: 157 } };

  it('opens a slot where the drop goes, the units after it moved on a column', () => {
    expect(dockLayout(wide()).insertAt({ x: 350, y: 60 }, 112)).toEqual(HAND_CARD.insertAt);

    const layout = dockLayout({ ...wide(), preview: HAND_CARD });

    expectBox(layout.itemBox('identity'), cardAt(176.4, 28));
    expectBox(layout.itemBox('c1'), cardAt(267.6, 28));
    // The card from the hand, drawn in its slot as if played there already.
    expectBox(layout.itemBox('h'), cardAt(358.8, 28));
    expectBox(layout.itemBox('c2'), cardAt(450, 28));
    expectBox(layout.itemBox('c3'), cardAt(541.2, 28));
    expectBox(layout.itemBox('c4'), cardAt(632.4, 28));
    // The empty slot after c4, at 723.6.
    expect(layout.width).toBeCloseTo(723.6 + 67.2, 6);
  });

  it('wraps the units it pushes past the wrap width onto the next line', () => {
    // playerRow(4, 500): c3 and c4 start the second line, at 138.2. With the card in before c2,
    // c2 would end at 450 + 67.2 = 517.2, past 500: it starts the second line, c3 and c4 after it.
    const layout = dockLayout({ ...playerRow(4, 500), preview: HAND_CARD });

    expectBox(layout.itemBox('h'), cardAt(358.8, 28));
    expectBox(layout.itemBox('c2'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c3'), cardAt(85.2, 138.2));
    expectBox(layout.itemBox('c4'), cardAt(176.4, 138.2));
    // The empty slot follows c4 on the same line: the row keeps its height.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
  });

  it('closes the slot a table card leaves, and draws it where it goes', () => {
    // c1 dragged, its middle at 520: past c3's middle (483.6), before c4's (574.8). Between c3
    // (756..868) and c4 (908): (868 + 908) / 2 − 56 = 832, to 830, at c3's y.
    const insertAt = dockLayout(wide()).insertAt({ x: 520, y: 60 }, 112, new Set(['c1']));
    expect(insertAt).toEqual({ x: 830, y: 470 });

    const layout = dockLayout({ ...wide(), preview: { unitId: 'c1', insertAt } });

    expectBox(layout.itemBox('c2'), cardAt(267.6, 28));
    expectBox(layout.itemBox('c3'), cardAt(358.8, 28));
    expectBox(layout.itemBox('c1'), cardAt(450, 28));
    expectBox(layout.itemBox('c4'), cardAt(541.2, 28));
  });

  const STACKED: DockItem[] = [
    ...PLAYER_PILES,
    card('main', 452, 470),
    card('tucked', 472, 510, { anchor: 'main' }),
    card('next', 700, 470),
  ];
  const stacked = (unitId: string): DockLayoutInput => ({
    items: STACKED,
    rows: [1],
    wrapWidth: 1000,
    ...ROOMS,
    preview: { unitId, insertAt: { x: 760, y: 470 } },
  });

  it('moves a stack with everything that travels with it', () => {
    const layout = dockLayout(stacked('main'));

    expectBox(layout.itemBox('next'), cardAt(267.6, 28));
    expectBox(layout.itemBox('main'), cardAt(358.8, 28));
    // 20 right of and 40 under its main card on the table: 12 and 24 drawn.
    expectBox(layout.itemBox('tucked'), cardAt(370.8, 52));
  });

  it('takes a tucked card out of its stack, which stays where it is', () => {
    const layout = dockLayout(stacked('tucked'));

    expectBox(layout.itemBox('main'), cardAt(267.6, 28));
    expectBox(layout.itemBox('next'), cardAt(358.8, 28));
    expectBox(layout.itemBox('tucked'), cardAt(450, 28));
  });

  it('keeps a marker where it lies, re-anchored as it is once the drop is made', () => {
    // The first player token (460..544) lies 46 left of the played card (590..), 48 right of the
    // identity (..412): it lies by the played card. The server never moves a marker: once the
    // played card is dropped past the other card, the token lies by the identity.
    const table = (playedAt: Point): DockTable => ({
      cards: [
        fixtureCard('identity', { x: 300, y: 470 }),
        fixtureCard('played', playedAt),
        fixtureCard('other', { x: 750, y: 470 }),
      ],
      piles: [],
      frames: [],
      markers: { firstPlayer: { x: 460, y: 510 } },
      sizeOf: () => 'std',
    });
    const input = (items: readonly DockItem[]): DockLayoutInput => ({
      items,
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });
    const token = markerItemId('firstPlayer');
    const items = dockItems(table({ x: 590, y: 470 }));
    expect(items.find((item) => item.id === token)?.anchor).toBe('played');
    // The played card dragged past the other card.
    const insertAt = dockLayout(input(items)).insertAt({ x: 900, y: 60 }, 112, new Set(['played']));

    const preview = dockLayout({ ...input(items), preview: { unitId: 'played', insertAt } });
    const dropped = dockLayout(input(dockItems(table(insertAt))));

    expectBox(preview.itemBox(token), dropped.itemBox(token) as Placement);
    expectBox(preview.itemBox('played'), dropped.itemBox('played') as Placement);
  });

  it('needs the size of a card that is not on the table', () => {
    const sizeless = { unitId: HAND_CARD.unitId, insertAt: HAND_CARD.insertAt };

    expect(() => dockLayout({ ...wide(), preview: sizeless })).toThrow(/size/);
  });

  it('tells how far each item is drawn from where it lies drawn without the preview', () => {
    const base = dockLayout(wide());
    const preview = dockLayout({ ...wide(), preview: HAND_CARD });
    const ids = [...PLAYER_PILES, ...played(4)].map((item) => item.id);

    const shifts = dockShifts(base, preview, ids);

    // Only the cards pushed along, a column each; the card from the hand is not on the table.
    expect([...shifts.keys()]).toEqual(['c2', 'c3', 'c4']);
    for (const shift of shifts.values()) {
      expectPoint(shift, { x: 91.2, y: 0 });
    }
  });
});

describe('dockFitWidth', () => {
  it("is the widest row's indent and three slots of a drawn card and a drawn gap", () => {
    // The villain row's indent is the first column, −6 (no frame in it), player 1's 176.4:
    // 176.4 + 3 × (112 + 40) × 0.6.
    const items = [card('villain', 0, 30), ...PLAYER_PILES, ...played(2)];
    expect(dockFitWidth(items, [0, 1])).toBeCloseTo(176.4 + 3 * 91.2, 6);
  });

  it('leaves out the rows not shown, and counts a row of piles alone from 0', () => {
    expect(dockFitWidth(PLAYER_PILES, [0])).toBeCloseTo(3 * 91.2, 6);
    expect(dockFitWidth(PLAYER_PILES.slice(0, 3), [1])).toBeCloseTo(3 * 91.2, 6);
  });
});
