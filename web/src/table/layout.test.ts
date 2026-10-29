import { describe, expect, it } from 'vitest';
import type { CardView, PileView, Size } from '../lib/types';
import {
  cardBox,
  contentWidth,
  fanPositions,
  footprints,
  HAND_CARD,
  HAND_CARD_NARROW,
  HAND_REST_DROP,
  HAND_REST_SCALE,
  handRestDrop,
  fanExtent,
  fanOffsets,
  HANDS_GAP,
  handRestScale,
  isOutOfPlay,
  outOfPlayChips,
  ownerFrames,
  previewCardWidth,
  raisedHandCard,
  restingFanPositions,
  restingFanWidth,
  restingStrip,
  smallHandCard,
  smallHandDrop,
  surfaceSize,
  visualBox,
} from './layout';

function card(overrides: Partial<CardView> = {}): CardView {
  return {
    id: 'c',
    code: '01001',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

function pile(overrides: Partial<PileView> = {}): PileView {
  return { id: 'p', kind: 'deck', owner: 0, x: 0, y: 0, count: 10, ...overrides };
}

const alwaysStd = (): Size => 'std';
const nothingShows = { w: 0, h: 0 };

describe('cardBox sizes', () => {
  it('returns the four sizes, a portrait card being 112x157', () => {
    expect(cardBox('std', {})).toEqual({ w: 112, h: 157, rotated: false });
    expect(cardBox('land', {})).toEqual({ w: 157, h: 112, rotated: false });
    expect(cardBox('dstd', {})).toEqual({ w: 157, h: 224, rotated: false });
    expect(cardBox('dland', {})).toEqual({ w: 224, h: 157, rotated: false });
  });

  it('forces a face-down card to 112x157', () => {
    for (const size of ['std', 'land', 'dstd', 'dland'] as const) {
      expect(cardBox(size, { faceDown: true })).toEqual({ w: 112, h: 157, rotated: false });
    }
  });

  it('keeps a portrait slot for a landscape card on a pile', () => {
    expect(cardBox('land', { onPile: true })).toEqual({ w: 112, h: 157, rotated: true });
    expect(cardBox('dland', { onPile: true })).toEqual({ w: 157, h: 224, rotated: true });
  });

  it('leaves a portrait card on a pile unrotated', () => {
    expect(cardBox('std', { onPile: true })).toEqual({ w: 112, h: 157, rotated: false });
  });
});

describe('surfaceSize', () => {
  it('leaves 200 free past the rightmost item and 300 under the lowest one', () => {
    const cards = [card({ x: 50, y: 300 }), card({ x: 400, y: 10 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 712, h: 757 });
  });

  it('uses the size of each card, a face-down card being 112x157', () => {
    expect(surfaceSize([card({ x: 100 })], [], () => 'dland', nothingShows)).toEqual({
      w: 524,
      h: 457,
    });
    const faceDown = [card({ x: 100, faceDown: true })];
    expect(surfaceSize(faceDown, [], () => 'dland', nothingShows)).toEqual({ w: 412, h: 457 });
  });

  it('counts piles as 112x157 boxes, but not the out-of-play piles, which are not drawn', () => {
    const piles = [
      pile({ x: 160, y: 360 }),
      pile({ id: 'vic', kind: 'victory', x: 2000, y: 2000 }),
      pile({ id: 'aside', kind: 'aside', x: 3000, y: 3000 }),
    ];
    expect(surfaceSize([], piles, alwaysStd, nothingShows)).toEqual({ w: 472, h: 817 });
  });

  it('ignores the cards that are not on the table', () => {
    const cards = [card({ zone: 'hand', x: 900, y: 900 })];
    // Nothing on the table: it fits, with no free room.
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 0, h: 0 });
  });

  it('never grows past where a card at the server bound of 20000 ends', () => {
    const cards = [card({ x: 20_000, y: 20_000 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 20_224, h: 20_224 });
    expect(surfaceSize(cards, [], alwaysStd, { w: 30_000, h: 25_000 })).toEqual({
      w: 30_000,
      h: 25_000,
    });
  });

  it('fills what shows of the table', () => {
    const cards = [card({ x: 400 })];
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 900 })).toEqual({ w: 1200, h: 900 });
    // Too narrow for the card, tall enough: free room on the right only.
    expect(surfaceSize(cards, [], alwaysStd, { w: 300, h: 200 })).toEqual({ w: 712, h: 200 });
  });

  it('adds free room only once the items no longer fit in what shows', () => {
    // The lowest item ends at 517: in a 744 tall view, the table does not scroll.
    const cards = [card({ x: 0, y: 360 })];
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 744 }).h).toBe(744);
    // Right at the edge, it still fits.
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 517 }).h).toBe(517);
    // One unit past it, there is room to drop a card under it.
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 516 }).h).toBe(817);
    expect(surfaceSize(cards, [], alwaysStd, { w: 111, h: 744 }).w).toBe(312);
  });
});

