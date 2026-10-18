import { describe, expect, it } from 'vitest';
import type { Area, CardView, PileView, PlayerView, View } from '../lib/types';
import { cardBox, fanPositions, zoneMinHeight, zoneOrder, zoneWidth, type Size } from './layout';

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

  it('follows its rightmost card', () => {
    const cards = [card({ area: 'villain', x: 50 }), card({ area: 'villain', x: 400 })];
    expect(zoneWidth(cards, [], 'villain', alwaysStd)).toBe(540);
  });

  it('uses the size of each card', () => {
    const cards = [card({ area: 'villain', x: 100 })];
    expect(zoneWidth(cards, [], 'villain', () => 'dland')).toBe(340);
  });

  it('measures a face-down card as 100x140', () => {
    const cards = [card({ area: 'villain', x: 100, faceDown: true })];
    expect(zoneWidth(cards, [], 'villain', () => 'dland')).toBe(240);
  });
});

describe('fanPositions', () => {
  const radius = 900;
  const cardWidth = 132;
  const cardHeight = (cardWidth * 185) / 132;

  // Width of the box around the rotated outer cards, centre to centre plus their overhang.
  function boundingWidth(fan: { x: number; angle: number }[]): number {
    const bounds = fan.map((p) => {
      const a = (Math.abs(p.angle) * Math.PI) / 180;
      const half = (cardWidth * Math.cos(a) + cardHeight * Math.sin(a)) / 2;
      return { left: p.x - half, right: p.x + half };
    });
    return Math.max(...bounds.map((b) => b.right)) - Math.min(...bounds.map((b) => b.left));
  }

  it.each([
    [1, 900],
    [5, 900],
    [12, 900],
    [12, 700],
    [12, 400],
  ])('fits the width for %i cards in %i', (n, width) => {
    expect(boundingWidth(fanPositions(n, width))).toBeLessThanOrEqual(width - 36 + 1e-6);
  });

  it('honours a custom card width', () => {
    const fan = fanPositions(12, 600, 100);
    const a = (fan[11]!.angle * Math.PI) / 180;
    const outer = 2 * fan[11]!.x + 100 * Math.cos(a) + ((100 * 185) / 132) * Math.sin(a);
    expect(outer).toBeLessThanOrEqual(600 - 36 + 1e-6);
  });

  it.each([900, 700, 300])('stays on the arc at width %i', (width) => {
    for (const p of fanPositions(12, width)) {
      const a = (p.angle * Math.PI) / 180;
      expect(p.x).toBeCloseTo(radius * Math.sin(a), 6);
      expect(p.y).toBeCloseTo(radius * (1 - Math.cos(a)), 6);
    }
  });

  it('reduces the angle step when the fan does not fit', () => {
    const roomy = fanPositions(12, 1600).map((p) => p.angle);
    const tight = fanPositions(12, 700).map((p) => p.angle);
    expect(tight[11]!).toBeLessThan(roomy[11]!);
    expect(tight[11]!).toBeGreaterThan(0);
  });

  it('flattens the fan when there is no room at all', () => {
    for (const p of fanPositions(12, 100)) {
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(0);
      expect(p.angle).toBeCloseTo(0);
    }
  });

  it('is symmetric around angle 0', () => {
    for (const width of [900, 700]) {
      const fan = fanPositions(5, width);
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

  it('spreads 5 degrees apart, at most 44 degrees in total', () => {
    expect(fanPositions(3, 900).map((p) => p.angle)).toEqual([-5, 0, 5]);
    const wide = fanPositions(30, 5000).map((p) => p.angle);
    expect(wide[wide.length - 1]! - wide[0]!).toBeCloseTo(44);
  });

  it('returns nothing for no card', () => {
    expect(fanPositions(0, 900)).toEqual([]);
  });
});
