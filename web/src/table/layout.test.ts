import { describe, expect, it } from 'vitest';
import type { Area, CardView, PileView, PlayerView, View } from '../lib/types';
import {
  cardBox,
  fanPositions,
  footprints,
  hiddenAside,
  isOutOfPlay,
  visualBox,
  zoneHeights,
  zoneMinHeight,
  zoneOrder,
  zoneShare,
  zoneWidth,
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
  return { id: 'p', kind: 'deck', owner: 0, area: 'p0', x: 0, y: 0, count: 10, ...overrides };
}

function player(area?: Area): PlayerView {
  return { name: 'n', color: 0, host: false, area, ready: true, handCount: 0 };
}

function view(playerAreas: (Area | undefined)[], youArea?: Area): View {
  return {
    id: 'g',
    phase: 'playing',
    you: { role: youArea ? 'player' : 'spectator', color: 0, host: false, area: youArea },
    players: playerAreas.map(player),
    spectators: 0,
    config: { scenario: '', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    log: [],
  };
}

const alwaysStd = (): Size => 'std';

describe('cardBox sizes', () => {
  it('returns the four sizes', () => {
    expect(cardBox('std', {})).toEqual({ w: 100, h: 140, rotated: false });
    expect(cardBox('land', {})).toEqual({ w: 140, h: 100, rotated: false });
    expect(cardBox('dstd', {})).toEqual({ w: 140, h: 200, rotated: false });
    expect(cardBox('dland', {})).toEqual({ w: 200, h: 140, rotated: false });
  });

  it('forces a face-down card to 100x140', () => {
    for (const size of ['std', 'land', 'dstd', 'dland'] as const) {
      expect(cardBox(size, { faceDown: true })).toEqual({ w: 100, h: 140, rotated: false });
    }
  });

  it('keeps a portrait slot for a landscape card on a pile', () => {
    expect(cardBox('land', { onPile: true })).toEqual({ w: 100, h: 140, rotated: true });
    expect(cardBox('dland', { onPile: true })).toEqual({ w: 140, h: 200, rotated: true });
  });

  it('leaves a portrait card on a pile unrotated', () => {
    expect(cardBox('std', { onPile: true })).toEqual({ w: 100, h: 140, rotated: false });
  });
});

describe('zoneOrder', () => {
  it('puts own area second', () => {
    const v = view(['p0', 'p1', 'p2'], 'p1');
    expect(zoneOrder(v)).toEqual(['villain', 'p1', 'p0', 'p2']);
  });

  it('lists every player in seat order for a spectator', () => {
    expect(zoneOrder(view(['p0', 'p1']))).toEqual(['villain', 'p0', 'p1']);
  });

  it('skips players without an area', () => {
    expect(zoneOrder(view(['p0', undefined, 'p2'], 'p0'))).toEqual(['villain', 'p0', 'p2']);
  });
});

describe('zone size', () => {
  it('has a minimum height of one card row plus 60', () => {
    expect(zoneMinHeight([], [], 'villain', alwaysStd)).toBe(200);
  });

  it('grows with the lowest card bottom plus 20', () => {
    const cards = [card({ area: 'villain', y: 300 }), card({ area: 'villain', y: 10 })];
    expect(zoneMinHeight(cards, [], 'villain', alwaysStd)).toBe(460);
  });

  it('counts piles as 100x140 boxes', () => {
    expect(zoneMinHeight([], [pile({ area: 'p0', y: 400 })], 'p0', alwaysStd)).toBe(560);
  });

  it('ignores other areas and cards that are not on the table', () => {
    const cards = [card({ area: 'p1', y: 900 }), card({ area: 'villain', zone: 'hand', y: 900 })];
    expect(zoneMinHeight(cards, [], 'villain', alwaysStd)).toBe(200);
  });

  it('counts out-of-play piles where the server put them', () => {
    expect(zoneMinHeight([], [pile({ kind: 'aside', area: 'p0', y: 20 })], 'p0', alwaysStd)).toBe(
      200,
    );
    expect(zoneMinHeight([], [pile({ kind: 'aside', area: 'p0', y: 400 })], 'p0', alwaysStd)).toBe(
      560,
    );
  });

  it('is 140 wider than its rightmost card', () => {
    const cards = [card({ area: 'villain', x: 50 }), card({ area: 'villain', x: 400 })];
    expect(zoneWidth(cards, [], 'villain', alwaysStd)).toBe(640);
  });

  it('uses the size of each card', () => {
    const cards = [card({ area: 'villain', x: 100 })];
    expect(zoneWidth(cards, [], 'villain', () => 'dland')).toBe(440);
  });

  it('measures a face-down card as 100x140', () => {
    const cards = [card({ area: 'villain', x: 100, faceDown: true })];
    expect(zoneWidth(cards, [], 'villain', () => 'dland')).toBe(340);
  });

  it('fills the visible width', () => {
    const cards = [card({ area: 'villain', x: 400 })];
    expect(zoneWidth(cards, [], 'villain', alwaysStd, 1200)).toBe(1200);
    expect(zoneWidth(cards, [], 'villain', alwaysStd, 300)).toBe(640);
  });

  it('measures out-of-play piles where the server put them, with no extra room', () => {
    const cards = [card({ area: 'villain', x: 840 })];
    const rail = [
      pile({ id: 'enc', kind: 'encounter', area: 'villain', x: 0 }),
      pile({ id: 'vic', kind: 'victory', area: 'villain', x: 240, y: 20 }),
      pile({ id: 'aside', kind: 'aside', area: 'villain', x: 360, y: 20 }),
      pile({ id: 'other', kind: 'aside', area: 'p0', x: 2000, y: 20 }),
    ];
    expect(zoneWidth(cards, rail, 'villain', alwaysStd)).toBe(940 + 140);
    // The rightmost item sets the width, whatever its kind.
    const far = [pile({ id: 'vic', kind: 'victory', area: 'villain', x: 1200 })];
    expect(zoneWidth(cards, far, 'villain', alwaysStd)).toBe(1300 + 140);
  });
});

describe('zoneHeights', () => {
  const empty = { min: 200 };

  it('splits the available height in two for two zones', () => {
    expect(zoneHeights([empty, empty], 1000)).toEqual([500, 500]);
  });

  it('splits it in thirds for three zones, the last one taking the rounding', () => {
    expect(zoneHeights([empty, empty, empty], 1500)).toEqual([500, 500, 500]);
    expect(zoneHeights([empty, empty, empty], 1000)).toEqual([333, 333, 334]);
    // Rounded up: the zones never end short of the available height.
    expect(zoneHeights([empty, empty, empty], 1000.5)).toEqual([333, 333, 335]);
  });

  it('shrinks the last zone when an earlier one is taller than its share', () => {
    expect(zoneHeights([{ min: 600 }, empty, empty], 1500)).toEqual([600, 500, 400]);
    expect(zoneHeights([{ min: 200, chosen: 700 }, empty], 1000)).toEqual([700, 300]);
    expect(zoneHeights([empty, { min: 200, chosen: 300 }, empty], 1500)).toEqual([500, 300, 700]);
  });

  it('never makes the last zone shorter than its minimum', () => {
    expect(zoneHeights([{ min: 900 }, empty], 1000)).toEqual([900, 200]);
    expect(zoneHeights([empty, { min: 600 }], 1000)).toEqual([500, 600]);
  });

  it('caps the split at three shares, the last zone getting at least one', () => {
    expect(zoneHeights([empty, empty, empty, empty], 1500)).toEqual([500, 500, 500, 500]);
    expect(zoneHeights([empty, empty, empty, empty, empty], 900)).toEqual([
      300, 300, 300, 300, 300,
    ]);
    expect(zoneHeights([empty, empty, empty, { min: 600 }], 1500)).toEqual([500, 500, 500, 600]);
  });

  it('fits the cards when nothing is available, keeping a chosen height', () => {
    expect(zoneHeights([{ min: 460 }, empty, empty], 0)).toEqual([460, 200, 200]);
    expect(zoneHeights([{ min: 200, chosen: 260 }, empty], 0)).toEqual([260, 200]);
    expect(zoneHeights([empty, empty], -50)).toEqual([200, 200]);
  });

  it('keeps what a zone grew to', () => {
    expect(zoneHeights([{ min: 200, grown: 700 }, empty], 1000)).toEqual([700, 300]);
    expect(zoneHeights([{ min: 200, grown: 300, chosen: 260 }, empty], 1000)).toEqual([300, 700]);
    expect(zoneHeights([empty, { min: 200, grown: 800 }], 1000)).toEqual([500, 800]);
    expect(zoneHeights([{ min: 200, grown: 460 }, empty], 0)).toEqual([460, 200]);
  });

  it('returns nothing for no zone', () => {
    expect(zoneHeights([], 1000)).toEqual([]);
  });
});

describe('zoneShare', () => {
  it('shares the available height between three zones at most, in whole units', () => {
    expect(zoneShare(2, 1000)).toBe(500);
    expect(zoneShare(3, 1000)).toBe(333);
    expect(zoneShare(5, 1500)).toBe(500);
  });

  it('is 0 with nothing available or no zone', () => {
    expect(zoneShare(3, 0)).toBe(0);
    expect(zoneShare(3, -90)).toBe(0);
    expect(zoneShare(0, 1000)).toBe(0);
  });
});

describe('an exhausted card', () => {
  // A std card turned 15 degrees: its bounding box is 100·cos + 140·sin wide and
  // 100·sin + 140·cos tall, around the same centre.
  const turnedWidth = 100 * Math.cos(Math.PI / 12) + 140 * Math.sin(Math.PI / 12);
  const turnedHeight = 100 * Math.sin(Math.PI / 12) + 140 * Math.cos(Math.PI / 12);

  it('shows a bounding box grown around its centre', () => {
    const box = visualBox({ id: 'a', x: 400, y: 300, w: 100, h: 140, exhausted: true });
    expect(box.left).toBeCloseTo(450 - turnedWidth / 2);
    expect(box.right).toBeCloseTo(450 + turnedWidth / 2);
    expect(box.bottom).toBeCloseTo(370 + turnedHeight / 2);
    expect(visualBox({ id: 'b', x: 400, y: 300, w: 100, h: 140 })).toEqual({
      left: 400,
      right: 500,
      bottom: 440,
    });
  });

  it('makes its zone taller and wider, rounded up to whole units', () => {
    const cards = [card({ area: 'villain', x: 400, y: 300, exhausted: true })];
    // 470.56 and 656.41.
    expect(zoneMinHeight(cards, [], 'villain', alwaysStd)).toBe(471);
    expect(zoneWidth(cards, [], 'villain', alwaysStd)).toBe(657);
  });

  it('is not scrolled out on the left while its turned corner shows', () => {
    // Its unturned box ends at 100, its turned one about 16 further.
    const items = footprints([card({ area: 'p0', exhausted: true })], [], 'p0', alwaysStd);
    expect(hiddenAside(items, 100, 600).left).toEqual([]);
    expect(hiddenAside(items, 120, 600).left).toHaveLength(1);
  });

  it('is not scrolled out on the right while its turned corner shows', () => {
    // Its unturned box starts at 500, its turned one about 16 before.
    const items = footprints([card({ area: 'p0', x: 500, exhausted: true })], [], 'p0', alwaysStd);
    expect(hiddenAside(items, 0, 500).right).toEqual([]);
    expect(hiddenAside(items, 0, 490).right).toHaveLength(1);
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
  it("lists a zone's table cards with their sizes, then its piles as 100x140", () => {
    const cards = [
      card({ id: 'a', area: 'villain', x: 10, y: 20 }),
      card({ id: 'b', area: 'villain', x: 200, faceDown: true }),
      card({ id: 'h', area: 'villain', zone: 'hand' }),
      card({ id: 'o', area: 'p0' }),
    ];
    const piles = [pile({ id: 'enc', area: 'villain', x: 500 }), pile({ id: 'd', area: 'p0' })];
    expect(footprints(cards, piles, 'villain', () => 'land')).toEqual([
      { id: 'a', x: 10, y: 20, w: 140, h: 100 },
      { id: 'b', x: 200, y: 0, w: 100, h: 140 },
      { id: 'enc', x: 500, y: 0, w: 100, h: 140 },
    ]);
  });
});

describe('hiddenAside', () => {
  const at = (id: string, x: number) => ({ id, x, y: 0, w: 100, h: 140 });
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it('finds what is scrolled out on each side, 10 units of it showing at most', () => {
    const items = [at('far right', 900), at('in', 300), at('right', 595), at('left', 10)];
    items.push(at('edge left', 0), at('peeking', 15), at('peeking right', 585));
    const hidden = hiddenAside(items, 100, 600);
    expect(ids(hidden.left)).toEqual(['edge left', 'left']);
    expect(ids(hidden.right)).toEqual(['right', 'far right']);
  });

  it('finds nothing when everything shows', () => {
    expect(hiddenAside([at('a', 0), at('b', 500)], 0, 600)).toEqual({ left: [], right: [] });
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
