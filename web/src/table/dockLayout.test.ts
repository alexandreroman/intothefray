import type { Placement } from './dockPiles';
import { dockFitWidth, dockLayout, type DockItem, type DockLayoutInput } from './dockLayout';

// Every expected value below is worked out by hand, in drawn units (table units × 0.6). The rooms
// are set in each test: a 10-unit name room above a row's lines, a 10-unit gap under each line and
// a 20-unit gap under each row. A portrait card is drawn 67.2 × 94.2, the gap between two units 24
// (40 × 0.6): a slot every 91.2. On a row's first line the units lie 18 under its top (30 × 0.6,
// where the setup puts a row's cards), on its other lines at their top. Line 0 starts its units at
// the row's indent, every other line at the row's left edge: the left of its frames and piles.
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

// Player 1's row (table top 380): the owner frame around the deck and the discard, the identity at
// 300, then played cards 152 apart (a card and a 40 gap). Drawn: the frame at x −6, the deck at 0,
// the discard at 78, the identity at 180 (the indent: past the frame's right edge, 252, and a gap,
// (252 + 40) × 0.6 = 175.2); the frame 12 below the first line's top and 106.2 high, so that the
// first line holds 118.2 of content. Its top is 10, the second line's 10 + 118.2 + 10 = 138.2, the
// third's 138.2 + 94.2 + 10 = 242.4. The row's left edge is the frame's, −6: the lines under the
// first start there, under the frame, five slots of 91.2 to 450 in a 500 wrap width.
const PLAYER_PILES: DockItem[] = [
  frame('frame', -10, 400, 262, 177),
  pile('deck', 0, 410, { anchor: 'frame' }),
  pile('discard', 130, 410, { anchor: 'frame' }),
  card('identity', 300, 410),
];

