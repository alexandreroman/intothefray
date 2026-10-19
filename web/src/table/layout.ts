import type { CardView, PileKind, PileView, Size } from '../lib/types';

export type { Size };

/** Table units are multiples of this. */
export const GRID = 10;

/** The farthest a card can lie on the table, both ways, in table units: the server's bound. */
export const TABLE_LIMIT = 20000;

export interface Box {
  w: number;
  h: number;
  /** The image is turned a quarter to fit a portrait slot. */
  rotated: boolean;
}

// Table cards are 40 % larger than the 100 × 140 they used to be on the table; the hand and the
// preview keep their own sizes.
const SIZES: Record<Size, { w: number; h: number }> = {
  std: { w: 140, h: 196 },
  land: { w: 196, h: 140 },
  dstd: { w: 196, h: 280 },
  dland: { w: 280, h: 196 },
};

const PORTRAIT_CARD = SIZES.std;
const PILE_BOX = PORTRAIT_CARD;

// Free room past the rightmost and the lowest item of the table, so that a card can always be
// dropped beyond them. The bottom room also keeps the last row clear of the floating hand.
const FREE_ROOM_RIGHT = 200;
const FREE_ROOM_BOTTOM = 300;

// The surface never grows past where a card can lie plus the largest card, 280 units long.
const SURFACE_LIMIT = TABLE_LIMIT + 280;

const OUT_OF_PLAY_KINDS: readonly PileKind[] = ['victory', 'aside'];

// The prototype's fan (ruling P5a-R5), its lengths 40 % larger with the hand cards.
const FAN_RADIUS = 1260;
const FAN_MAX_STEP_DEG = 5;
const FAN_MAX_TOTAL_DEG = 44;
const FAN_OVERLAP = 40;
// Kept free beside the row, and the share of a card the tilted outer cards take beyond it. The
// cards turn around a point below their bottom edge (Hand.svelte's transform-origin 50% 110%),
// so at the full 22° the top corners of 185 × 259 outer cards reach about 12 px past this room
// on each side, into the hand's padding. Reserving that overhang instead would pack a 10-card
// hand tighter than the prototype does.
const FAN_SIDE_ROOM = 112;
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

/**
 * A victory display or set-aside pile. They are not drawn on the table: the
 * action bar of their owner's deck and discard pile opens them.
 */
export function isOutOfPlay(pile: PileView): boolean {
  return OUT_OF_PLAY_KINDS.includes(pile.kind);
}

/** Where a card or a pile lies on the table, in table units. */
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

/** The cards lying on the table, then the piles drawn there, with the room each takes. */
export function footprints(
  cards: CardView[],
  piles: PileView[],
  sizeOf: (c: CardView) => Size,
): Footprint[] {
  const onTable = cards
    .filter((c) => c.zone === 'table')
    .map((c) => {
      const { w, h } = cardBox(sizeOf(c), { faceDown: c.faceDown, onPile: !!c.onPile });
      return { id: c.id, x: c.x, y: c.y, w, h, exhausted: c.exhausted };
    });
  const stacked = piles
    .filter((p) => !isOutOfPlay(p))
    .map((p) => ({ id: p.id, x: p.x, y: p.y, ...PILE_BOX }));
  return [...onTable, ...stacked];
}

/**
 * The size of the table's surface, in table units: at least what shows of it
 * (`visible`), and free room past its rightmost and its lowest item, up to
 * where a card lying at the server's bound ends.
 */
export function surfaceSize(
  cards: CardView[],
  piles: PileView[],
  sizeOf: (c: CardView) => Size,
  visible: { w: number; h: number },
): { w: number; h: number } {
  const boxes = footprints(cards, piles, sizeOf).map(visualBox);
  // Rounded up: a turned card's box ends between two units.
  const right = Math.ceil(Math.max(0, ...boxes.map((box) => box.right)));
  const bottom = Math.ceil(Math.max(0, ...boxes.map((box) => box.bottom)));
  return {
    w: Math.max(visible.w, Math.min(SURFACE_LIMIT, right + FREE_ROOM_RIGHT)),
    h: Math.max(visible.h, Math.min(SURFACE_LIMIT, bottom + FREE_ROOM_BOTTOM)),
  };
}

/** The frame drawn around an owner's deck and discard pile, in table units. */
export interface OwnerFrame {
  /** The seat of the player, or -1 for the villain (the encounter deck and its discard pile). */
  owner: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Room between the piles and their frame: the count pill under a pile stays inside. The
// owner's name lies above the frame, in the 30 units the server leaves above the piles (setup.go).
const FRAME_PADDING = 10;

const HOME_KINDS: readonly PileKind[] = ['deck', 'discard', 'encounter', 'encounterDiscard'];

/**
 * A frame around each owner's deck and discard pile (the encounter deck and
 * its discard pile for the villain), from where the piles lie, in the order
 * the owners first appear.
 */
export function ownerFrames(piles: PileView[]): OwnerFrame[] {
  const byOwner = new Map<number, PileView[]>();
  for (const pile of piles) {
    if (HOME_KINDS.includes(pile.kind)) {
      byOwner.set(pile.owner, [...(byOwner.get(pile.owner) ?? []), pile]);
    }
  }
  return [...byOwner].map(([owner, own]) => {
    const left = Math.min(...own.map((p) => p.x)) - FRAME_PADDING;
    const top = Math.min(...own.map((p) => p.y)) - FRAME_PADDING;
    const right = Math.max(...own.map((p) => p.x + PILE_BOX.w)) + FRAME_PADDING;
    const bottom = Math.max(...own.map((p) => p.y + PILE_BOX.h)) + FRAME_PADDING;
    return { owner, x: left, y: top, w: right - left, h: bottom - top };
  });
}

export interface FanSlot {
  x: number;
  y: number;
  angle: number;
}

/** The first player token, in table units. */
export const FIRST_PLAYER_BOX = { w: 84, h: 70 } as const;

/** A card in the hand, as large as a card on the table at 100 %. */
export const HAND_CARD = { w: 185, h: 259 } as const;

/** A card in the hand on a narrow screen (900 px wide or less). */
export const HAND_CARD_NARROW = { w: 140, h: 196 } as const;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Lays out `n` cards of a hand, as the prototype does: the cards overlap by
 * 40, more when the row does not fit `width` (keeping 112 plus a third of a
 * card for the tilted outer cards), and turn 5 degrees apart, 44 at most in
 * total. Each card sags by how far a circle of radius 1260 falls away from
 * its top at that angle.
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