describe('an exhausted card', () => {
  // A std card turned 15 degrees: its bounding box is 112·cos + 157·sin wide and
  // 112·sin + 157·cos tall, around the same centre.
  const turnedWidth = 112 * Math.cos(Math.PI / 12) + 157 * Math.sin(Math.PI / 12);
  const turnedHeight = 112 * Math.sin(Math.PI / 12) + 157 * Math.cos(Math.PI / 12);

  it('shows a bounding box grown around its centre', () => {
    const box = visualBox({ id: 'a', x: 400, y: 300, w: 112, h: 157, exhausted: true });
    expect(box.left).toBeCloseTo(456 - turnedWidth / 2);
    expect(box.right).toBeCloseTo(456 + turnedWidth / 2);
    expect(box.bottom).toBeCloseTo(378.5 + turnedHeight / 2);
    expect(visualBox({ id: 'b', x: 400, y: 300, w: 112, h: 157 })).toEqual({
      left: 400,
      right: 512,
      bottom: 457,
    });
  });

  it('makes the surface wider and taller, rounded up to whole units', () => {
    const cards = [card({ x: 400, y: 300, exhausted: true })];
    const right = Math.ceil(456 + turnedWidth / 2);
    const bottom = Math.ceil(378.5 + turnedHeight / 2);
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({
      w: right + 200,
      h: bottom + 300,
    });
  });
});

describe('isOutOfPlay', () => {
  it('is true of the victory display and set-aside piles only', () => {
    expect(isOutOfPlay(pile({ kind: 'victory' }))).toBe(true);
    expect(isOutOfPlay(pile({ kind: 'aside' }))).toBe(true);
    expect(isOutOfPlay(pile({ kind: 'encounter' }))).toBe(false);
    expect(isOutOfPlay(pile({ kind: 'discard' }))).toBe(false);
  });
});

describe('footprints', () => {
  it('lists the table cards with their sizes, then the drawn piles as 112x157', () => {
    const cards = [
      card({ id: 'a', x: 10, y: 20 }),
      card({ id: 'b', x: 200, faceDown: true }),
      card({ id: 'h', zone: 'hand' }),
    ];
    const piles = [
      pile({ id: 'enc', kind: 'encounter', owner: -1, x: 500 }),
      pile({ id: 'vic', kind: 'victory', owner: -1, x: 700 }),
    ];
    expect(footprints(cards, piles, () => 'land')).toEqual([
      { id: 'a', x: 10, y: 20, w: 157, h: 112 },
      { id: 'b', x: 200, y: 0, w: 112, h: 157 },
      { id: 'enc', x: 500, y: 0, w: 112, h: 157 },
    ]);
  });
});

describe('ownerFrames', () => {
  it("frames each owner's deck and discard pile, 10 units off their edges", () => {
    const piles = [
      pile({ id: 'enc', kind: 'encounter', owner: -1, x: 0, y: 30 }),
      pile({ id: 'encd', kind: 'encounterDiscard', owner: -1, x: 130, y: 30 }),
      pile({ id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 360 }),
      pile({ id: 'disc:p0', kind: 'discard', owner: 0, x: 130, y: 360 }),
    ];
    expect(ownerFrames(piles)).toEqual([
      { owner: -1, x: -10, y: 20, w: 262, h: 177 },
      { owner: 0, x: -10, y: 350, w: 262, h: 177 },
    ]);
  });

  it('leaves the out-of-play piles out', () => {
    const piles = [
      pile({ id: 'deck:p1', kind: 'deck', owner: 1, x: 0, y: 690 }),
      pile({ id: 'aside:p1', kind: 'aside', owner: 1, x: 900, y: 690 }),
      pile({ id: 'vic', kind: 'victory', owner: -1, x: 0, y: 30 }),
    ];
    expect(ownerFrames(piles)).toEqual([{ owner: 1, x: -10, y: 680, w: 132, h: 177 }]);
  });

  it('frames the side decks and their discard piles with the deck and discard pile', () => {
    const piles = [
      pile({ id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 360 }),
      pile({ id: 'disc:p0', kind: 'discard', owner: 0, x: 130, y: 360 }),
      pile({ id: 'side:p0:0', kind: 'sideDeck', owner: 0, x: 260, y: 360, label: 'Invocation' }),
      pile({ id: 'sided:p0:0', kind: 'sideDiscard', owner: 0, x: 390, y: 360 }),
    ];
    expect(ownerFrames(piles)).toEqual([{ owner: 0, x: -10, y: 350, w: 522, h: 177 }]);
  });
});

