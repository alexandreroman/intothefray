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

const OUT_OF_PLAY_KINDS: readonly PileKind[] = ['victory', 'aside'];
// Free room past the rightmost item of a zone.
const ZONE_FREE_ROOM = 140;

const FAN_RADIUS = 900;
const FAN_MAX_STEP_DEG = 5;
const FAN_MAX_TOTAL_DEG = 44;
const FAN_OVERLAP = 28;
// Kept free beside the row, and the share of a card the tilted outer cards take beyond it.
// The prototype's values (ruling P5a-R5). The cards turn around a point below their bottom edge
// (Hand.svelte's transform-origin 50% 110%), so at the full 22° the top corners of 132 × 185
// outer cards reach about 8 px past this room on each side, into the hand's padding. Reserving
// that overhang instead would pack a 10-card hand tighter than the prototype does at 1200 px.
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

/**
 * A victory display or set-aside pile. The server sets them in the rail at
 * the left of their zone, after the deck and the discard pile.
 */
export function isOutOfPlay(pile: PileView): boolean {
  return OUT_OF_PLAY_KINDS.includes(pile.kind);
}

/** Where a card or a pile lies in its zone, in table units. */
export interface Footprint {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** An exhausted card is drawn turned: see visualBox. */
  exhausted?: boolean;
}

/** Keep in step with --exhaust-angle (tokens.css). */
const EXHAUST_RADIANS = (15 * Math.PI) / 180;

/**
 * The left, right and bottom edges an item shows, as the prototype's
 * visualBox: an exhausted card is turned, and its bounding box grows around
 * the same centre (w·cos + h·sin wide, w·sin + h·cos tall).
 */
export function visualBox(item: Footprint): { left: number; right: number; bottom: number } {
  if (!item.exhausted) {
    return { left: item.x, right: item.x + item.w, bottom: item.y + item.h };
  }
  const cos = Math.cos(EXHAUST_RADIANS);
  const sin = Math.sin(EXHAUST_RADIANS);
  const turnedWidth = item.w * cos + item.h * sin;
  const turnedHeight = item.w * sin + item.h * cos;
  const middle = item.x + item.w / 2;
  return {
    left: middle - turnedWidth / 2,
    right: middle + turnedWidth / 2,
    bottom: item.y + item.h / 2 + turnedHeight / 2,
  };
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
      return { id: c.id, x: c.x, y: c.y, w, h, exhausted: c.exhausted };
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
    left: byX.filter((item) => visualBox(item).right <= left + EDGE_SLACK),
    right: byX.filter((item) => visualBox(item).left >= right - EDGE_SLACK),
  };
}

interface Extent {
  right: number;
  bottom: number;
}

/** The right and bottom edges of what lies on the table of one area, piles included. */
function extentOf(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): Extent {
  const boxes = footprints(cards, piles, area, sizeOf).map(visualBox);
  // Rounded up: a turned card's box ends between two units.
  return {
    right: Math.ceil(Math.max(0, ...boxes.map((box) => box.right))),
    bottom: Math.ceil(Math.max(0, ...boxes.map((box) => box.bottom))),
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

/** At most this many zones share the visible height; more zones scroll. */
export const ZONE_SPLIT_MAX = 3;

/** What one zone's height is made from, in table units. */
export interface ZoneSizing {
  /** What its cards need: see zoneMinHeight. */
  min: number;
  /** The tallest its cards made it since it was last resized by hand. */
  grown?: number;
  /** The height chosen with the separator under it. */
  chosen?: number;
}

/**
 * The height each of `count` zones gets by default out of `available`, in
 * whole table units: ZONE_SPLIT_MAX zones share it at most. 0 when nothing is
 * available.
 */
export function zoneShare(count: number, available: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(available / Math.min(count, ZONE_SPLIT_MAX)));
}

/**
 * Heights of the zones from top to bottom, in table units, sharing the
 * `available` height. Each zone takes its chosen height, or else an equal
 * share (ZONE_SPLIT_MAX zones share at most), and the last one takes what the
 * others leave: up to ZONE_SPLIT_MAX zones always fill the available height.
 * Past that, the last one gets at least a share too. No zone is ever shorter
 * than its minimum or than what it grew to. With nothing available (not
 * measured yet), a zone without a chosen height fits its cards.
 */
export function zoneHeights(zones: ZoneSizing[], available: number): number[] {
  const last = zones.at(-1);
  if (!last) {
    return [];
  }
  const share = zoneShare(zones.length, available);
  const heights = zones
    .slice(0, -1)
    .map((zone) => Math.max(zone.min, zone.grown ?? 0, zone.chosen ?? share));
  const taken = heights.reduce((sum, height) => sum + height, 0);
  // Rounded up: a fraction of a unit short would leave a strip under the last zone.
  const rest = Math.ceil(available - taken);
  // No separator lies under the last zone: it has no chosen height.
  const atLeast = zones.length > ZONE_SPLIT_MAX ? share : 0;
  heights.push(Math.max(last.min, last.grown ?? 0, rest, atLeast));
  return heights;
}

/**
 * Width of a zone, as the prototype has it: at least the visible width (in
 * table units), and always room for 140 more past its rightmost item.
 */
export function zoneWidth(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
  visibleWidth: number = 0,
): number {
  const { right } = extentOf(cards, piles, area, sizeOf);
  return Math.max(visibleWidth, right + ZONE_FREE_ROOM);
}

export interface FanSlot {
  x: number;
  y: number;
  angle: number;
}

/** The first player token, in table units. */
export const FIRST_PLAYER_BOX = { w: 84, h: 70 } as const;

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
