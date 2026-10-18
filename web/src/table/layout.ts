import type { Area, CardView, PileView, Size, View } from '../lib/types';

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
const ZONE_RIGHT_MARGIN = 40;
const ZONE_MIN_HEIGHT = PORTRAIT_CARD.h + 60;

const FAN_RADIUS = 900;
const FAN_MAX_STEP_DEG = 5;
const FAN_MAX_TOTAL_DEG = 44;
const FAN_SIDE_MARGIN = 36;

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

interface Extent {
  right: number;
  bottom: number;
}

/** The right and bottom edges of everything lying on the table of one area. */
function extentOf(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): Extent {
  const extent: Extent = { right: 0, bottom: 0 };
  const grow = (x: number, y: number, box: { w: number; h: number }) => {
    extent.right = Math.max(extent.right, x + box.w);
    extent.bottom = Math.max(extent.bottom, y + box.h);
  };
  for (const c of cards) {
    if (c.zone === 'table' && c.area === area) {
      grow(c.x, c.y, cardBox(sizeOf(c), { faceDown: c.faceDown, onPile: !!c.onPile }));
    }
  }
  for (const p of piles) {
    if (p.area === area) {
      grow(p.x, p.y, PILE_BOX);
    }
  }
  return extent;
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

/** Width a zone needs: its rightmost edge plus a margin. */
export function zoneWidth(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (c: CardView) => Size,
): number {
  return extentOf(cards, piles, area, sizeOf).right + ZONE_RIGHT_MARGIN;
}

export interface FanSlot {
  x: number;
  y: number;
  angle: number;
}

/**
 * Places `n` cards of a hand on an arc of radius 900, spread 5 degrees apart
 * (less when 44 degrees would be exceeded).
 *
 * Coordinates are relative to the fan centre, the middle of the centre card:
 * `x` grows to the right, `y` grows downward from the top of the arc (outer
 * cards sit lower), `angle` is in degrees, clockwise. The horizontal offsets
 * are squeezed so that the fan, card width included, fits `width - 36`.
 */
export function fanPositions(n: number, width: number): FanSlot[] {
  if (n <= 0) {
    return [];
  }
  const step = n === 1 ? 0 : Math.min(FAN_MAX_STEP_DEG, FAN_MAX_TOTAL_DEG / (n - 1));
  const slots = Array.from({ length: n }, (_, i) => {
    const angle = (i - (n - 1) / 2) * step;
    const radians = (angle * Math.PI) / 180;
    return {
      x: FAN_RADIUS * Math.sin(radians),
      y: FAN_RADIUS * (1 - Math.cos(radians)),
      angle,
    };
  });

  const centresSpan = slots[n - 1]!.x - slots[0]!.x;
  const available = width - FAN_SIDE_MARGIN - PORTRAIT_CARD.w;
  if (centresSpan <= available) {
    return slots;
  }
  const squeeze = Math.max(available, 0) / centresSpan;
  return slots.map((s) => ({ ...s, x: s.x * squeeze }));
}