describe('outOfPlayChips', () => {
  const piles = [
    pile({ id: 'enc', kind: 'encounter', owner: -1 }),
    pile({ id: 'saside', kind: 'aside', owner: -1, count: 5 }),
    pile({ id: 'vic', kind: 'victory', owner: -1, count: 0 }),
    pile({ id: 'deck:p0', kind: 'deck', owner: 0 }),
    pile({ id: 'aside:p0', kind: 'aside', owner: 0, count: 2 }),
    pile({ id: 'aside:p1', kind: 'aside', owner: 1, count: 1 }),
  ];

  it("gives the villain the victory display, then the scenario's set-aside cards", () => {
    expect(outOfPlayChips(-1, piles)).toEqual([
      { pile: 'vic', kind: 'victory', label: 'Victory display', count: 0 },
      { pile: 'saside', kind: 'aside', label: 'Set-aside cards', count: 5 },
    ]);
  });

  it("gives a player their own set-aside cards, and nobody else's", () => {
    expect(outOfPlayChips(0, piles)).toEqual([
      { pile: 'aside:p0', kind: 'aside', label: 'Set-aside cards', count: 2 },
    ]);
  });

  it('leaves out the piles the table does not have', () => {
    expect(outOfPlayChips(2, piles)).toEqual([]);
    expect(outOfPlayChips(-1, [pile({ id: 'vic', kind: 'victory', owner: -1 })])).toEqual([
      { pile: 'vic', kind: 'victory', label: 'Victory display', count: 10 },
    ]);
  });
});

