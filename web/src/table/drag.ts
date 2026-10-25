// Drag and drop on the table (spec 5.4): what can be dragged, where it can be
// dropped, and the action a drop sends. Pure helpers; DragLayer.svelte follows
// the pointer, measures the screen and calls them.

import {
  markerPoint,
  type Action,
  type Area,
  type CardView,
  type MarkerName,
  type PileView,
  type Point,
  type View,
} from '../lib/types';
import {
  deckDiscardOf,
  deckName,
  discardPileOf,
  homeDeckOf,
  isSideDeckId,
  staysOnTable,
} from './actions';
import type { Pressable } from './interaction.svelte';
import { GRID, TABLE_LIMIT } from './layout';
import { ALL_ROWS, type RowMap } from './rows';
import { areaOf, ownSeats } from './seats';

/** A press turns into a drag once the pointer has moved this far, in screen pixels. */
export const DRAG_THRESHOLD = 4;

/**
 * The ids the ghost of a deck's unknown top card goes by, until the server
 * names the card (DragLayer.svelte): the encounter deck's, and any other's.
 */
export const ENCOUNTER_TOP_ID = 'encounter-top';
export const DECK_TOP_ID = 'deck-top';

/** The id the ghost of a pile's unknown top card goes by, when that card is dragged. */
export function unknownTopId(pile: Pick<PileView, 'kind'>): string {
  return pile.kind === 'encounter' ? ENCOUNTER_TOP_ID : DECK_TOP_ID;
}

/** A drop this close to a pile, in screen pixels, goes onto it. */
const PILE_MARGIN = 20;

/** The prototype's room around the hand cards where a hand card dropped slots back in. */
const HAND_SIDE_ROOM = 140;
const HAND_TOP_ROOM = 20;
const EMPTY_HAND_ROOM = 140;

/** A box on the screen. A DOMRect is one. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What a drop onto a pile does: back on top of the deck, discarded, or put in
 * that pile.
 */
export type PileDrop = 'top' | 'discard' | 'pile';

/** Where a drop can land, with its box on the screen. */
export type DropRect =
  /** A slot among the hand cards, for a hand card. */
  | { kind: 'hand'; index: number; rect: Rect }
  /** The hand as a whole, for a table card going back to it. */
  | { kind: 'toHand'; rect: Rect }
  /** The table itself, where it shows. */
  | { kind: 'table'; rect: Rect }
  | { kind: 'pile'; pile: string; drop: PileDrop; label: string; rect: Rect }
  | { kind: 'card'; card: string; z: number; rect: Rect };

export type TableRect = Extract<DropRect, { kind: 'table' }>;
type PileRect = Extract<DropRect, { kind: 'pile' }>;
type CardRect = Extract<DropRect, { kind: 'card' }>;

/** What is dragged, read from the current view. */
export type DragSource =
  /** A table card, with the cards tucked under it. */
  | { kind: 'card'; card: string; x: number; y: number }
  /** A card of the hand of the player seated in `area`. */
  | { kind: 'hand'; card: string; hand: readonly string[]; area: Area }
  /** The top card of a pile that shows its cards. */
  | { kind: 'pile'; pile: string; card: string }
  /** The unknown top card of the encounter deck, dealt face down. */
  | { kind: 'encounter'; pile: string }
  /**
   * The unknown top card of one of the viewer's own decks: drawn, discarded, or played face down,
   * or face up from a side deck that shows its top card (the server's landsFaceDown).
   */
  | { kind: 'deck'; pile: string }
  /** A marker (the first player token, the active counter), from where it lies. */
  | { kind: 'marker'; name: MarkerName; x: number; y: number };

// A row of the table starts this far above its owner's deck: the owner's name lies there.
// It mirrors rowContentY in internal/game/setup.go.
const ROW_LABEL_ROOM = 30;

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

