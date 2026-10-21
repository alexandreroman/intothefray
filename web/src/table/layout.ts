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

/** A portrait card on the table, in table units. */
export const PORTRAIT_CARD = SIZES.std;
const PILE_BOX = PORTRAIT_CARD;

// Free room past the rightmost and the lowest item of the table, once they reach the edge of what
// shows, so that a card can always be dropped beyond them. The bottom room also keeps the last
// row clear of the floating hand.
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
// Kept free beside the row for 185 px cards, and the share of a card the tilted outer cards take
// beyond it. The cards turn around a point below their bottom edge (Hand.svelte's
// transform-origin 50% 110%), so at the full 22° the top corners of 185 × 259 outer cards reach
// about 12 px past the width on each side. Reserving that overhang instead would pack a 10-card
// hand tighter than the prototype does. The overhang grows with the card: a larger card keeps a
// room as much larger (fanPositions), and its corners as little past the width, in proportion.
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
 * chips on their owner's frame open them (outOfPlayChips).
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
 * The size of the table's surface, in table units, along each axis: what
 * shows of it (`visible`) while its items fit there, so that it does not
 * scroll; once they reach past it, free room beyond the rightmost or the
 * lowest item, up to where a card lying at the server's bound ends.
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
    w: axisSize(right, visible.w, FREE_ROOM_RIGHT),
    h: axisSize(bottom, visible.h, FREE_ROOM_BOTTOM),
  };
}

/**
 * How far right the table's content reaches, in table units: its cards and
 * piles, and the frames around the owners' piles. The surface starts at 0,
 * so this is the width the fit zoom brings into view.
 */
export function contentWidth(
  cards: CardView[],
  piles: PileView[],
  sizeOf: (c: CardView) => Size,
): number {
  const items = footprints(cards, piles, sizeOf).map((item) => visualBox(item).right);
  const frames = ownerFrames(piles).map((frame) => frame.x + frame.w);
  // Rounded up: a turned card's box ends between two units.
  return Math.ceil(Math.max(0, ...items, ...frames));
}