describe('fanPositions', () => {
  const cardWidth = 185;
  const cardHeight = 259;

  /** The distance between two neighbouring cards. */
  function pitchOf(fan: { x: number }[]): number {
    return fan[1]!.x - fan[0]!.x;
  }

  // Width of the box around the fanned cards. Each card turns around a point below its bottom
  // edge (transform-origin 50% 110% in Hand.svelte), so its top corners swing out the most.
  function boundingWidth(
    fan: { x: number; angle: number }[],
    card: { w: number; h: number } = { w: cardWidth, h: cardHeight },
  ): number {
    const xs = fan.flatMap((p) => {
      const a = (p.angle * Math.PI) / 180;
      // The corners, from the pivot, with y growing downward.
      const corners = [-card.w / 2, card.w / 2].flatMap((x) =>
        [-1.1 * card.h, -0.1 * card.h].map((y) => ({ x, y })),
      );
      return corners.map((c) => p.x + c.x * Math.cos(a) - c.y * Math.sin(a));
    });
    return Math.max(...xs) - Math.min(...xs);
  }

  it('overlaps the cards by 40 when there is room', () => {
    expect(pitchOf(fanPositions(5, 1200))).toBeCloseTo(145);
    expect(pitchOf(fanPositions(5, 1200, 140))).toBeCloseTo(100);
  });

  it.each([
    [12, 76.2],
    [15, 59.9],
  ])('overlaps %i cards more to fit 1200', (n, pitch) => {
    const fan = fanPositions(n, 1200);
    expect(pitchOf(fan)).toBeCloseTo(pitch, 1);
    fan.forEach((p, i) => expect(p.x).toBeCloseTo((i - (n - 1) / 2) * pitchOf(fan)));
  });

  it.each([
    [5, 1200],
    [12, 1200],
    [15, 1200],
    [12, 700],
    [30, 900],
  ])('keeps %i cards inside %i, but for the accepted 11.7 on each side', (n, width) => {
    expect(boundingWidth(fanPositions(n, width))).toBeLessThanOrEqual(width + 2 * 11.7);
  });

  it.each([
    [12, 1300],
    [12, 800],
    [30, 1200],
  ])(
    'keeps %i larger cards inside %i, but for the accepted overhang grown with the card',
    (n, width) => {
      // A raised hand card, 80 % of the preview's: its corners swing out in proportion to its width.
      const raised = { w: 238, h: 333 };
      const overhang = 11.7 * (raised.w / cardWidth);
      const fan = fanPositions(n, width, raised.w);
      expect(boundingWidth(fan, raised)).toBeLessThanOrEqual(width + 2 * overhang);
    },
  );

  it('keeps the layout of cards up to the desktop size', () => {
    expect(pitchOf(fanPositions(12, 1200, 185))).toBeCloseTo(76.2, 1);
    expect(pitchOf(fanPositions(12, 800, 140))).toBeCloseTo((800 - 112 - 1.35 * 140) / 11);
  });

  it('piles the cards up rather than reversing them when there is no room', () => {
    for (const p of fanPositions(12, 0)) {
      expect(p.x).toBeCloseTo(0);
    }
  });

  it('turns the cards 5 degrees apart, at most 44 in total, whatever the width', () => {
    expect(fanPositions(3, 900).map((p) => p.angle)).toEqual([-5, 0, 5]);
    expect(fanPositions(3, 0).map((p) => p.angle)).toEqual([-5, 0, 5]);
    const wide = fanPositions(30, 900).map((p) => p.angle);
    expect(wide[wide.length - 1]! - wide[0]!).toBeCloseTo(44);
  });

  it('sags along a circle of radius 1260', () => {
    for (const p of fanPositions(12, 1200)) {
      expect(p.y).toBeCloseTo(1260 * (1 - Math.cos((p.angle * Math.PI) / 180)), 6);
    }
  });

  it('is symmetric around the middle card', () => {
    for (const n of [5, 12]) {
      const fan = fanPositions(n, 1200);
      fan.forEach((p, i) => {
        const mirror = fan[fan.length - 1 - i]!;
        expect(p.angle).toBeCloseTo(-mirror.angle);
        expect(p.x).toBeCloseTo(-mirror.x);
        expect(p.y).toBeCloseTo(mirror.y);
      });
    }
  });

  it('puts a single card upright at the centre', () => {
    expect(fanPositions(1, 900)).toEqual([{ x: 0, y: 0, angle: 0 }]);
  });

  it('returns nothing for no card', () => {
    expect(fanPositions(0, 900)).toEqual([]);
  });
});

describe('contentWidth', () => {
  const std = (): Size => 'std';

  it('reaches the right edge of the last card, pile or frame', () => {
    const cards = [card({ id: 'a', x: 300 }), card({ id: 'b', x: 1500 })];
    expect(contentWidth(cards, [], std)).toBe(1612);
    // A frame reaches 10 units past its piles.
    expect(contentWidth([], [pile({ id: 'd', kind: 'deck', x: 130 })], std)).toBe(252);
  });

  it('leaves out the out-of-play piles and the cards off the table, and is 0 for an empty table', () => {
    const away = [card({ id: 'h', x: 3000, zone: 'hand' })];
    const aside = [pile({ id: 'aside:p0', kind: 'aside', x: 3000 })];
    expect(contentWidth(away, aside, std)).toBe(0);
  });

  it('takes in the turned box of an exhausted card', () => {
    const turned = contentWidth([card({ x: 0, exhausted: true })], [], std);
    expect(turned).toBe(
      Math.ceil(visualBox({ id: 'c', x: 0, y: 0, w: 112, h: 157, exhausted: true }).right),
    );
    expect(turned).toBeGreaterThan(112);
  });
});

