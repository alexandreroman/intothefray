import { TOP_BAR_HEIGHT } from '../lib/autoHide.svelte';
import type { CardView, PileView, Point, Size } from '../lib/types';
import {
  cardBox,
  contentWidth,
  fanPositions,
  filledFanPositions,
  filledHandCard,
  footprints,
  freeSlot,
  HAND_CARD,
  HAND_CARD_NARROW,
  HAND_PADDING,
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
  TOUCH_POP_SCALE,
  touchPop,
  visualBox,
  type FanSlot,
} from './layout';
import { card, pile } from './fixtures.testing';

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
    const cards = [card('c', { x: 50, y: 300 }), card('c', { x: 400, y: 10 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 712, h: 757 });
  });

  it('uses the size of each card, a face-down card being 112x157', () => {
    expect(surfaceSize([card('c', { x: 100 })], [], () => 'dland', nothingShows)).toEqual({
      w: 524,
      h: 457,
    });
    const faceDown = [card('c', { x: 100, faceDown: true })];
    expect(surfaceSize(faceDown, [], () => 'dland', nothingShows)).toEqual({ w: 412, h: 457 });
  });

  it('counts piles as 112x157 boxes, but not the out-of-play piles, which are not drawn', () => {
    const piles = [
      pile('p', { x: 160, y: 360 }),
      pile('vic', { kind: 'victory', x: 2000, y: 2000 }),
      pile('aside', { kind: 'aside', x: 3000, y: 3000 }),
    ];
    expect(surfaceSize([], piles, alwaysStd, nothingShows)).toEqual({ w: 472, h: 817 });
  });

  it('ignores the cards that are not on the table', () => {
    const cards = [card('c', { zone: 'hand', x: 900, y: 900 })];
    // Nothing on the table: it fits, with no free room.
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 0, h: 0 });
  });

  it('never grows past where a card at the server bound of 20000 ends', () => {
    const cards = [card('c', { x: 20_000, y: 20_000 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 20_224, h: 20_224 });
    expect(surfaceSize(cards, [], alwaysStd, { w: 30_000, h: 25_000 })).toEqual({
      w: 30_000,
      h: 25_000,
    });
  });

  it('fills what shows of the table', () => {
    const cards = [card('c', { x: 400 })];
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 900 })).toEqual({ w: 1200, h: 900 });
    // Too narrow for the card, tall enough: free room on the right only.
    expect(surfaceSize(cards, [], alwaysStd, { w: 300, h: 200 })).toEqual({ w: 712, h: 200 });
  });

  it('adds free room only once the items no longer fit in what shows', () => {
    // The lowest item ends at 517: in a 744 tall view, the table does not scroll.
    const cards = [card('c', { x: 0, y: 360 })];
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
    const cards = [card('c', { x: 400, y: 300, exhausted: true })];
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
    expect(isOutOfPlay(pile('p', { kind: 'victory' }))).toBe(true);
    expect(isOutOfPlay(pile('p', { kind: 'aside' }))).toBe(true);
    expect(isOutOfPlay(pile('p', { kind: 'encounter' }))).toBe(false);
    expect(isOutOfPlay(pile('p', { kind: 'discard' }))).toBe(false);
  });
});