/** One axis of the surface: the items' end, the length that shows, and the free room past them. */
function axisSize(end: number, visible: number, freeRoom: number): number {
  if (end <= visible) {
    return visible;
  }
  return Math.max(visible, Math.min(SURFACE_LIMIT, end + freeRoom));
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

// Room between the piles and their frame: the count pill under a pile stays inside. The owner's
// name line lies from 30 to 8 units above the frame (Surface.svelte): 10 units past the 30 the
// server leaves above the piles (setup.go), into the empty bottom of the row above, or into the
// scroller's padding for the villain's frame.
const FRAME_PADDING = 10;

const HOME_KINDS: readonly PileKind[] = [
  'deck',
  'discard',
  'sideDeck',
  'sideDiscard',
  'encounter',
  'encounterDiscard',
];

/**
 * A frame around each owner's deck and discard pile, with their side decks
 * and side discard piles (the encounter deck and its discard pile for the
 * villain), from where the piles lie, in the order the owners first appear.
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

/** An out-of-play pile, as the chip on its owner's frame shows it. */
export interface OutOfPlayChip {
  /** The pile the chip opens. */
  pile: string;
  kind: 'victory' | 'aside';
  /** What the pile is: "Victory display", "Set-aside cards". */
  label: string;
  count: number;
}

/**
 * The chips of an owner's frame, for the out-of-play piles the table has:
 * the victory display then the scenario's set-aside cards on the villain's
 * frame (owner -1), a player's own set-aside cards on theirs. The pile ids are
 * the server's (internal/game/state.go).
 */
export function outOfPlayChips(owner: number, piles: readonly PileView[]): OutOfPlayChip[] {
  const victory = { pile: 'vic', kind: 'victory', label: 'Victory display' } as const;
  const setAside = { kind: 'aside', label: 'Set-aside cards' } as const;
  const wanted =
    owner === -1
      ? [victory, { ...setAside, pile: 'saside' }]
      : [{ ...setAside, pile: `aside:p${owner}` }];
  return wanted.flatMap((chip) => {
    const pile = piles.find((p) => p.id === chip.pile);
    return pile ? [{ ...chip, count: pile.count }] : [];
  });
}

export interface FanSlot {
  x: number;
  y: number;
  angle: number;
}

/** The first player token, in table units. */
export const FIRST_PLAYER_BOX = { w: 84, h: 70 } as const;

/** A card in the hand: about a third larger than a card on the table at 100 % (140 × 196). */
export const HAND_CARD = { w: 185, h: 259 } as const;

/** A card in the hand on a narrow screen (900 px wide or less). */
export const HAND_CARD_NARROW = { w: 140, h: 196 } as const;

// A small screen's hand card (a phone, either way up): a quarter of the window's width, within
// these bounds. 151 px is the desktop card as the resting hand shows it (185 px at 82 %).
const SMALL_HAND_CARD_MIN_W = 64;
const SMALL_HAND_CARD_MAX_W = 151;
const SMALL_HAND_CARD_SHARE = 0.25;
const HAND_CARD_RATIO = HAND_CARD.h / HAND_CARD.w;

/** The hand's padding above and below its cards, in px: Hand.svelte draws it. */
export const HAND_PADDING = { top: 26, bottom: 18 } as const;
const HAND_PADDING_Y = HAND_PADDING.top + HAND_PADDING.bottom;

/**
 * The resting hand shows its base card (HAND_CARD, HAND_CARD_NARROW or
 * smallHandCard) at this scale, from its bottom edge: Hand.svelte draws the
 * raised card at handRestScale to match.
 */
export const HAND_REST_SCALE = 0.82;

/** How far the resting hand drops below its raised place, in px, but on a small screen. */
export const HAND_REST_DROP = 140;

/**
 * A hand card on a small screen (600 px wide or less, or 500 px tall or
 * less), in px: a quarter of the window's width, between 64 and 151 px wide,
 * and never so tall that the raised hand takes more than half the window's
 * height (a phone held sideways).
 */
export function smallHandCard(window: { w: number; h: number }): { w: number; h: number } {
  const fromWidth = window.w * SMALL_HAND_CARD_SHARE;
  const fromHeight = halfHeightCardWidth(window.h);
  const w = Math.floor(
    Math.max(SMALL_HAND_CARD_MIN_W, Math.min(SMALL_HAND_CARD_MAX_W, fromWidth, fromHeight)),
  );
  return { w, h: Math.round(w * HAND_CARD_RATIO) };
}

/**
 * How far a small screen's resting hand drops, in px: the share of its card
 * height that HAND_REST_DROP is of the desktop card's, so that as much of
 * each card shows.
 */
export function smallHandDrop(cardHeight: number): number {
  return Math.round((cardHeight * HAND_REST_DROP) / HAND_CARD.h);
}

/**
 * The widest hand card that keeps the raised hand, its padding included, to
 * half the window's height, in px: a phone held sideways.
 */
function halfHeightCardWidth(windowHeight: number): number {
  return (windowHeight / 2 - HAND_PADDING_Y) / HAND_CARD_RATIO;
}

/**
 * The height of the resting hand that shows above the window's bottom edge, in
 * px, for its base card and the drop that goes with it.
 */
export function restingStrip(cardHeight: number, drop: number): number {
  return Math.max(0, Math.round(HAND_REST_SCALE * (HAND_PADDING_Y + cardHeight) - drop));
}

// The preview's frame (.peek, Table.svelte): at most 320 px wide, its 10 px padding and 1 px border
// included, never wider than 45 % of the table area, nor taller than the window less 200 px. Keep
// in step with .peek (Table.svelte).
const PREVIEW_MAX_W = 320;
const PREVIEW_AREA_SHARE = 0.45;
const PREVIEW_ROOM_Y = 200;
const PREVIEW_PADDING = 10;
const PREVIEW_BORDER = 1;
const PORTRAIT_RATIO = 5 / 7;

/** The raised hand's cards are this share of the preview's card. */
const RAISED_HAND_SHARE = 0.8;

/**
 * The width of the portrait card the preview shows, in px, from the table
 * area's width (`area.w`) and the window's height (`area.h`), as .peek's CSS
 * sizes it: its frame, less the padding and the border inside it.
 */
export function previewCardWidth(area: { w: number; h: number }): number {
  // The CSS adds the padding only to the width the height allows, not the border.
  const fromHeight = (area.h - PREVIEW_ROOM_Y) * PORTRAIT_RATIO + 2 * PREVIEW_PADDING;
  const frame = Math.min(PREVIEW_MAX_W, area.w * PREVIEW_AREA_SHARE, fromHeight);
  return Math.max(0, frame - 2 * (PREVIEW_PADDING + PREVIEW_BORDER));
}

/**
 * A card of the raised hand, in px: 80 % of the preview's card (see
 * previewCardWidth for `area`), never smaller than the base card the resting
 * hand shows, and on a small screen never so tall that the raised hand takes
 * more than half the window's height.
 */
export function raisedHandCard(
  base: { w: number; h: number },
  area: { w: number; h: number },
  opts: { small: boolean },
): { w: number; h: number } {
  let w = Math.round(RAISED_HAND_SHARE * previewCardWidth(area));
  if (opts.small) {
    w = Math.min(w, Math.floor(halfHeightCardWidth(area.h)));
  }
  if (w <= base.w) {
    return base;
  }
  return { w, h: Math.round(w * HAND_CARD_RATIO) };
}

/**
 * The scale the resting hand is drawn at, from its bottom edge: its raised
 * cards then show as large as its base cards at HAND_REST_SCALE.
 */
export function handRestScale(base: { w: number }, raised: { w: number }): number {
  // The ratio first: an unchanged card keeps HAND_REST_SCALE exactly.
  return HAND_REST_SCALE * (base.w / raised.w);
}

/**
 * How far the resting hand drops below its raised place, in px, so that its
 * raised cards, drawn at handRestScale, show as tall a part above the window's
 * bottom edge as the base card at HAND_REST_SCALE dropped by `baseDrop`. The
 * cards are measured, not the hand's box: its top padding lies above them.
 */
export function handRestDrop(
  base: { w: number; h: number },
  baseDrop: number,
  raised: { w: number; h: number },
): number {
  const baseShown = HAND_REST_SCALE * (base.h + HAND_PADDING.bottom) - baseDrop;
  const scale = handRestScale(base, raised);
  return Math.max(0, Math.round(scale * (raised.h + HAND_PADDING.bottom) - baseShown));
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Lays out `n` cards of a hand, as the prototype does: the cards overlap by
 * 40, more when the row does not fit `width` (keeping 112 plus a third of a
 * card for the tilted outer cards, the 112 growing with a card wider than
 * 185), and turn 5 degrees apart, 44 at most in total. Each card sags by how
 * far a circle of radius 1260 falls away from its top at that angle.
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
  // A card up to the desktop's keeps the prototype's room; a larger one keeps a room in proportion
  // to its width, as its corners swing out in proportion.
  const sideRoom = FAN_SIDE_ROOM * Math.max(1, cardWidth / HAND_CARD.w);
  const fitted = (width - sideRoom - (1 + FAN_TILT_ROOM) * cardWidth) / gaps;
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

/**
 * The fan of the resting hand, in the raised hand's px: laid out for the base
 * card the resting hand shows (`restCardWidth`), then spread by as much as the
 * rest scale (handRestScale) draws the raised card (`cardWidth`) smaller. On
 * screen, the resting fan is then the base card's at HAND_REST_SCALE.
 */
export function restingFanPositions(
  n: number,
  width: number,
  restCardWidth: number,
  cardWidth: number,
): FanSlot[] {
  const spread = cardWidth / restCardWidth;
  return fanPositions(n, width, restCardWidth).map((slot) => ({
    x: slot.x * spread,
    y: slot.y * spread,
    angle: slot.angle,
  }));
}
