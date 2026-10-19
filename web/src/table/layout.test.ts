import { describe, expect, it } from 'vitest';
import type { CardView, PileView } from '../lib/types';
import {
  cardBox,
  fanPositions,
  footprints,
  isOutOfPlay,
  ownerFrames,
  surfaceSize,
  visualBox,
  type Size,
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
  it('returns the four sizes, 40 % larger than the hand cards', () => {
    expect(cardBox('std', {})).toEqual({ w: 140, h: 196, rotated: false });
    expect(cardBox('land', {})).toEqual({ w: 196, h: 140, rotated: false });
    expect(cardBox('dstd', {})).toEqual({ w: 196, h: 280, rotated: false });
    expect(cardBox('dland', {})).toEqual({ w: 280, h: 196, rotated: false });
  });

  it('forces a face-down card to 140x196', () => {
    for (const size of ['std', 'land', 'dstd', 'dland'] as const) {
      expect(cardBox(size, { faceDown: true })).toEqual({ w: 140, h: 196, rotated: false });
    }
  });

  it('keeps a portrait slot for a landscape card on a pile', () => {
    expect(cardBox('land', { onPile: true })).toEqual({ w: 140, h: 196, rotated: true });
    expect(cardBox('dland', { onPile: true })).toEqual({ w: 196, h: 280, rotated: true });
  });

  it('leaves a portrait card on a pile unrotated', () => {
    expect(cardBox('std', { onPile: true })).toEqual({ w: 140, h: 196, rotated: false });
  });
});