describe("a small screen's hand", () => {
  it('takes a quarter of the window width, within 64 and 151 px', () => {
    expect(smallHandCard({ w: 390, h: 844 })).toEqual({ w: 97, h: 136 });
    expect(smallHandCard({ w: 200, h: 844 })).toEqual({ w: 64, h: 90 });
    expect(smallHandCard({ w: 600, h: 1200 })).toEqual({ w: 150, h: 210 });
    expect(smallHandCard({ w: 800, h: 1200 }).w).toBe(151);
  });

  it('never raises over half the window height, its padding included', () => {
    for (const window of [
      { w: 844, h: 390 },
      { w: 667, h: 375 },
      { w: 1200, h: 480 },
    ]) {
      const { h } = smallHandCard(window);
      expect(h + 44).toBeLessThanOrEqual(window.h / 2);
    }
  });

  it('drops at rest by the share of its cards the desktop hand does', () => {
    expect(smallHandDrop(HAND_CARD.h)).toBe(HAND_REST_DROP);
    expect(smallHandDrop(136)).toBe(74);
  });

  it('shows a strip of the resting hand: its padding and cards, scaled, less the drop', () => {
    // The desktop hand: 82 % of 26 + 259 + 18 px, 140 px of it under the bottom.
    expect(restingStrip(HAND_CARD.h, HAND_REST_DROP)).toBe(108);
    expect(restingStrip(136, 74)).toBe(74);
    expect(restingStrip(10, 500)).toBe(0);
  });
});

describe('the raised hand', () => {
  it("measures the preview's card as .peek sizes it", () => {
    // 380 px less 10 px of padding and 1 px of border each side.
    expect(previewCardWidth({ w: 1500, h: 1080 })).toBe(358);
    // 45 % of a narrow table area.
    expect(previewCardWidth({ w: 500, h: 1000 })).toBe(203);
    // A short window: 5/7 of its height less 200 px, plus the padding.
    expect(previewCardWidth({ w: 1500, h: 600 })).toBeCloseTo((400 * 5) / 7 - 2);
    // Not measured yet.
    expect(previewCardWidth({ w: 0, h: 1080 })).toBe(0);
  });

  it("takes 80 % of the preview's card on a desktop", () => {
    expect(raisedHandCard(HAND_CARD, { w: 1500, h: 1080 }, { small: false })).toEqual({
      w: 286,
      h: 400,
    });
    expect(raisedHandCard(HAND_CARD, { w: 1500, h: 600 }, { small: false })).toEqual({
      w: 227,
      h: 318,
    });
  });

  it('follows a narrow table area', () => {
    expect(raisedHandCard(HAND_CARD_NARROW, { w: 500, h: 1000 }, { small: false })).toEqual({
      w: 162,
      h: 227,
    });
  });

  it('is never smaller than the base card', () => {
    // A short window, and a table area not measured yet.
    expect(raisedHandCard(HAND_CARD, { w: 1500, h: 500 }, { small: false })).toBe(HAND_CARD);
    expect(raisedHandCard(HAND_CARD, { w: 0, h: 1080 }, { small: false })).toBe(HAND_CARD);
    const phone = smallHandCard({ w: 844, h: 390 });
    expect(raisedHandCard(phone, { w: 844, h: 390 }, { small: true })).toBe(phone);
  });

  it('never raises over half the window height on a small screen, its padding included', () => {
    const window = { w: 560, h: 500 };
    const base = smallHandCard(window);
    expect(base).toEqual({ w: 140, h: 196 });
    const raised = raisedHandCard(base, window, { small: true });
    expect(raised).toEqual({ w: 147, h: 206 });
    expect(raised.h + 44).toBeLessThanOrEqual(window.h / 2);
    // Elsewhere, the preview alone decides.
    expect(raisedHandCard(base, window, { small: false })).toEqual({ w: 170, h: 238 });
  });

  it('draws the raised cards at rest as large as the base card at HAND_REST_SCALE', () => {
    expect(handRestScale(HAND_CARD, HAND_CARD)).toBe(HAND_REST_SCALE);
    const scale = handRestScale(HAND_CARD, { w: 238 });
    expect(scale).toBeCloseTo(0.6374, 4);
    expect(scale * 238).toBeCloseTo(HAND_REST_SCALE * HAND_CARD.w);
  });

  it("lays the resting fan out as the base cards' at the rest scale, on screen", () => {
    const raised = { w: 238 };
    const scale = handRestScale(HAND_CARD, raised);
    for (const [n, width] of [
      [3, 1200],
      [12, 1440],
      [12, 800],
    ] as const) {
      const base = fanPositions(n, width, HAND_CARD.w);
      const resting = restingFanPositions(n, width, HAND_CARD.w, raised.w);
      resting.forEach((slot, i) => {
        expect(slot.x * scale).toBeCloseTo(HAND_REST_SCALE * base[i]!.x, 9);
        expect(slot.y * scale).toBeCloseTo(HAND_REST_SCALE * base[i]!.y, 9);
        expect(slot.angle).toBe(base[i]!.angle);
      });
    }
    // An unchanged card keeps its fan.
    expect(restingFanPositions(5, 1200, 185, 185)).toEqual(fanPositions(5, 1200, 185));
  });

  it('drops the resting cards so that they show as tall as the base card at HAND_REST_SCALE', () => {
    // The height of a resting card above the window's bottom edge, its 18 px of bottom padding
    // included: the top padding lies above it.
    const shown = (card: { w: number; h: number }, drop: number) =>
      handRestScale(HAND_CARD, card) * (card.h + 18) - drop;
    const baseShown = shown(HAND_CARD, HAND_REST_DROP);
    expect(baseShown).toBeCloseTo(87.14, 2);

    // The base card itself drops by the base drop.
    expect(handRestDrop(HAND_CARD, HAND_REST_DROP, HAND_CARD)).toBe(HAND_REST_DROP);
    const phone = smallHandCard({ w: 390, h: 844 });
    expect(handRestDrop(phone, 74, phone)).toBe(74);

    const raised = { w: 238, h: 333 };
    const drop = handRestDrop(HAND_CARD, HAND_REST_DROP, raised);
    expect(drop).toBe(137);
    expect(Math.abs(shown(raised, drop) - baseShown)).toBeLessThanOrEqual(0.5);
    // Its box, with the top padding drawn smaller, shows no higher than restingStrip's.
    const box = handRestScale(HAND_CARD, raised) * (44 + raised.h) - drop;
    expect(box).toBeLessThanOrEqual(restingStrip(HAND_CARD.h, HAND_REST_DROP));
    // Never above its raised place.
    expect(handRestDrop(HAND_CARD, 0, raised)).toBe(0);
  });
});

