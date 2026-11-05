import type { Placement } from './dockPiles';
import { dockLayout, type DockItem, type DockLayoutInput } from './dockLayout';

// Every expected value below is worked out by hand, in drawn units (table units × 0.6). The rooms
// are set in each test: a 10-unit name room above a row's lines, a 10-unit gap under each line and
// a 20-unit gap under each row.
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

// Player 1's row (table top 380): the owner frame around the deck and the discard, the identity at
// 300, then played cards 152 apart (a card and a 40 gap). Drawn: the frame at x −6, the deck at 0,
// the discard at 78, the identity at 180 (the indent); cards are 67.2 × 94.2, 18 below their
// line's top, the frame 12 below it and 106.2 high (its line holds 118.2 of content).
const PLAYER_PILES: DockItem[] = [
  frame('frame', -10, 400, 262, 177),
  pile('deck', 0, 410, { anchor: 'frame' }),
  pile('discard', 130, 410, { anchor: 'frame' }),
  card('identity', 300, 410),
];

/** Played cards c1, c2, … at 452, 604, 756, … (drawn 271.2, 362.4, 453.6, 544.8, 636, 727.2, 818.4, 909.6). */
function played(count: number): DockItem[] {
  return Array.from({ length: count }, (_, i) => card(`c${i + 1}`, 452 + 152 * i, 410));
}

function playerRow(
  count: number,
  wrapWidth: number,
  more: Partial<DockLayoutInput> = {},
): DockLayoutInput {
  return { items: [...PLAYER_PILES, ...played(count)], rows: [1], wrapWidth, ...ROOMS, ...more };
}