describe('footprints', () => {
  it('lists the table cards with their sizes, then the drawn piles as 112x157', () => {
    const cards = [
      card('a', { x: 10, y: 20 }),
      card('b', { x: 200, faceDown: true }),
      card('h', { zone: 'hand' }),
    ];
    const piles = [
      pile('enc', { kind: 'encounter', owner: -1, x: 500 }),
      pile('vic', { kind: 'victory', owner: -1, x: 700 }),
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
      pile('enc', { kind: 'encounter', owner: -1, x: 0, y: 30 }),
      pile('encd', { kind: 'encounterDiscard', owner: -1, x: 130, y: 30 }),
      pile('deck:p0', { kind: 'deck', owner: 0, x: 0, y: 360 }),
      pile('disc:p0', { kind: 'discard', owner: 0, x: 130, y: 360 }),
    ];
    expect(ownerFrames(piles)).toEqual([
      { owner: -1, x: -10, y: 20, w: 262, h: 177 },
      { owner: 0, x: -10, y: 350, w: 262, h: 177 },
    ]);
  });

  it('leaves the out-of-play piles out', () => {
    const piles = [
      pile('deck:p1', { kind: 'deck', owner: 1, x: 0, y: 690 }),
      pile('aside:p1', { kind: 'aside', owner: 1, x: 900, y: 690 }),
      pile('vic', { kind: 'victory', owner: -1, x: 0, y: 30 }),
    ];
    expect(ownerFrames(piles)).toEqual([{ owner: 1, x: -10, y: 680, w: 132, h: 177 }]);
  });

  it('frames the side decks and their discard piles with the deck and discard pile', () => {
    const piles = [
      pile('deck:p0', { kind: 'deck', owner: 0, x: 0, y: 360 }),
      pile('disc:p0', { kind: 'discard', owner: 0, x: 130, y: 360 }),
      pile('side:p0:0', { kind: 'sideDeck', owner: 0, x: 260, y: 360, label: 'Invocation' }),
      pile('sided:p0:0', { kind: 'sideDiscard', owner: 0, x: 390, y: 360 }),
    ];
    expect(ownerFrames(piles)).toEqual([{ owner: 0, x: -10, y: 350, w: 522, h: 177 }]);
  });
});