describe('surfaceSize', () => {
  it('leaves 200 free past the rightmost item and 300 under the lowest one', () => {
    const cards = [card({ x: 50, y: 300 }), card({ x: 400, y: 10 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 740, h: 796 });
  });

  it('uses the size of each card, a face-down card being 140x196', () => {
    expect(surfaceSize([card({ x: 100 })], [], () => 'dland', nothingShows)).toEqual({
      w: 580,
      h: 496,
    });
    const faceDown = [card({ x: 100, faceDown: true })];
    expect(surfaceSize(faceDown, [], () => 'dland', nothingShows)).toEqual({ w: 440, h: 496 });
  });

  it('counts piles as 140x196 boxes, but not the out-of-play piles, which are not drawn', () => {
    const piles = [
      pile({ x: 160, y: 360 }),
      pile({ id: 'vic', kind: 'victory', x: 2000, y: 2000 }),
      pile({ id: 'aside', kind: 'aside', x: 3000, y: 3000 }),
    ];
    expect(surfaceSize([], piles, alwaysStd, nothingShows)).toEqual({ w: 500, h: 856 });
  });

  it('ignores the cards that are not on the table', () => {
    const cards = [card({ zone: 'hand', x: 900, y: 900 })];
    expect(surfaceSize(cards, [], alwaysStd, nothingShows)).toEqual({ w: 200, h: 300 });
  });

  it('fills what shows of the table', () => {
    const cards = [card({ x: 400 })];
    expect(surfaceSize(cards, [], alwaysStd, { w: 1200, h: 900 })).toEqual({ w: 1200, h: 900 });
    expect(surfaceSize(cards, [], alwaysStd, { w: 300, h: 200 })).toEqual({ w: 740, h: 496 });
  });
});

describe('an exhausted card', () => {
  // A std card turned 15 degrees: its bounding box is 140·cos + 196·sin wide and
  // 140·sin + 196·cos tall, around the same centre.
  const turnedWidth = 140 * Math.cos(Math.PI / 12) + 196 * Math.sin(Math.PI / 12);
  const turnedHeight = 140 * Math.sin(Math.PI / 12) + 196 * Math.cos(Math.PI / 12);

  it('shows a bounding box grown around its centre', () => {
    const box = visualBox({ id: 'a', x: 400, y: 300, w: 140, h: 196, exhausted: true });
    expect(box.left).toBeCloseTo(470 - turnedWidth / 2);
    expect(box.right).toBeCloseTo(470 + turnedWidth / 2);
    expect(box.bottom).toBeCloseTo(398 + turnedHeight / 2);
    expect(visualBox({ id: 'b', x: 400, y: 300, w: 140, h: 196 })).toEqual({
      left: 400,
      right: 540,
      bottom: 496,
    });
  });

  it('makes the surface wider and taller, rounded up to whole units', () => {
    const cards = [card({ x: 400, y: 300, exhausted: true })];
    const right = Math.ceil(470 + turnedWidth / 2);
    const bottom = Math.ceil(398 + turnedHeight / 2);
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
  it('lists the table cards with their sizes, then the drawn piles as 140x196', () => {
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
      { id: 'a', x: 10, y: 20, w: 196, h: 140 },
      { id: 'b', x: 200, y: 0, w: 140, h: 196 },
      { id: 'enc', x: 500, y: 0, w: 140, h: 196 },
    ]);
  });
});

describe('ownerFrames', () => {
  it("frames each owner's deck and discard pile, 10 units off their edges", () => {
    const piles = [
      pile({ id: 'enc', kind: 'encounter', owner: -1, x: 0, y: 30 }),
      pile({ id: 'encd', kind: 'encounterDiscard', owner: -1, x: 160, y: 30 }),
      pile({ id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 360 }),
      pile({ id: 'disc:p0', kind: 'discard', owner: 0, x: 160, y: 360 }),
    ];
    expect(ownerFrames(piles)).toEqual([
      { owner: -1, x: -10, y: 20, w: 320, h: 216 },
      { owner: 0, x: -10, y: 350, w: 320, h: 216 },
    ]);
  });

  it('leaves the out-of-play piles out', () => {
    const piles = [
      pile({ id: 'deck:p1', kind: 'deck', owner: 1, x: 0, y: 690 }),
      pile({ id: 'aside:p1', kind: 'aside', owner: 1, x: 900, y: 690 }),
      pile({ id: 'vic', kind: 'victory', owner: -1, x: 0, y: 30 }),
    ];
    expect(ownerFrames(piles)).toEqual([{ owner: 1, x: -10, y: 680, w: 160, h: 216 }]);
  });
});

describe('fanPositions', () => {
  const cardWidth = 132;
  const cardHeight = (cardWidth * 185) / 132;

  /** The distance between two neighbouring cards. */
  function pitchOf(fan: { x: number }[]): number {
    return fan[1]!.x - fan[0]!.x;
  }

  // Width of the box around the fanned cards. Each card turns around a point below its bottom
  // edge (transform-origin 50% 110% in Hand.svelte), so its top corners swing out the most.
  function boundingWidth(fan: { x: number; angle: number }[]): number {
    const xs = fan.flatMap((p) => {
      const a = (p.angle * Math.PI) / 180;
      // The corners, from the pivot, with y growing downward.
      const corners = [-cardWidth / 2, cardWidth / 2].flatMap((x) =>
        [-1.1 * cardHeight, -0.1 * cardHeight].map((y) => ({ x, y })),
      );
      return corners.map((c) => p.x + c.x * Math.cos(a) - c.y * Math.sin(a));
    });
    return Math.max(...xs) - Math.min(...xs);
  }

  it('overlaps the cards by 28 when there is room', () => {
    expect(pitchOf(fanPositions(5, 1200))).toBeCloseTo(104);
    expect(pitchOf(fanPositions(5, 1200, 100))).toBeCloseTo(72);
  });

  it.each([
    [12, 85.6],
    [15, 67.3],
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
  ])('keeps %i cards inside %i, but for the accepted 8.4 on each side', (n, width) => {
    expect(boundingWidth(fanPositions(n, width))).toBeLessThanOrEqual(width + 2 * 8.4);
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

  it('sags along a circle of radius 900', () => {
    for (const p of fanPositions(12, 1200)) {
      expect(p.y).toBeCloseTo(900 * (1 - Math.cos((p.angle * Math.PI) / 180)), 6);
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
