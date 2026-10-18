import type { Area, CardView, PileKind, PileView, Size, View } from '../lib/types';

export type { Size };

/** Table units are multiples of this. */
export const GRID = 10;

export interface Box {
  w: number;
  h: number;
  /** The image is turned a quarter to fit a portrait slot. */
  rotated: boolean;
}

const SIZES: Record<Size, { w: number; h: number }> = {
  std: { w: 100, h: 140 },
  land: { w: 140, h: 100 },
  dstd: { w: 140, h: 200 },
  dland: { w: 200, h: 140 },
};

const PORTRAIT_CARD = SIZES.std;
const PILE_BOX = PORTRAIT_CARD;
const ZONE_BOTTOM_MARGIN = 20;
const ZONE_MIN_HEIGHT = PORTRAIT_CARD.h + 60;

// Out-of-play piles, from left to right at the right end of their zone, past everything in play.
const OUT_OF_PLAY_ORDER: readonly PileKind[] = ['victory', 'aside'];
// Free room between the cards in play and the first out-of-play pile.
const ZONE_FREE_ROOM = 140;
const OUT_PILE_STEP = 120;
const OUT_PILE_EDGE_GAP = 10;

const FAN_RADIUS = 900;
const FAN_MAX_STEP_DEG = 5;
const FAN_MAX_TOTAL_DEG = 44;
const FAN_OVERLAP = 28;
// Kept free beside the row, and the share of a card the tilted outer cards take beyond it.
// The prototype's values (ruling P5a-R5). The cards turn around a point below their bottom edge
// (Hand.svelte's transform-origin 50% 110%), so at the full 22° the top corners of 132 × 185
// outer cards reach about 8 px past this room on each side, into the hand's padding. Reserving
// the real overhang instead would overlap 10 cards more than the prototype does at 1200 px.
const FAN_SIDE_ROOM = 80;
const FAN_TILT_ROOM = 0.35;

/** The box a card takes on the table. */
export function cardBox(size: Size, opts: { faceDown?: boolean; onPile?: boolean }): Box {
  if (opts.faceDown) {
    return { ...PORTRAIT_CARD, rotated: false };
  }
  const { w, h } = SIZES[size];
  const landscape = w > h;
  if (landscape && opts.onPile) {
    // Piles are portrait: the slot is the landscape box turned a quarter.
    return { w: h, h: w, rotated: true };
  }
  return { w, h, rotated: false };
}

/** Areas from top to bottom: villain, the viewer's own area, then the other players by seat. */
export function zoneOrder(view: View): Area[] {
  const own = view.you.role === 'player' ? view.you.area : undefined;
  const areas: Area[] = ['villain'];
  if (own) {
    areas.push(own);
  }
  for (const player of view.players) {
    if (player.area && player.area !== own) {
      areas.push(player.area);
    }
  }
  return areas;
}

/** A victory display or set-aside pile: placed by the client, not counted as content. */
export function isOutOfPlay(pile: PileView): boolean {
  return OUT_OF_PLAY_ORDER.includes(pile.kind);
}