describe('dockLayout', () => {
  it('draws a row that fits the wrap width at 0.6 of the table, nothing moved', () => {
    // The villain's row alone, without a name room: every box is the table's, scaled.
    const layout = dockLayout({
      items: [
        frame('frame', -10, 20, 262, 177),
        pile('deck', 0, 30, { anchor: 'frame' }),
        pile('discard', 130, 30, { anchor: 'frame' }),
        card('villain', 300, 30),
        card('scheme', 460, 30, { w: 157, h: 112 }),
      ],
      rows: [0],
      wrapWidth: 1000,
      nameRoom: 0,
      lineGap: 10,
      rowGap: 20,
    });

    expectBox(layout.itemBox('frame'), { x: -6, y: 12, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('deck'), { x: 0, y: 18, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('discard'), { x: 78, y: 18, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('villain'), { x: 180, y: 18, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('scheme'), { x: 276, y: 18, w: 94.2, h: 67.2 });
    expectPoint(layout.toDisplay({ x: 500, y: 100 }), { x: 300, y: 60 });
    expect(layout.indent(0)).toBeCloseTo(180, 6);
    expect(layout.rowTop(0)).toBe(0);
    // The frame's 118.2 of content, a 10 line gap and a 20 row gap.
    expect(layout.rowHeight(0)).toBeCloseTo(148.2, 6);
    expect(layout.height).toBeCloseTo(148.2, 6);
  });

  it('takes another scale', () => {
    const layout = dockLayout({
      items: [card('a', 300, 30)],
      rows: [0],
      wrapWidth: 1000,
      scale: 0.5,
      ...ROOMS,
    });

    expectBox(layout.itemBox('a'), { x: 150, y: 25, w: 56, h: 78.5 });
  });

  it('wraps a long row onto a second line, from the indent', () => {
    // Line width 500 − 180 − 67.2 = 252.8: line 0 ends at 432.8.
    const layout = dockLayout(playerRow(4, 500));

    expectBox(layout.itemBox('c1'), { x: 271.2, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c2'), { x: 362.4, y: 28, w: 67.2, h: 94.2 });
    // Line 1 starts 128.2 below line 0 (118.2 + 10): its top at 138.2.
    expectBox(layout.itemBox('c3'), { x: 200.8, y: 156.2, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c4'), { x: 292, y: 156.2, w: 67.2, h: 94.2 });
    // 10 + 128.2 + (112.2 + 10) + 20.
    expect(layout.rowHeight(1)).toBeCloseTo(280.4, 6);
    expect(layout.height).toBeCloseTo(280.4, 6);
  });

  it('wraps a longer row onto three lines', () => {
    const layout = dockLayout(playerRow(7, 500));

    expectBox(layout.itemBox('c5'), { x: 383.2, y: 156.2, w: 67.2, h: 94.2 });
    // Line 2 starts at 138.2 + 122.2 = 260.4, drawn 2 × 252.8 left of the table's scaled x.
    expectBox(layout.itemBox('c6'), { x: 221.6, y: 278.4, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c7'), { x: 312.8, y: 278.4, w: 67.2, h: 94.2 });
    expect(layout.rowHeight(1)).toBeCloseTo(402.6, 6);
  });

  it('never splits a stack: its tucked cards take the main card’s line', () => {
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('main', 700, 410),
        // 720 × 0.6 = 432 is still on line 0, but 740 × 0.6 = 444 is past its end, 432.8.
        card('t1', 720, 430, { anchor: 'main' }),
        card('t2', 740, 450, { anchor: 'main' }),
        card('next', 760, 410),
      ],
      rows: [1],
      wrapWidth: 500,
      ...ROOMS,
    });

    expectBox(layout.itemBox('main'), { x: 420, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('t1'), { x: 432, y: 40, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('t2'), { x: 444, y: 52, w: 67.2, h: 94.2 });
    // The stack's lowest card makes line 0 (70 + 157) × 0.6 = 136.2 high, line 1 starts at 156.2.
    expectBox(layout.itemBox('next'), { x: 203.2, y: 174.2, w: 67.2, h: 94.2 });
    // A point of the tucked card follows its line when its id is given, else the line its x falls in.
    expectPoint(layout.toDisplay({ x: 750, y: 480 }, 't2'), { x: 450, y: 70 });
    expectPoint(layout.toDisplay({ x: 750, y: 480 }), { x: 197.2, y: 216.2 });
  });

  it('keeps a marker by its card on line 2, though its own x is on line 3', () => {
    const layout = dockLayout({
      ...playerRow(8, 500),
      // 1668 × 0.6 = 1000.8, past line 2's end (938.4); its card c8 is drawn at 404 on line 2.
      items: [
        ...playerRow(8, 500).items,
        { id: 'token', x: 1668, y: 450, w: 84, h: 70, kind: 'marker', anchor: 'c8' },
      ],
    });

    expectBox(layout.itemBox('c8'), { x: 404, y: 278.4, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('token'), { x: 495.2, y: 302.4, w: 50.4, h: 42 });
    // Still three lines.
    expect(layout.rowHeight(1)).toBeCloseTo(402.6, 6);
  });

  it('keeps the frames and piles left of the indent on line 0, at their scaled place', () => {
    // Line width 400 − 180 − 67.2 = 152.8: line 0 ends at 332.8.
    const layout = dockLayout(playerRow(3, 400));

    expectBox(layout.itemBox('frame'), { x: -6, y: 22, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('deck'), { x: 0, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('discard'), { x: 78, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('identity'), { x: 180, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c1'), { x: 271.2, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c2'), { x: 209.6, y: 156.2, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c3'), { x: 300.8, y: 156.2, w: 67.2, h: 94.2 });
  });

  it('keeps a row of piles alone on one line, its indent 0', () => {
    const layout = dockLayout({
      items: PLAYER_PILES.slice(0, 3),
      rows: [1],
      wrapWidth: 50,
      ...ROOMS,
    });

    expect(layout.indent(1)).toBe(0);
    expectBox(layout.itemBox('discard'), { x: 78, y: 28, w: 67.2, h: 94.2 });
    expect(layout.rowHeight(1)).toBeCloseTo(158.2, 6);
  });

  it('wraps a scenario deck frame past the indent of the villain row like a card, its piles with it', () => {
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
        // The next villain's scenario deck, in the middle of the row.
        frame('crew2', 900, 20, 200, 132),
        pile('crew2-deck', 910, 30, { w: 80, h: 112, anchor: 'crew2' }),
        pile('crew2-discard', 1010, 30, { w: 80, h: 112, anchor: 'crew2' }),
        card('villain2', 1160, 30),
      ],
      rows: [0],
      wrapWidth: 550,
      ...ROOMS,
    });

    // Indent 324 (villain 1); the widest card is the landscape scheme, 94.2: line width
    // 550 − 324 − 94.2 = 131.8, so lines start at 455.8, 587.6 and 719.4 in scaled x.
    expect(layout.indent(0)).toBeCloseTo(324, 6);
    expectBox(layout.itemBox('crew1'), { x: 174, y: 22, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew1-discard'), { x: 240, y: 28, w: 48, h: 67.2 });
    expectBox(layout.itemBox('villain1'), { x: 324, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('scheme'), { x: 420, y: 28, w: 94.2, h: 67.2 });
    // crew2 at 540 is on line 1 (top 138.2); its discard at 606 would be on line 2 alone.
    expectBox(layout.itemBox('crew2'), { x: 408.2, y: 150.2, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew2-deck'), { x: 414.2, y: 156.2, w: 48, h: 67.2 });
    expectBox(layout.itemBox('crew2-discard'), { x: 474.2, y: 156.2, w: 48, h: 67.2 });
    // Line 1 holds 91.2 of content (the frame): line 2 starts at 138.2 + 101.2 = 239.4.
    expectBox(layout.itemBox('villain2'), { x: 432.4, y: 257.4, w: 67.2, h: 94.2 });
    // 10 + 128.2 + 101.2 + 122.2 + 20.
    expect(layout.height).toBeCloseTo(381.6, 6);
  });

  it('stacks the shown rows only in the focus view', () => {
    const layout = dockLayout({
      items: [
        frame('encounter', -10, 20, 262, 177),
        pile('encounter-deck', 0, 30, { anchor: 'encounter' }),
        card('villain', 300, 30),
        pile('p1-deck', 0, 410),
        frame('p2-frame', -10, 620, 262, 177),
        pile('p2-deck', 0, 630, { anchor: 'p2-frame' }),
        card('p2-identity', 300, 630),
      ],
      rows: [0, 2],
      wrapWidth: 1000,
      ...ROOMS,
    });

    expect(layout.rowTop(0)).toBe(0);
    expect(layout.rowHeight(0)).toBeCloseTo(158.2, 6);
    expect(layout.rowTop(2)).toBeCloseTo(158.2, 6);
    expect(layout.rowTop(1)).toBeNull();
    expect(layout.itemBox('p1-deck')).toBeNull();
    expectBox(layout.itemBox('p2-frame'), { x: -6, y: 180.2, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('p2-identity'), { x: 180, y: 186.2, w: 67.2, h: 94.2 });
    expectPoint(layout.toDisplay({ x: 500, y: 700 }), { x: 300, y: 228.2 });
    expect(layout.toDisplay({ x: 500, y: 500 })).toBeNull();
    expect(layout.height).toBeCloseTo(316.4, 6);
  });

  it('brings a drawn point on every line back to the table, and there again', () => {
    const layout = dockLayout(playerRow(7, 500));
    const points = [
      // Line 0, left of the indent: over the piles.
      { drawn: { x: 50, y: 60 }, table: { x: 83.333333, y: 463.333333 } },
      // Line 0, 1 and 2 past the indent: scaled x 250, 180 + 252.8 + 70 and 180 + 505.6 + 220.
      { drawn: { x: 250, y: 60 }, table: { x: 416.666667, y: 463.333333 } },
      { drawn: { x: 250, y: 200 }, table: { x: 838, y: 483 } },
      { drawn: { x: 400, y: 300 }, table: { x: 1509.333333, y: 446 } },
      // Past the end of the last line, which runs on: scaled x 180 + 505.6 + 300.
      { drawn: { x: 480, y: 300 }, table: { x: 1642.666667, y: 446 } },
    ];

    for (const { drawn, table } of points) {
      expectPoint(layout.toTable(drawn), table);
      expectPoint(layout.toDisplay(layout.toTable(drawn)), drawn);
    }
  });

  it('counts a drop left of the indent on a wrapped line at the indent', () => {
    const layout = dockLayout(playerRow(7, 500));
    const table = layout.toTable({ x: 100, y: 200 });

    // Scaled x 180 + 252.8 = 432.8: the first spot of line 1.
    expectPoint(table, { x: 721.333333, y: 483 });
    expectPoint(layout.toDisplay(table), { x: 180, y: 200 });
  });

  it('counts a point below the table in the last line, within its row, and one above in line 0', () => {
    const layout = dockLayout(playerRow(7, 500));

    // Scaled x 180 + 505.6 + 70; the height kept on the row's last unit, 380 + 219.
    expectPoint(layout.toTable({ x: 250, y: 1000 }), { x: 1259.333333, y: 599 });
    expectPoint(layout.toTable({ x: 250, y: -50 }), { x: 416.666667, y: 380 });
  });

  it('puts one card on each line when the wrap width is narrower than a card', () => {
    // The line width stays one card wide, 67.2: c1, c2 and c3 go on lines 1, 2 and 4.
    const layout = dockLayout(playerRow(3, 50));

    expectBox(layout.itemBox('identity'), { x: 180, y: 28, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c1'), { x: 204, y: 156.2, w: 67.2, h: 94.2 });
    expectBox(layout.itemBox('c2'), { x: 228, y: 278.4, w: 67.2, h: 94.2 });
    // Line 3 holds nothing: only its 10 gap, so line 4 starts at 382.6 + 10.
    expectBox(layout.itemBox('c3'), { x: 184.8, y: 410.6, w: 67.2, h: 94.2 });
    // 10 + 128.2 + 122.2 + 122.2 + 10 + 122.2 + 20.
    expect(layout.height).toBeCloseTo(534.8, 6);
  });

  it('knows no unknown item', () => {
    const layout = dockLayout(playerRow(1, 500));

    expect(layout.itemBox('nope')).toBeNull();
    // An unknown id falls back to the line the point's x falls in.
    expectPoint(layout.toDisplay({ x: 500, y: 450 }, 'nope'), { x: 300, y: 52 });
  });

  it('needs a row to show', () => {
    expect(() => dockLayout({ items: [], rows: [], wrapWidth: 500 })).toThrow();
  });
});