export function intersect(a: Rect, b: Rect): Rect {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

/** How far the point is from the box: 0 inside it. */
function distance(rect: Rect, point: Point): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * What a drop at the point lands on: the hand, if it is a target, then the
 * nearest pile up to 20 px away, the topmost card under the point, or else
 * the table itself. Null outside the table.
 */
export function dropTarget(point: Point, targets: DropRect[]): DropRect | null {
  const hand = targets.find(
    (t) => (t.kind === 'hand' || t.kind === 'toHand') && contains(t.rect, point),
  );
  if (hand) {
    return hand;
  }
  const table = targets.find((t): t is TableRect => t.kind === 'table' && contains(t.rect, point));
  if (!table) {
    return null;
  }

  let nearestPile: PileRect | null = null;
  let nearestDistance = PILE_MARGIN;
  let topCard: CardRect | null = null;
  for (const target of targets) {
    if (target.kind === 'pile') {
      const d = distance(target.rect, point);
      if (d <= nearestDistance) {
        nearestPile = target;
        nearestDistance = d;
      }
    } else if (target.kind === 'card' && contains(target.rect, point)) {
      if (topCard === null || target.z > topCard.z) {
        topCard = target;
      }
    }
  }
  return nearestPile ?? topCard ?? table;
}

/**
 * The action a drop sends: `at` is where the dragged card's top-left corner
 * is drawn, in table units, `dealTo` the player an encounter card dealt there
 * goes to (see dealRecipient), and `rows` where the view mode draws the rows.
 * Null when nothing would change: no target, the spot it was taken from, or
 * its own place in the hand. A card revealed on its deck lies on that deck, so
 * dropped where it lies it goes back on top, as Move to's Top of deck does.
 */
export function dropAction(
  drag: DragSource,
  target: DropRect | null,
  at: Point,
  dealTo: Area,
  rows: RowMap = ALL_ROWS,
): Action | null {
  if (target === null) {
    return null;
  }
  // A marker lies anywhere on the table, over cards and piles alike.
  if (drag.kind === 'marker') {
    return target.kind === 'hand' || target.kind === 'toHand'
      ? null
      : place(drag, at, dealTo, rows);
  }
  switch (target.kind) {
    case 'hand':
      return drag.kind === 'hand' ? reorder(drag, target.index) : null;
    case 'toHand':
      return toHand(drag);
    case 'pile':
      return onPile(drag, target.pile, target.drop);
    case 'card':
      return onCard(drag, target.card, at, dealTo, rows);
    case 'table':
      return place(drag, at, dealTo, rows);
  }
}

/**
 * A table card goes back to its owner's hand; the top card of the viewer's
 * deck is drawn, from the side deck it was dragged from (a deck's draw names
 * no pile: the server draws from the credited seat's deck).
 */
function toHand(drag: DragSource): Action | null {
  switch (drag.kind) {
    case 'card':
      return { kind: 'toHand', card: drag.card };
    case 'deck':
      return isSideDeckId(drag.pile)
        ? { kind: 'draw', n: 1, pile: drag.pile }
        : { kind: 'draw', n: 1 };
    default:
      return null;
  }
}

/** What can be dropped onto a card or a pile: everything but a marker. */
type CardSource = Exclude<DragSource, { kind: 'marker' }>;

function onCard(
  drag: CardSource,
  card: string,
  at: Point,
  dealTo: Area,
  rows: RowMap,
): Action | null {
  // Tucked where it is dropped, behind the card: the server keeps the spot (placed).
  const { x, y } = spotOf(at, rows);
  switch (drag.kind) {
    case 'card':
      return { kind: 'attach', card: drag.card, target: card, x, y, placed: true };
    case 'hand':
    case 'pile':
      // Played and tucked in one action: one undo step.
      return { kind: 'play', card: drag.card, target: card, x, y, placed: true };
    case 'deck':
      // A side deck's top card is played and tucked as a hand card is: the server plays the
      // deck's top card, which the client may not know.
      if (isSideDeckId(drag.pile)) {
        return { kind: 'play', pile: drag.pile, target: card, x, y, placed: true };
      }
      // A deck's top card is played face down where it lands, over that card.
      return place(drag, at, dealTo, rows);
    case 'encounter':
      // Dealt face down where it lands, over that card (spec 5.5).
      return place(drag, at, dealTo, rows);
  }
}

/** Whether the action tucks a card under another: attach, or a play with a target. */
export function tucks(action: Action): boolean {
  return action.kind === 'attach' || (action.kind === 'play' && action.target !== undefined);
}

function reorder(drag: Extract<DragSource, { kind: 'hand' }>, index: number): Action | null {
  const others = drag.hand.filter((id) => id !== drag.card);
  const cards = [...others.slice(0, index), drag.card, ...others.slice(index)];
  if (cards.every((id, i) => id === drag.hand[i])) {
    return null;
  }
  return { kind: 'handOrder', area: drag.area, cards };
}

function onPile(drag: CardSource, pile: string, drop: PileDrop): Action | null {
  // A pile's top card dropped back onto its pile stays where it is. A card revealed on its deck
  // goes back on top of it, as its Move to ▾ "Top of deck" does.
  if (drag.kind === 'pile' && drag.pile === pile) {
    return null;
  }
  if (drag.kind === 'encounter' || drag.kind === 'deck') {
    return drop === 'discard' ? { kind: 'discardTop', pile: drag.pile, n: 1 } : null;
  }
  switch (drop) {
    case 'top':
      return { kind: 'toDeck', card: drag.card, where: 'top' };
    case 'discard':
      return { kind: 'discard', card: drag.card };
    case 'pile':
      return { kind: 'toPile', card: drag.card, target: pile };
  }
}

/** Where a card whose corner is drawn at `at` lies on the table, on the grid. */
function spotOf(at: Point, rows: RowMap): Point {
  // Snapped where it is drawn, then mapped to the table: snapping after would
  // push a card drawn at the bottom of a row into the next, hidden, one. A row
  // that ends there keeps the card on its last height, taken down to the grid.
  const onGrid = Math.floor(rows.toTable(snap(at.y)) / GRID) * GRID;
  // Within the server's bounds: never off the top or left edge, nor past TABLE_LIMIT.
  return {
    x: Math.min(TABLE_LIMIT, Math.max(0, snap(at.x))),
    y: Math.min(TABLE_LIMIT, Math.max(0, onGrid)),
  };
}

function place(drag: DragSource, at: Point, dealTo: Area, rows: RowMap): Action | null {
  const { x, y } = spotOf(at, rows);
  switch (drag.kind) {
    case 'card':
      // A card dropped where it lies does not move.
      if (x === drag.x && y === drag.y) {
        return null;
      }
      return { kind: 'move', card: drag.card, x, y };
    case 'hand':
    case 'pile':
      return { kind: 'play', card: drag.card, x, y };
    case 'encounter':
      // The classic encounter deck is the default: only a scenario deck names itself.
      return drag.pile === 'enc'
        ? { kind: 'deal', area: dealTo, x, y }
        : { kind: 'deal', pile: drag.pile, area: dealTo, x, y };
    case 'deck':
      // The server plays the deck's top card, which the client does not know.
      return { kind: 'play', pile: drag.pile, x, y };
    case 'marker':
      if (x === drag.x && y === drag.y) {
        return null;
      }
      return { kind: 'marker', name: drag.name, x, y };
  }
}

/**
 * Who an encounter card dealt at height `y` of the table (in table units)
 * goes to: the player whose row holds that spot. Each player's row starts
 * just above their deck, where their name lies, and runs down to the next
 * row. Above every player's row (the villain's), it goes to the viewer.
 */
export function dealRecipient(piles: readonly PileView[], y: number, viewer: Area): Area {
  let recipient = viewer;
  let rowTop = -Infinity;
  for (const pile of piles) {
    const top = pile.y - ROW_LABEL_ROOM;
    if (pile.kind === 'deck' && top <= y && top > rowTop) {
      rowTop = top;
      recipient = areaOf(pile.owner);
    }
  }
  return recipient;
}

/**
 * What pressing the element drags, in the current view, or null when it
 * cannot be dragged: a spectator, another player's deck, an empty pile, an
 * out-of-play pile, or a card that is no longer there. During a drag from a
 * pile, `taken` is the card taken from it: the drag follows that card while
 * it is still in the pile, whatever lands on top of it. Any player can move
 * a marker.
 */
export function sourceOf(element: Pressable, view: View, taken?: string): DragSource | null {
  const table = view.table;
  const seats = ownSeats(view);
  if (seats.length === 0 || !table) {
    return null;
  }
  switch (element.kind) {
    case 'marker': {
      const at = markerPoint(table, element.name);
      return at ? { kind: 'marker', name: element.name, ...at } : null;
    }
    case 'card': {
      const card = table.cards.find((c) => c.id === element.id);
      if (card?.zone !== 'table') {
        return null;
      }
      return { kind: 'card', card: card.id, x: card.x, y: card.y };
    }
    case 'hand': {
      for (const seat of seats) {
        const area = areaOf(seat);
        const hand = table.hands?.[area] ?? [];
        if (hand.includes(element.id)) {
          return { kind: 'hand', card: element.id, hand, area };
        }
      }
      return null;
    }
    case 'pile': {
      const pile = table.piles.find((p) => p.id === element.id);
      if (!pile || pile.count === 0) {
        return null;
      }
      if (pile.kind === 'encounter') {
        return { kind: 'encounter', pile: pile.id };
      }
      // A deck is private to its owner, as checkPile has it; so is a side deck.
      if (pile.kind === 'deck' || pile.kind === 'sideDeck') {
        return seats.includes(pile.owner) ? { kind: 'deck', pile: pile.id } : null;
      }
      // Out-of-play piles are not drawn on the table: only a discard pile is dragged from.
      const open =
        pile.kind === 'discard' ||
        pile.kind === 'encounterDiscard' ||
        pile.kind === 'sideDiscard' ||
        pile.kind === 'scenarioDiscard';
      const card = taken ?? pile.cards?.at(-1);
      const inPile = card !== undefined && (pile.cards ?? []).includes(card);
      return open && inPile ? { kind: 'pile', pile: pile.id, card } : null;
    }
  }
}

/**
 * The hand that takes the dragged card, or null when no hand does: a table
 * card of one of the viewer's own decks goes to that deck's hand, as Move to
 * ▾ Hand has it (ruling P5b-R10), unless it stays on the table, and the top
 * card of one of their decks is drawn into that deck's hand. The prototype
 * takes it from anywhere over the fan.
 */
export function handAreaOf(drag: DragSource, view: View): Area | null {
  const table = view.table;
  let owner: number | undefined;
  if (drag.kind === 'deck') {
    owner = table?.piles.find((p) => p.id === drag.pile)?.owner;
  } else if (drag.kind === 'card' && table) {
    const card = table.cards.find((c) => c.id === drag.card);
    if (!card || staysOnTable(card, table)) {
      return null;
    }
    owner = card.owner;
  }
  if (owner === undefined || !ownSeats(view).includes(owner)) {
    return null;
  }
  return areaOf(owner);
}

/** A pile a drag can go onto, and what the drop does there. */
export interface PileTarget {
  pile: string;
  drop: PileDrop;
  label: string;
}

/**
 * The piles a dragged card can go to, as its Move to ▾ menu has them: its
 * home deck, on top (the viewer's own cards and encounter cards only), and
 * its discard pile, when it has one; none when it stays on the table. The top
 * card of one of the viewer's decks goes to that deck's discard pile, the
 * encounter deck's to the encounter discard pile.
 */
export function pileTargets(drag: DragSource, view: View): PileTarget[] {
  const table = view.table;
  const seats = ownSeats(view);
  if (!table || seats.length === 0) {
    return [];
  }
  if (drag.kind === 'marker') {
    return [];
  }
  const exists = (target: PileTarget) => table.piles.some((p) => p.id === target.pile);
  if (drag.kind === 'encounter' || drag.kind === 'deck') {
    const discard: PileTarget = {
      pile: deckDiscardOf(drag.pile),
      drop: 'discard',
      label: 'Discard',
    };
    return [discard].filter(exists);
  }

  const card = table.cards.find((c) => c.id === drag.card);
  if (!card || staysOnTable(card, table)) {
    return [];
  }
  const targets: PileTarget[] = [];
  // A deck is private to its owner: the viewer's own cards and encounter cards only.
  const home = table.piles.find((p) => p.id === homeDeckOf(card));
  if (home && (seats.includes(card.owner) || card.owner === -1)) {
    const deck = deckName(home);
    targets.push({ pile: home.id, drop: 'top', label: `Top of ${deck}` });
  }
  // The out-of-play piles are not drawn: Move to ▾ sends a card there.
  const discard = discardPileOf(card, table.piles);
  if (discard !== null) {
    targets.push({ pile: discard, drop: 'discard', label: 'Discard' });
  }
  return targets.filter(exists);
}

/** The card and every table card tucked under it, directly or not: what moves with it. */
export function stackOf(id: string, cards: readonly CardView[]): string[] {
  const stack = [id];
  for (let i = 0; i < stack.length; i++) {
    const parent = stack[i];
    for (const card of cards) {
      if (card.parent === parent && card.zone === 'table' && !stack.includes(card.id)) {
        stack.push(card.id);
      }
    }
  }
  return stack;
}

/**
 * Where a hand card dropped slots back into the hand, as in the prototype:
 * around the hand cards with a card's width to spare on each side (the fan
 * narrows when a card leaves it), down to the bottom of the window; at the
 * middle of the table's bottom edge when the hand is empty.
 */
export function handBand(cards: Rect[], table: Rect, windowBottom: number): Rect {
  if (cards.length === 0) {
    const middle = (table.left + table.right) / 2;
    return {
      left: middle - EMPTY_HAND_ROOM,
      top: table.bottom - EMPTY_HAND_ROOM,
      right: middle + EMPTY_HAND_ROOM,
      bottom: table.bottom,
    };
  }
  return {
    left: Math.min(...cards.map((r) => r.left)) - HAND_SIDE_ROOM,
    top: Math.min(...cards.map((r) => r.top)) - HAND_TOP_ROOM,
    right: Math.max(...cards.map((r) => r.right)) + HAND_SIDE_ROOM,
    bottom: windowBottom,
  };
}

/**
 * Whether a press went down, within 45° of straight down, as it passed the
 * drag threshold. A finger pushing a hand card down swipes the hand away
 * rather than dragging the card (Hand.svelte): the table, where cards are
 * played, lies above the hand, and a reorder goes sideways.
 */
export function isDownward(from: Point, to: Point): boolean {
  return to.y - from.y > Math.abs(to.x - from.x);
}

/** Where a card dragged at x slots in among the other hand cards, given their middles. */
export function insertIndex(middles: number[], x: number): number {
  return middles.filter((middle) => middle < x).length;
}