/** Where a card or a pile lies in its zone, in table units. */
export interface Footprint {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The table cards of one area, then its piles, with the room each takes. */
export function footprints(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): Footprint[] {
  const onTable = cards
    .filter((c) => c.zone === 'table' && c.area === area)
    .map((c) => {
      const { w, h } = cardBox(sizeOf(c), { faceDown: c.faceDown, onPile: !!c.onPile });
      return { id: c.id, x: c.x, y: c.y, w, h };
    });
  const stacked = piles
    .filter((p) => p.area === area)
    .map((p) => ({ id: p.id, x: p.x, y: p.y, ...PILE_BOX }));
  return [...onTable, ...stacked];
}

// Less than this much of an item showing at the edge counts as hidden.
const EDGE_SLACK = 10;

/**
 * What lies out of view on each side of a zone scrolled to show table units
 * `left` to `right`, each side ordered from left to right.
 */
export function hiddenAside(
  items: Footprint[],
  left: number,
  right: number,
): { left: Footprint[]; right: Footprint[] } {
  const byX = [...items].sort((a, b) => a.x - b.x);
  return {
    left: byX.filter((item) => item.x + item.w <= left + EDGE_SLACK),
    right: byX.filter((item) => item.x >= right - EDGE_SLACK),
  };
}

interface Extent {
  right: number;
  bottom: number;
}

/**
 * The right and bottom edges of what is in play on the table of one area.
 * Out-of-play piles are left out: they follow the zone's right edge and sit
 * on its top row, which the minimum height already covers.
 */
function extentOf(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): Extent {
  const inPlay = footprints(
    cards,
    piles.filter((p) => !isOutOfPlay(p)),
    area,
    sizeOf,
  );
  return {
    right: Math.max(0, ...inPlay.map((item) => item.x + item.w)),
    bottom: Math.max(0, ...inPlay.map((item) => item.y + item.h)),
  };
}

/** Height a zone needs: its lowest bottom plus a margin, and never under one card row plus 60. */
export function zoneMinHeight(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): number {
  const { bottom } = extentOf(cards, piles, area, sizeOf);
  return Math.max(bottom + ZONE_BOTTOM_MARGIN, ZONE_MIN_HEIGHT);
}

/**
 * Width of a zone, as the prototype has it: at least the visible width (in
 * table units), and always room past the cards in play for 140 more, plus
 * 120 per out-of-play pile.
 */
export function zoneWidth(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
  visibleWidth: number = 0,
): number {
  const outPiles = piles.filter((p) => p.area === area && isOutOfPlay(p)).length;
  const { right } = extentOf(cards, piles, area, sizeOf);
  return Math.max(visibleWidth, right + ZONE_FREE_ROOM + OUT_PILE_STEP * outPiles);
}

/**
 * The piles of one area, with the out-of-play ones moved to the right end
 * of a zone `width` wide: the victory display, then the set-aside cards,
 * 120 apart, the last one 10 from the edge, on the top row. The server's
 * position for them is ignored: it cannot know the viewport.
 */
export function placeOutPiles(piles: PileView[], area: Area, width: number): PileView[] {
  const inArea = piles.filter((p) => p.area === area);
  const out = inArea
    .filter(isOutOfPlay)
    .sort((a, b) => OUT_OF_PLAY_ORDER.indexOf(a.kind) - OUT_OF_PLAY_ORDER.indexOf(b.kind));
  const lastX = width - OUT_PILE_EDGE_GAP - PILE_BOX.w;
  return inArea.map((p) => {
    const slot = out.indexOf(p);
    if (slot < 0) {
      return p;
    }
    return { ...p, x: lastX - (out.length - 1 - slot) * OUT_PILE_STEP, y: 0 };
  });
}

export interface FanSlot {
  x: number;
  y: number;
  angle: number;
}

/** A card in the hand. */
export const HAND_CARD = { w: 132, h: 185 } as const;

/** A card in the hand on a narrow screen (900 px wide or less). */
export const HAND_CARD_NARROW = { w: 100, h: 140 } as const;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Lays out `n` cards of a hand, as the prototype does: the cards overlap by
 * 28, more when the row does not fit `width` (keeping 80 plus a third of a
 * card for the tilted outer cards), and turn 5 degrees apart, 44 at most in
 * total. Each card sags by how far a circle of radius 900 falls away from its
 * top at that angle.
 *
 * Coordinates are relative to the fan centre, the middle of the middle card:
 * `x` grows to the right, `y` grows downward (outer cards sit lower), `angle`
 * is in degrees, clockwise.
 */
export function fanPositions(n: number, width: number, cardWidth: number = HAND_CARD.w): FanSlot[] {
  if (n <= 0) {
    return [];
  }
  const gaps = Math.max(1, n - 1);
  const step = Math.min(FAN_MAX_STEP_DEG, FAN_MAX_TOTAL_DEG / gaps);
  const roomy = cardWidth - FAN_OVERLAP;
  const fitted = (width - FAN_SIDE_ROOM - (1 + FAN_TILT_ROOM) * cardWidth) / gaps;
  // Never below 0: with no room at all, the cards pile up rather than swap places.
  const pitch = Math.max(0, Math.min(roomy, fitted));

  return Array.from({ length: n }, (_, i) => {
    const t = i - (n - 1) / 2;
    const angle = t * step;
    return {
      x: t * pitch,
      y: FAN_RADIUS * (1 - Math.cos(toRadians(angle))),
      angle,
    };
  });
}