describe('outOfPlayChips', () => {
  const piles = [
    pile('enc', { kind: 'encounter', owner: -1 }),
    pile('saside', { kind: 'aside', owner: -1, count: 5 }),
    pile('vic', { kind: 'victory', owner: -1, count: 0 }),
    pile('deck:p0', { kind: 'deck', owner: 0 }),
    pile('aside:p0', { kind: 'aside', owner: 0, count: 2 }),
    pile('aside:p1', { kind: 'aside', owner: 1, count: 1 }),
  ];

  it("gives the villain the victory display, then the scenario's set-aside cards", () => {
    expect(outOfPlayChips(-1, piles)).toEqual([
      { pile: 'vic', kind: 'victory', label: 'Victory display', count: 0 },
      { pile: 'saside', kind: 'aside', label: 'Set-aside cards', count: 5 },
    ]);
  });

  it('puts the scenario areas first, by label, before the victory display and set-aside cards', () => {
    const withArea = [
      ...piles,
      pile('area:collection', {
        kind: 'scenarioArea',
        owner: -1,
        count: 3,
        label: 'The Collection',
      }),
    ];
    expect(outOfPlayChips(-1, withArea)).toEqual([
      { pile: 'area:collection', kind: 'scenarioArea', label: 'The Collection', count: 3 },
      { pile: 'vic', kind: 'victory', label: 'Victory display', count: 0 },
      { pile: 'saside', kind: 'aside', label: 'Set-aside cards', count: 5 },
    ]);
    // An area is the villain frame's: no player's frame shows it.
    expect(outOfPlayChips(0, withArea).map((chip) => chip.pile)).toEqual(['aside:p0']);
  });

  it("gives a player their own set-aside cards, and nobody else's", () => {
    expect(outOfPlayChips(0, piles)).toEqual([
      { pile: 'aside:p0', kind: 'aside', label: 'Set-aside cards', count: 2 },
    ]);
  });

  it('leaves out the piles the table does not have', () => {
    expect(outOfPlayChips(2, piles)).toEqual([]);
    expect(outOfPlayChips(-1, [pile('vic', { kind: 'victory', owner: -1, count: 10 })])).toEqual([
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
    const cards = [card('a', { x: 300 }), card('b', { x: 1500 })];
    expect(contentWidth(cards, [], std)).toBe(1612);
    // A frame reaches 10 units past its piles.
    expect(contentWidth([], [pile('d', { kind: 'deck', x: 130 })], std)).toBe(252);
  });

  it('leaves out the out-of-play piles and the cards off the table, and is 0 for an empty table', () => {
    const away = [card('h', { x: 3000, zone: 'hand' })];
    const aside = [pile('aside:p0', { kind: 'aside', x: 3000 })];
    expect(contentWidth(away, aside, std)).toBe(0);
  });

  it('takes in the turned box of an exhausted card', () => {
    const turned = contentWidth([card('c', { x: 0, exhausted: true })], [], std);
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

describe('filledFanPositions', () => {
  const card = { w: 140, h: 196 };
  const widthOf = (extent: { left: number; right: number }) => extent.right - extent.left;
  const pitchOf = (fan: { x: number }[]) => fan[1]!.x - fan[0]!.x;

  it('spreads the cards so that the fan as drawn spans the whole width', () => {
    for (const [n, width] of [
      [7, 339],
      [7, 732],
      [12, 864],
      [30, 900],
    ] as const) {
      const fan = filledFanPositions(n, width, card);
      expect(pitchOf(fan)).toBeLessThan(card.w - 40);
      expect(widthOf(fanExtent(fan, card))).toBeCloseTo(width, 6);
    }
  });

  it('overlaps the cards by 40 at least when there is room', () => {
    const fan = filledFanPositions(3, 1200, card);
    expect(pitchOf(fan)).toBeCloseTo(100);
    expect(widthOf(fanExtent(fan, card))).toBeLessThan(1200);
  });

  it('piles the cards up rather than reversing them when there is no room', () => {
    for (const p of filledFanPositions(7, 100, card)) {
      expect(p.x).toBeCloseTo(0);
    }
  });

  it('turns and sags the cards as fanPositions does', () => {
    for (const n of [3, 7, 30]) {
      const filled = filledFanPositions(n, 600, card);
      fanPositions(n, 600, card.w).forEach((slot, i) => {
        expect(filled[i]!.angle).toBe(slot.angle);
        expect(filled[i]!.y).toBe(slot.y);
      });
    }
  });

  it('puts a single card upright at the centre, and returns nothing for no card', () => {
    expect(filledFanPositions(1, 900, card)).toEqual([{ x: 0, y: 0, angle: 0 }]);
    expect(filledFanPositions(0, 900, card)).toEqual([]);
  });
});

describe('filledHandCard', () => {
  const raised = { w: 238, h: 333 };
  const pitchOf = (fan: { x: number }[]) => fan[1]!.x - fan[0]!.x;

  it('shrinks the raised card for each card to show a quarter of its width at least', () => {
    for (const [n, width] of [
      [7, 564],
      [10, 732],
      [15, 864],
    ] as const) {
      const shrunk = filledHandCard(raised, HAND_CARD_NARROW, n, width);
      expect(shrunk.w).toBeLessThan(raised.w);
      expect(shrunk.w).toBeGreaterThan(HAND_CARD_NARROW.w);
      expect(shrunk.h).toBe(Math.round((shrunk.w * HAND_CARD.h) / HAND_CARD.w));
      // Within the rounding of its height, and as large as fits: 1 px wider, it would not.
      const pitch = pitchOf(filledFanPositions(n, width, shrunk));
      expect(pitch).toBeGreaterThanOrEqual(0.25 * shrunk.w - 0.5);
      const wider = {
        w: shrunk.w + 1,
        h: Math.round(((shrunk.w + 1) * HAND_CARD.h) / HAND_CARD.w),
      };
      expect(pitchOf(filledFanPositions(n, width, wider))).toBeLessThan(0.25 * wider.w);
    }
  });

  it('keeps the raised card itself when the fan has room for it', () => {
    expect(filledHandCard(raised, HAND_CARD_NARROW, 3, 732)).toBe(raised);
  });

  it('is never smaller than the base card, and then the base card itself', () => {
    expect(filledHandCard(raised, HAND_CARD_NARROW, 30, 339)).toBe(HAND_CARD_NARROW);
    expect(filledHandCard(HAND_CARD_NARROW, HAND_CARD_NARROW, 12, 339)).toBe(HAND_CARD_NARROW);
  });

  it('keeps the raised card for one card or none', () => {
    expect(filledHandCard(raised, HAND_CARD_NARROW, 1, 100)).toBe(raised);
    expect(filledHandCard(raised, HAND_CARD_NARROW, 0, 100)).toBe(raised);
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
    expect(
      raisedHandCard(HAND_CARD, { w: 1500, h: 1080 }, { small: false, tablet: false }),
    ).toEqual({
      w: 286,
      h: 400,
    });
    expect(raisedHandCard(HAND_CARD, { w: 1500, h: 600 }, { small: false, tablet: false })).toEqual(
      {
        w: 227,
        h: 318,
      },
    );
  });

  it('follows a narrow table area', () => {
    expect(
      raisedHandCard(HAND_CARD_NARROW, { w: 500, h: 1000 }, { small: false, tablet: false }),
    ).toEqual({
      w: 162,
      h: 227,
    });
  });

  it("takes 65 % of the preview's card on a tablet", () => {
    // An iPad on its side: the preview's 358 px card.
    expect(raisedHandCard(HAND_CARD, { w: 1180, h: 820 }, { small: false, tablet: true })).toEqual({
      w: 233,
      h: 326,
    });
    expect(raisedHandCard(HAND_CARD, { w: 1180, h: 820 }, { small: false, tablet: false })).toEqual(
      {
        w: 286,
        h: 400,
      },
    );
    // Upright, narrow: 45 % of the table area.
    expect(
      raisedHandCard(HAND_CARD_NARROW, { w: 820, h: 1180 }, { small: false, tablet: true }),
    ).toEqual({
      w: 226,
      h: 316,
    });
    // Never below the base card.
    expect(raisedHandCard(HAND_CARD, { w: 600, h: 1000 }, { small: false, tablet: true })).toBe(
      HAND_CARD,
    );
  });

  it('is never smaller than the base card', () => {
    // A short window, and a table area not measured yet.
    expect(raisedHandCard(HAND_CARD, { w: 1500, h: 500 }, { small: false, tablet: false })).toBe(
      HAND_CARD,
    );
    expect(raisedHandCard(HAND_CARD, { w: 0, h: 1080 }, { small: false, tablet: false })).toBe(
      HAND_CARD,
    );
    const phone = smallHandCard({ w: 844, h: 390 });
    expect(raisedHandCard(phone, { w: 844, h: 390 }, { small: true, tablet: false })).toBe(phone);
  });

  it('never raises over half the window height on a small screen, its padding included', () => {
    const window = { w: 560, h: 500 };
    const base = smallHandCard(window);
    expect(base).toEqual({ w: 140, h: 196 });
    const raised = raisedHandCard(base, window, { small: true, tablet: false });
    expect(raised).toEqual({ w: 147, h: 206 });
    expect(raised.h + 44).toBeLessThanOrEqual(window.h / 2);
    // Elsewhere, the preview alone decides.
    expect(raisedHandCard(base, window, { small: false, tablet: false })).toEqual({
      w: 170,
      h: 238,
    });
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

describe("a tablet's selected hand card", () => {
  // Tablets, either way up: iPad, iPad Pro 12.9" and iPad mini.
  const TABLETS = [
    { w: 1180, h: 820 },
    { w: 820, h: 1180 },
    { w: 1366, h: 1024 },
    { w: 1024, h: 1366 },
    { w: 744, h: 1133 },
    { w: 1133, h: 744 },
  ];

  /**
   * Where a selected card of a raised hand across the whole window is drawn, popped, in the
   * window's px, as Hand.svelte draws it: the hand's bottom edge on the window's, its card turned
   * and scaled about a point a tenth of its height below its bottom edge, then moved by touchPop.
   */
  function poppedBox(
    slot: FanSlot,
    card: { w: number; h: number },
    window: { w: number; h: number },
  ): { left: number; top: number; right: number; bottom: number } {
    const room = {
      left: HAND_PADDING.side - window.w / 2,
      right: window.w / 2 - HAND_PADDING.side,
    };
    const pop = touchPop(slot, card, room);
    const pivot = {
      x: window.w / 2 + slot.x + pop.x,
      y: window.h - HAND_PADDING.bottom + 0.1 * card.h + pop.y,
    };
    const angle = (slot.angle * Math.PI) / 180;
    const s = TOUCH_POP_SCALE;
    const corners = [-0.5, 0.5].flatMap((x) =>
      [-1.1, -0.1].map((y) => ({ x: x * card.w * s, y: y * card.h * s })),
    );
    const xs = corners.map((c) => pivot.x + c.x * Math.cos(angle) - c.y * Math.sin(angle));
    const ys = corners.map((c) => pivot.y + c.x * Math.sin(angle) + c.y * Math.cos(angle));
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }

  it('pops less than a hovered card under a mouse', () => {
    expect(TOUCH_POP_SCALE).toBe(1.15);
  });

  it('shows whole in the window at any slot, below the top bar, for 5 to 8 cards', () => {
    for (const window of TABLETS) {
      const base = window.w > 900 ? HAND_CARD : HAND_CARD_NARROW;
      const raised = raisedHandCard(base, window, { small: false, tablet: true });
      for (let n = 5; n <= 8; n++) {
        const fanWidth = window.w - 2 * HAND_PADDING.side;
        const card = filledHandCard(raised, base, n, fanWidth);
        for (const slot of filledFanPositions(n, fanWidth, card)) {
          const box = poppedBox(slot, card, window);
          const where = `${window.w}x${window.h}, ${n} cards, slot ${slot.x}`;
          expect(box.top, where).toBeGreaterThanOrEqual(TOP_BAR_HEIGHT + HAND_PADDING.bottom);
          expect(box.bottom, where).toBeCloseTo(window.h - HAND_PADDING.bottom);
          expect(box.left, where).toBeGreaterThanOrEqual(HAND_PADDING.side - 1e-9);
          expect(box.right, where).toBeLessThanOrEqual(window.w - HAND_PADDING.side + 1e-9);
        }
      }
    }
  });

  it("fits below the top bar at the fan's steepest tilt, whatever the window's height", () => {
    // From the shortest window that is not a small screen up: the preview's card decides.
    for (let h = 501; h <= 1600; h++) {
      const window = { w: 1600, h };
      // The desktop's larger card too: the tablet's share only makes it smaller.
      for (const tablet of [true, false]) {
        const card = raisedHandCard(HAND_CARD, window, { small: false, tablet });
        const box = poppedBox({ x: 0, y: 0, angle: 22 }, card, window);
        expect(box.top, `${h}`).toBeGreaterThanOrEqual(TOP_BAR_HEIGHT + HAND_PADDING.bottom);
      }
    }
  });

  it("rests the middle card's bottom edge where it lies at rest, and lifts a sagging end card more", () => {
    const card = { w: 286, h: 400 };
    const room = { left: -1000, right: 1000 };
    // Scaled from below its bottom, the middle card would rise by 1.5 % of its height: it does not.
    expect(touchPop({ x: 0, y: 0, angle: 0 }, card, room)).toEqual({
      x: 0,
      y: expect.closeTo(6, 6),
    });
    // The end card of 8 sags by 58 px at 17.5°: it rises above its rest place.
    const [end] = filledFanPositions(8, 1144, card);
    expect(touchPop(end!, card, room).y).toBeLessThan(-30);
  });

  it('moves a tilted end card in, as far as it takes to keep within the room', () => {
    const card = { w: 286, h: 400 };
    const slots = filledFanPositions(6, 824, card);
    const room = { left: -412, right: 412 };
    const first = touchPop(slots[0]!, card, room);
    const last = touchPop(slots[5]!, card, room);
    expect(first.x).toBeGreaterThan(0);
    expect(last.x).toBeCloseTo(-first.x);
    // A card in the middle has room to spare.
    expect(touchPop(slots[2]!, card, room).x).toBe(0);
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

describe('freeSlot', () => {
  // 01010 is a double-size card and 01108 a landscape side scheme.
  const sizeOf = (c: CardView): Size =>
    c.code === '01010' ? 'dstd' : c.code === '01108' ? 'land' : 'std';
  // The card played: a portrait card from the hand.
  const played = card('h', { zone: 'hand' });
  // The first player token where the setup puts it, under the deck: below the row.
  const underDeck = { x: 30, y: 580 };
  /** The free slot of seat 0 for the played card, on a table of these cards, piles and token. */
  const slot = (cards: CardView[], piles: PileView[], firstPlayer: Point, active?: Point) =>
    freeSlot(played, { cards, piles, firstPlayer, active }, 0, sizeOf);
  // Alex's row, as the setup lays it out: deck, discard, identity at 300.
  const row = [
    pile('deck:p0', { owner: 0, x: 0, y: 360 }),
    pile('disc:p0', { kind: 'discard', owner: 0, x: 130, y: 360 }),
  ];
  const identity = card('id', { x: 300, y: 360 });
  // Doctor Strange's row: his Invocation deck and its discard pile push the identity to 560.
  const sides = [
    pile('side:p0:0', { kind: 'sideDeck', owner: 0, x: 260, y: 360 }),
    pile('side:p0:1', { kind: 'sideDiscard', owner: 0, x: 390, y: 360 }),
  ];
  const strange = card('id', { x: 560, y: 360 });

  it("starts 40 past the identity on a fresh row, the height of the viewer's deck", () => {
    // The piles lie 18 apart and the identity 58 past them: no room for a card between them.
    expect(slot([identity], row, underDeck)).toEqual({ x: 460, y: 360 });
    // Without the identity, past the discard pile.
    expect(slot([], row, underDeck)).toEqual({ x: 290, y: 360 });
  });

  it('starts 40 past the identity wherever the side piles push it', () => {
    expect(slot([strange], [...row, ...sides], underDeck)).toEqual({ x: 720, y: 360 });
  });

  it('starts at 0 at the top of the table without a deck', () => {
    expect(slot([], [], underDeck)).toEqual({ x: 0, y: 0 });
  });

  it('lands 40 past the last card of the row', () => {
    // A card at 460–572 sends the next one to 620.
    expect(slot([identity, card('a', { x: 460, y: 360 })], row, underDeck)).toEqual({
      x: 620,
      y: 360,
    });
    // Past one at 620–732 too, it lands at 780.
    const cards = [identity, card('a', { x: 460, y: 360 }), card('b', { x: 620, y: 360 })];
    expect(slot(cards, row, underDeck)).toEqual({ x: 780, y: 360 });
  });

  it('finds the last card whatever the order of the cards', () => {
    const cards = [card('b', { x: 620, y: 360 }), card('a', { x: 460, y: 360 }), identity];
    expect(slot(cards, row, underDeck)).toEqual({ x: 780, y: 360 });
    const hole = [card('b', { x: 780, y: 360 }), card('a', { x: 460, y: 360 }), identity];
    expect(slot(hole, row, underDeck)).toEqual({ x: 620, y: 360 });
  });

  it("the first player token is in the way when it lies in the viewer's row", () => {
    // Dragged to 720–804, the token lies where 720, past Doctor Strange at 560–672, would be.
    const firstPlayer = { x: 720, y: 360 };
    expect(slot([strange], [...row, ...sides], firstPlayer)).toEqual({ x: 850, y: 360 });
    // Under the deck, where the setup puts it, or in another row, it is not.
    expect(slot([identity], row, underDeck)).toEqual({ x: 460, y: 360 });
    expect(slot([identity], row, { x: 460, y: 0 })).toEqual({ x: 460, y: 360 });
  });

  it('has no first player token in the way in a one-hero game', () => {
    // Without the token, the card lands at 720, past Doctor Strange at 560–672.
    const table = { cards: [strange], piles: [...row, ...sides] };
    expect(freeSlot(played, table, 0, sizeOf)).toEqual({ x: 720, y: 360 });
  });

  it('freeSlot avoids the active counter', () => {
    // The 70 wide counter at 720–790 lies where 720, past Doctor Strange at 560–672, would be.
    const active = { x: 720, y: 360 };
    expect(slot([strange], [...row, ...sides], underDeck)).toEqual({ x: 720, y: 360 });
    expect(slot([strange], [...row, ...sides], underDeck, active)).toEqual({ x: 830, y: 360 });
    // In another row, it is not in the way.
    expect(slot([strange], [...row, ...sides], underDeck, { x: 720, y: 0 })).toEqual({
      x: 720,
      y: 360,
    });
  });

  it('leaves room for two neighbours to be exhausted without overlapping', () => {
    const first = card('a', { ...slot([identity], row, underDeck) });
    const second = card('b', { ...slot([identity, first], row, underDeck) });
    const [left, right] = footprints(
      [first, second].map((c) => ({ ...c, exhausted: true })),
      [],
      sizeOf,
    ).map(visualBox);
    expect(left!.right).toBeLessThanOrEqual(right!.left);
  });

  it('fills a hole wide enough for a 112-wide card with 40 free on each side', () => {
    // 460 needs 420–612 free: a card from 620 leaves it free, one from 610 does not.
    expect(slot([identity, card('a', { x: 620, y: 360 })], row, underDeck)).toEqual({
      x: 460,
      y: 360,
    });
    expect(slot([identity, card('a', { x: 610, y: 360 })], row, underDeck)).toEqual({
      x: 770,
      y: 360,
    });
    // Between 572 and 780, 620 has 580–772 free.
    const wide = [identity, card('a', { x: 460, y: 360 }), card('b', { x: 780, y: 360 })];
    expect(slot(wide, row, underDeck)).toEqual({ x: 620, y: 360 });
    // Between 572 and 770, it does not: the card goes past the last one, at 930.
    const narrow = [identity, card('a', { x: 460, y: 360 }), card('b', { x: 770, y: 360 })];
    expect(slot(narrow, row, underDeck)).toEqual({ x: 930, y: 360 });
  });

  it('makes room for the played card as wide as it lands', () => {
    // Between 572 and 780, a portrait card has room at 620, a landscape side scheme, 157 wide, does not.
    const cards = [identity, card('a', { x: 460, y: 360 }), card('b', { x: 780, y: 360 })];
    const table = { cards, piles: row, firstPlayer: underDeck };
    expect(freeSlot(played, table, 0, sizeOf)).toEqual({ x: 620, y: 360 });
    const scheme = card('s', { code: '01108', owner: -1, back: 'encounter', zone: 'pile' });
    expect(freeSlot(scheme, table, 0, sizeOf)).toEqual({ x: 940, y: 360 });
  });

  it('counts the visible width of a card: double size, face down, tilted when exhausted', () => {
    // Double size, 157 wide: 460–617, then 40 more, up to the grid.
    const double = card('a', { code: '01010', x: 460, y: 360 });
    expect(slot([identity, double], row, underDeck)).toEqual({ x: 660, y: 360 });
    // Face down, it is 112 wide again.
    const faceDown = card('a', { code: '01010', faceDown: true, x: 460, y: 360 });
    expect(slot([identity, faceDown], row, underDeck)).toEqual({ x: 620, y: 360 });
    // Exhausted, it turns 15°: its bounding box spans 442–590, and 630 goes up to 640.
    const exhausted = card('a', { x: 460, y: 360, exhausted: true });
    expect(slot([identity, exhausted], row, underDeck)).toEqual({ x: 640, y: 360 });
    // Its tilt counts on its left too: from 620, it reaches 602, before 612.
    const tilted = card('a', { x: 620, y: 360, exhausted: true });
    expect(slot([identity, tilted], row, underDeck)).toEqual({ x: 800, y: 360 });
  });

  it('a pile is in the way, but not an out-of-play pile, which is not drawn', () => {
    const inPlay = pile('deck:p1', { owner: 1, x: 470, y: 360 });
    expect(slot([identity], [...row, inPlay], underDeck)).toEqual({ x: 630, y: 360 });
    const aside = pile('aside:p0', { kind: 'aside', owner: 0, x: 470, y: 360 });
    expect(slot([identity], [...row, aside], underDeck)).toEqual({ x: 460, y: 360 });
  });

  it("only what reaches into the viewer's row counts", () => {
    const cards = [
      identity,
      card('above', { x: 460, y: 200 }),
      card('reaching', { x: 620, y: 210 }),
      card('below', { x: 460, y: 520 }),
    ];
    // "above" ends at 357, "reaching" at 367: only the second one is in the way.
    expect(slot(cards, row, underDeck)).toEqual({ x: 460, y: 360 });
    expect(slot([...cards, card('a', { x: 460, y: 400 })], row, underDeck)).toEqual({
      x: 780,
      y: 360,
    });
  });
});