/** Played cards c1, c2, … at 452, 604, 756, 908, 1060, 1212, 1364, … */
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
  it('draws a row that fits the wrap width at 0.6, its units a gap apart, the landscape one as wide as it is', () => {
    // The villain's row alone, without a name room.
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
    expectBox(layout.itemBox('deck'), cardAt(0, 18));
    expectBox(layout.itemBox('discard'), cardAt(78, 18));
    expectBox(layout.itemBox('villain'), cardAt(180, 18));
    // One gap past the villain's 247.2, not 48 × 0.6 as on the table.
    expectBox(layout.itemBox('scheme'), { x: 271.2, y: 18, w: 94.2, h: 67.2 });
    expect(layout.indent(0)).toBeCloseTo(180, 6);
    expect(layout.rowTop(0)).toBe(0);
    // The frame's 118.2 of content and a 10 line gap; the empty slot, at 389.4, fits the first
    // line, and an empty second line of a card's height and a gap, 104.2; a 20 row gap.
    expect(layout.rowHeight(0)).toBeCloseTo(252.4, 6);
    expect(layout.height).toBeCloseTo(252.4, 6);
    expect(layout.width).toBeCloseTo(389.4 + 67.2, 6);
  });

  it('takes another scale', () => {
    const layout = dockLayout({
      items: [card('a', 300, 30)],
      rows: [0],
      wrapWidth: 1000,
      scale: 0.5,
      ...ROOMS,
    });

    // 30 × 0.5 under the line's top, 10.
    expectBox(layout.itemBox('a'), { x: 150, y: 25, w: 56, h: 78.5 });
  });

  it("wraps a long row onto a second line, from the row's left edge, under the frame", () => {
    // c3 would end at 453.6 + 67.2 = 520.8, past 500.
    const layout = dockLayout(playerRow(4, 500));

    expectBox(layout.itemBox('c1'), cardAt(271.2, 28));
    expectBox(layout.itemBox('c2'), cardAt(362.4, 28));
    expectBox(layout.itemBox('c3'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c4'), cardAt(85.2, 138.2));
    expect(layout.indent(1)).toBeCloseTo(180, 6);
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
    // The empty slot fits after c9, at 176.4.
    expect(layout.rowHeight(1)).toBeCloseTo(366.6, 6);
  });

  it('draws a row with a hole and a moved card evenly, every unit at the top of its line', () => {
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('c1', 452, 410),
        // A hole before c2; c3 lies lower, c4 far right.
        card('c2', 900, 410),
        card('c3', 950, 470),
        card('c4', 1400, 410),
      ],
      rows: [1],
      wrapWidth: 600,
      ...ROOMS,
    });

    expectBox(layout.itemBox('c1'), cardAt(271.2, 28));
    expectBox(layout.itemBox('c2'), cardAt(362.4, 28));
    expectBox(layout.itemBox('c3'), cardAt(453.6, 28));
    // It would end at 544.8 + 67.2 = 612, past 600.
    expectBox(layout.itemBox('c4'), cardAt(-6, 138.2));
    // Content-sized: 10 + 128.2 + 104.2 + 20, nothing of the 220-unit band of the table.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
  });

  it('orders units by x, then y, then id', () => {
    const layout = dockLayout({
      items: [
        card('b', 452, 410),
        card('a', 452, 410),
        card('low', 452, 450),
        card('first', 300, 500),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    expectBox(layout.itemBox('first'), cardAt(180, 28));
    expectBox(layout.itemBox('a'), cardAt(271.2, 28));
    expectBox(layout.itemBox('b'), cardAt(362.4, 28));
    expectBox(layout.itemBox('low'), cardAt(453.6, 28));
  });

  it('moves a stack as one unit, as wide and high as its cards, never split', () => {
    // The stack: main at 700, tucked cards 10 right and 20 down each, 132 × 197 in all, drawn
    // 79.2 × 118.2. At 271.2 it would end at 350.4, past 340: it starts the second line.
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('main', 700, 410),
        card('t1', 710, 430, { anchor: 'main' }),
        card('t2', 720, 450, { anchor: 'main' }),
        card('next', 900, 410),
      ],
      rows: [1],
      wrapWidth: 340,
      ...ROOMS,
    });

    expectBox(layout.itemBox('main'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('t1'), cardAt(0, 150.2));
    expectBox(layout.itemBox('t2'), cardAt(6, 162.2));
    // Past the stack, −6 + 79.2 + 24 = 97.2, it ends at 164.4: on the second line too.
    expectBox(layout.itemBox('next'), cardAt(97.2, 138.2));
    // A point of a tucked card follows its stack.
    expectPoint(layout.toDisplay({ x: 730, y: 480 }, 't2'), { x: 12, y: 180.2 });
  });

  it("gives an exhausted card a slot as wide as its tilt, and a row's first unit its box at the indent", () => {
    // Turned 15°, a portrait card spans 112 cos 15° + 157 sin 15° across, about its middle.
    const turned = 112 * Math.cos(Math.PI / 12) + 157 * Math.sin(Math.PI / 12);
    const reach = ((turned - 112) / 2) * 0.6;
    const layout = dockLayout({
      items: [
        ...PLAYER_PILES.slice(0, 3),
        card('identity', 300, 410, { exhausted: true }),
        card('c1', 452, 410, { exhausted: true }),
        card('c2', 604, 410),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    expectBox(layout.itemBox('identity'), cardAt(180, 28));
    // The identity's slot ends at 180 + 67.2 + reach; c1's starts a gap later and its box a reach
    // further.
    const c1Slot = 180 + 67.2 + reach + 24;
    expectBox(layout.itemBox('c1'), cardAt(c1Slot + reach, 28));
    expectBox(layout.itemBox('c2'), cardAt(c1Slot + turned * 0.6 + 24, 28));
  });

  it("starts a wrapped exhausted card's slot at the left edge, its box a reach further", () => {
    const turned = 112 * Math.cos(Math.PI / 12) + 157 * Math.sin(Math.PI / 12);
    const reach = ((turned - 112) / 2) * 0.6;
    // c1's slot, from 271.2 and 89.3 wide, would end past 300.
    const layout = dockLayout({
      items: [...PLAYER_PILES, card('c1', 452, 410, { exhausted: true })],
      rows: [1],
      wrapWidth: 300,
      ...ROOMS,
    });

    expectBox(layout.itemBox('c1'), cardAt(-6 + reach, 138.2));
  });

  it('keeps a marker by its card, and draws it at 0.6', () => {
    // The token, 40 past c7's right edge (1476), makes c7's unit 1600 − 1364 = 236 wide, 141.6
    // drawn: from 358.8 it would end at 500.4, past 500, so it starts the third line.
    const items = [
      ...playerRow(7, 500).items,
      { id: 'token', x: 1516, y: 450, w: 84, h: 70, kind: 'marker' as const, anchor: 'c7' },
    ];
    const layout = dockLayout({ ...playerRow(7, 500), items });

    expectBox(layout.itemBox('c7'), cardAt(-6, 242.4));
    expectBox(layout.itemBox('token'), { x: 85.2, y: 266.4, w: 50.4, h: 42 });
    // The empty slot fits after it, at 159.6: three lines.
    expect(layout.rowHeight(1)).toBeCloseTo(366.6, 6);
  });

  it('keeps the frames and piles left of the indent on line 0, at their scaled place', () => {
    const layout = dockLayout(playerRow(3, 400));

    expectBox(layout.itemBox('frame'), { x: -6, y: 22, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('deck'), cardAt(0, 28));
    expectBox(layout.itemBox('discard'), cardAt(78, 28));
    expectBox(layout.itemBox('identity'), cardAt(180, 28));
    expectBox(layout.itemBox('c1'), cardAt(271.2, 28));
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
    // The slot from (252 + 40) × 0.6 = 175.2 to 242.4.
    expect(layout.width).toBeCloseTo(242.4, 6);
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

    // Indent 324 (villain 1, past crew1's frame and a gap: (490 + 40) × 0.6 = 318).
    expect(layout.indent(0)).toBeCloseTo(324, 6);
    expectBox(layout.itemBox('crew1'), { x: 174, y: 22, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew1-discard'), { x: 240, y: 28, w: 48, h: 67.2 });
    expectBox(layout.itemBox('villain1'), cardAt(324, 28));
    expectBox(layout.itemBox('scheme'), { x: 415.2, y: 28, w: 94.2, h: 67.2 });
    // crew2 at 533.4 would end at 653.4: the second line, from the encounter frame's left edge,
    // its piles with it, the frame at the top.
    expectBox(layout.itemBox('crew2'), { x: -6, y: 138.2, w: 120, h: 79.2 });
    expectBox(layout.itemBox('crew2-deck'), { x: 0, y: 144.2, w: 48, h: 67.2 });
    expectBox(layout.itemBox('crew2-discard'), { x: 60, y: 144.2, w: 48, h: 67.2 });
    expectBox(layout.itemBox('villain2'), cardAt(138, 138.2));
    // 10 + 128.2 + 104.2 + 20: the empty slot fits after villain 2, at 229.2.
    expect(layout.height).toBeCloseTo(262.4, 6);
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

    // Each row two lines tall: 10 + 128.2 + 104.2 + 20.
    expect(layout.rowTop(0)).toBe(0);
    expect(layout.rowHeight(0)).toBeCloseTo(262.4, 6);
    expect(layout.rowTop(2)).toBeCloseTo(262.4, 6);
    expect(layout.rowTop(1)).toBeNull();
    expect(layout.itemBox('p1-deck')).toBeNull();
    expectBox(layout.itemBox('p2-frame'), { x: -6, y: 284.4, w: 157.2, h: 106.2 });
    expectBox(layout.itemBox('p2-identity'), cardAt(180, 290.4));
    // A point of row 2 is drawn with the unit it lies past: the identity, 70 under its top.
    expectPoint(layout.toDisplay({ x: 500, y: 700 }), { x: 300, y: 332.4 });
    expect(layout.toDisplay({ x: 500, y: 500 })).toBeNull();
    expect(layout.height).toBeCloseTo(524.8, 6);
  });

  it('brings a drawn point on every line back to the table, and there again', () => {
    const layout = dockLayout(playerRow(9, 500));
    const points = [
      // Line 0, left of the identity: over the piles, scaled back.
      { drawn: { x: 50, y: 60 }, table: { x: 83.333333, y: 463.333333 } },
      // Line 0, with the identity: 250 / 0.6, 410 + (60 − 28) / 0.6.
      { drawn: { x: 250, y: 60 }, table: { x: 416.666667, y: 463.333333 } },
      // Line 1, under the frame, with c3 (756, drawn −6): 756 + 26 / 0.6, 410 + 61.8 / 0.6.
      { drawn: { x: 20, y: 200 }, table: { x: 799.333333, y: 513 } },
      // Line 1, with c6 (1212, drawn 267.6): 1212 + 32.4 / 0.6.
      { drawn: { x: 300, y: 200 }, table: { x: 1266, y: 513 } },
      // Line 2, past c9 (1668, drawn 85.2): 1668 + 64.8 / 0.6, 410 + 57.6 / 0.6.
      { drawn: { x: 150, y: 300 }, table: { x: 1776, y: 506 } },
    ];

    for (const { drawn, table } of points) {
      expectPoint(layout.toTable(drawn), table);
      expectPoint(layout.toDisplay(layout.toTable(drawn)), drawn);
    }
  });

  it('counts a point below the table in the last line, and one above in line 0, within the row', () => {
    const layout = dockLayout(playerRow(9, 500));

    // With c9 (1668, drawn 85.2): 1668 + 164.8 / 0.6, the height kept on the row's last unit,
    // 380 + 219.
    expectPoint(layout.toTable({ x: 250, y: 1000 }), { x: 1942.666667, y: 599 });
    expectPoint(layout.toTable({ x: 250, y: -50 }), { x: 416.666667, y: 380 });
  });

  it('puts one unit on each line when the wrap width is narrower than a card', () => {
    const layout = dockLayout(playerRow(2, 50));

    expectBox(layout.itemBox('identity'), cardAt(180, 28));
    expectBox(layout.itemBox('c1'), cardAt(-6, 138.2));
    expectBox(layout.itemBox('c2'), cardAt(-6, 242.4));
    // 10 + 128.2 + 104.2 + 104.2 + 20, and a line of 104.2 for the empty slot.
    expect(layout.height).toBeCloseTo(366.6 + 104.2, 6);
  });

  it('keeps a row whose units fit its first line two lines tall, the second one empty', () => {
    const layout = dockLayout(playerRow(2, 1000));

    expectBox(layout.itemBox('c2'), cardAt(362.4, 28));
    // 10 + 128.2, then an empty line of a card's height, 94.2 + 10, and the row gap.
    expect(layout.rowHeight(1)).toBeCloseTo(262.4, 6);
  });

  it('knows no unknown item', () => {
    const layout = dockLayout(playerRow(1, 500));

    expect(layout.itemBox('nope')).toBeNull();
    // An unknown id is drawn with the unit its point lies past: c1, at 452.
    expectPoint(layout.toDisplay({ x: 500, y: 450 }, 'nope'), { x: 300, y: 52 });
  });

  it('needs a row to show', () => {
    expect(() => dockLayout({ items: [], rows: [], wrapWidth: 500 })).toThrow();
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

    // c8 is the ninth unit: 180 + 8 × 91.2.
    expectBox(layout.itemBox('c8'), cardAt(909.6, 28));
    expectPoint(layout.toTable({ x: 909.6, y: 28 }), { x: 1516, y: 410 });
  });
});

describe('a drop on a row of dock mode (insertAt)', () => {
  // playerRow(4, 500): the identity, c1 and c2 on line 0, their slots' middles at 213.6, 304.8 and
  // 396; c3 and c4 on line 1, from the left edge, at 27.6 and 118.8, the empty slot after c4, at
  // 176.4. On the table, c1 runs 452..564, c2 604..716, c3 756..868, c4 908..1020. A portrait card
  // is 112 wide.
  const layout = () => dockLayout(playerRow(4, 500));

  it('goes between the two units around it: the middle of their gap, on the grid, at the first one’s y', () => {
    // Before c2: (564 + 604) / 2 − 56 = 528, to 530.
    expect(layout().insertAt({ x: 350, y: 60 }, 112)).toEqual({ x: 530, y: 410 });
    // A landscape card: 584 − 78.5 = 505.5, to 510.
    expect(layout().insertAt({ x: 350, y: 60 }, 157)).toEqual({ x: 510, y: 410 });
  });

  it("goes after a line's last unit, before the next line's first", () => {
    // Between c2 and c3: (716 + 756) / 2 − 56 = 680.
    expect(layout().insertAt({ x: 450, y: 60 }, 112)).toEqual({ x: 680, y: 410 });
  });

  it('goes before the first unit of a wrapped line when dropped left of its middle, under the frame', () => {
    // Left of c3's middle on line 1: before c3, the spot after c2.
    expect(layout().insertAt({ x: 0, y: 200 }, 112)).toEqual({ x: 680, y: 410 });
    expect(layout().insertAt({ x: -20, y: 200 }, 112)).toEqual({ x: 680, y: 410 });
    // Past it, between c3 and c4: (868 + 908) / 2 − 56 = 832, to 830.
    expect(layout().insertAt({ x: 100, y: 200 }, 112)).toEqual({ x: 830, y: 410 });
  });

  it('goes after the last unit, or in the empty slot, 40 past its right edge at the row’s card y', () => {
    expect(layout().insertAt({ x: 150, y: 160 }, 112)).toEqual({ x: 1060, y: 410 });
    expect(layout().insertAt({ x: 200, y: 180 }, 112)).toEqual({ x: 1060, y: 410 });
    expect(layout().insertAt({ x: 396, y: 180 }, 112)).toEqual({ x: 1060, y: 410 });
  });

  it('goes before the first unit when dropped left of the indent', () => {
    // Between the frame's right edge (252) and the identity (300): 276 − 56 = 220, at the row's y.
    expect(layout().insertAt({ x: 50, y: 60 }, 112)).toEqual({ x: 220, y: 410 });
  });

  it('leaves the dragged units out, and keeps a card dropped back in its own place where it lies', () => {
    const c1 = new Set(['c1']);
    // Past c2 without c1: between c2 and c3.
    expect(layout().insertAt({ x: 450, y: 60 }, 112, c1)).toEqual({ x: 680, y: 410 });
    // Between the identity and c2, where c1 lies: its own spot.
    expect(layout().insertAt({ x: 300, y: 60 }, 112, c1)).toEqual({ x: 452, y: 410 });
  });

  it('goes after the last unit when dropped anywhere on the empty second line of a short row', () => {
    // playerRow(2, 1000): the identity, c1 and c2 on the first line; the second, from 138.2, empty.
    // After c2 (604..716): 756, up to the grid.
    const short = dockLayout(playerRow(2, 1000));

    expect(short.insertAt({ x: 300, y: 180 }, 112)).toEqual({ x: 760, y: 410 });
    expect(short.insertAt({ x: 50, y: 180 }, 112)).toEqual({ x: 760, y: 410 });
    // From the row's left edge, under the frame.
    expect(short.insertAt({ x: -6, y: 180 }, 112)).toEqual({ x: 760, y: 410 });
    // A point there reads with c2 (604, drawn 362.4, on line 0): 604 + (−6 − 362.4) / 0.6, and
    // 410 + (180 − 28) / 0.6 kept within the row, 380 + 219.
    expectPoint(short.toTable({ x: -6, y: 180 }), { x: -10, y: 599 });
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
    expect(twoRows.insertAt({ x: 300, y: 320 }, 112)).toEqual({ x: 460, y: 410 });
  });

  it('measures a stack by all its cards', () => {
    const stacked = dockLayout({
      items: [
        ...PLAYER_PILES,
        card('main', 452, 410),
        card('tucked', 472, 450, { anchor: 'main' }),
        card('next', 700, 410),
      ],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // The stack's slot runs 271.2..350.4, its middle 310.8; next's from 374.4, its middle 408.
    // Between the stack's right edge (584) and next: (584 + 700) / 2 − 56 = 586, to 590.
    expect(stacked.insertAt({ x: 380, y: 60 }, 112)).toEqual({ x: 590, y: 410 });
    // The tucked card dragged away: the stack ends at 564, (564 + 700) / 2 − 56 = 576, to 580.
    expect(stacked.insertAt({ x: 380, y: 60 }, 112, new Set(['tucked']))).toEqual({
      x: 580,
      y: 410,
    });
  });

  it('stays strictly between two units with no grid line between them', () => {
    const close = dockLayout({
      items: [...PLAYER_PILES, card('a', 452, 410), card('b', 455, 410)],
      rows: [1],
      wrapWidth: 1000,
      ...ROOMS,
    });

    // Before b: at a's x, a grid line lower, so that it sorts after a and before b.
    expect(close.insertAt({ x: 380, y: 60 }, 112)).toEqual({ x: 452, y: 420 });
  });
});

describe('dockFitWidth', () => {
  it("is the widest row's indent and three slots of a drawn card and a drawn gap", () => {
    // The villain row's indent is 0 (its villain at 0), player 1's 180 (the identity at 300):
    // 180 + 3 × (112 + 40) × 0.6.
    const items = [card('villain', 0, 30), ...PLAYER_PILES, ...played(2)];
    expect(dockFitWidth(items, [0, 1])).toBeCloseTo(180 + 3 * 91.2, 6);
  });

  it('leaves out the rows not shown, and counts a row of piles alone from 0', () => {
    expect(dockFitWidth(PLAYER_PILES, [0])).toBeCloseTo(3 * 91.2, 6);
    expect(dockFitWidth(PLAYER_PILES.slice(0, 3), [1])).toBeCloseTo(3 * 91.2, 6);
  });
});