describe('fanExtent', () => {
  it('reaches as far as the cards upright, with no tilt', () => {
    const slots = [
      { x: -100, y: 0, angle: 0 },
      { x: 100, y: 0, angle: 0 },
    ];
    expect(fanExtent(slots, { w: 200, h: 280 })).toEqual({ left: -200, right: 200 });
    // An empty hand keeps a card's room.
    expect(fanExtent([], { w: 200, h: 280 })).toEqual({ left: -100, right: 100 });
  });

  it("takes in the end cards' top outer corners, tilted about a point below their bottom", () => {
    // Turned 90° clockwise about a point 28 below its bottom middle (110 % of 280 under its top), a
    // card 200 by 280 lies from 28 to 308 right of that point.
    const extent = fanExtent([{ x: 0, y: 0, angle: 90 }], { w: 200, h: 280 });
    expect(extent.left).toBeCloseTo(28);
    expect(extent.right).toBeCloseTo(308);
    // On a real fan the end cards stick out past their upright slots.
    const fan = fanPositions(5, 1200);
    const upright = Math.max(...fan.map((slot) => slot.x)) + HAND_CARD.w / 2;
    const tilted = fanExtent(fan, HAND_CARD);
    expect(tilted.right).toBeGreaterThan(upright + 20);
    expect(tilted.left).toBeCloseTo(-tilted.right);
  });
});

describe('restingFanWidth', () => {
  it('measures the resting fan as seen, tilted end cards included, at the rest scale', () => {
    const raised = { w: 238, h: 333 };
    const extent = fanExtent(restingFanPositions(4, 600, HAND_CARD.w, raised.w), raised);
    expect(restingFanWidth(4, 600, HAND_CARD, raised)).toBeCloseTo(
      handRestScale(HAND_CARD, raised) * (extent.right - extent.left),
    );
    // A single card stands upright: it shows as the base card at HAND_REST_SCALE.
    expect(restingFanWidth(1, 600, HAND_CARD, raised)).toBeCloseTo(HAND_REST_SCALE * HAND_CARD.w);
  });
});

describe('fanOffsets', () => {
  it('sets two fans side by side, HANDS_GAP apart, centred together', () => {
    // 200 + 48 + 100 = 348 px in all, from -174 to 174.
    expect(HANDS_GAP).toBe(48);
    expect(fanOffsets(200, 100)).toEqual([-74, 124]);
  });
});
