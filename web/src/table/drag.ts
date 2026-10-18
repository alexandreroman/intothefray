// Drag and drop on the table (spec 5.4): what can be dragged, where it can be
// dropped, and the action a drop sends. Pure helpers; DragLayer.svelte follows
// the pointer, measures the screen and calls them.

import type { Action, Area, CardView, View } from '../lib/types';
import { seatOf, stageHeldBy, type TableElement } from './actions';
import { GRID } from './layout';

/** A press turns into a drag once the pointer has moved this far, in screen pixels. */
export const DRAG_THRESHOLD = 4;

/** A drop this close to a pile, in screen pixels, goes onto it. */
const PILE_MARGIN = 20;

/** The prototype's room around the hand cards where a hand card dropped slots back in. */
const HAND_SIDE_ROOM = 140;
const HAND_TOP_ROOM = 20;
const EMPTY_HAND_ROOM = 140;

export interface Point {
  x: number;
  y: number;
}

/** A box on the screen. A DOMRect is one. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What a drop onto a pile does: back on top of the deck, discarded, or put in that pile. */
export type PileDrop = 'top' | 'discard' | 'pile';

/** Where a drop can land, with its box on the screen. */
export type DropRect =
  | { kind: 'hand'; index: number; rect: Rect }
  | { kind: 'zone'; area: Area; rect: Rect }
  | { kind: 'pile'; pile: string; area: Area; drop: PileDrop; label: string; rect: Rect }
  | { kind: 'card'; card: string; area: Area; z: number; rect: Rect };

type ZoneRect = Extract<DropRect, { kind: 'zone' }>;
type PileRect = Extract<DropRect, { kind: 'pile' }>;
type CardRect = Extract<DropRect, { kind: 'card' }>;

/** What is dragged, read from the current view. */
export type DragSource =
  /** A table card, with the cards tucked under it. */
  | { kind: 'card'; card: string; area: Area; x: number; y: number; onPile?: string }
  | { kind: 'hand'; card: string; hand: readonly string[]; area: Area }
  /** The top card of a pile that shows its cards. */
  | { kind: 'pile'; pile: string; card: string }
  /** The unknown top card of the encounter deck, dealt face down. */
  | { kind: 'encounter'; pile: string };

/** A spot of a zone, in table units. */
export interface TablePoint {
  area: Area;
  x: number;
  y: number;
}

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

function contains(rect: Rect, point: Point): boolean {
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
 * What a drop at the point lands on: the hand, if it is a target, then within
 * the zone under the point, the nearest pile up to 20 px away, the topmost
 * card under the point, or else the zone itself. Null outside every zone.
 */
export function dropTarget(point: Point, targets: DropRect[]): DropRect | null {
  const hand = targets.find((t) => t.kind === 'hand' && contains(t.rect, point));
  if (hand) {
    return hand;
  }
  const zone = targets.find((t): t is ZoneRect => t.kind === 'zone' && contains(t.rect, point));
  if (!zone) {
    return null;
  }

  let nearestPile: PileRect | null = null;
  let nearestDistance = PILE_MARGIN;
  let topCard: CardRect | null = null;
  for (const target of targets) {
    if (target.kind === 'pile' && target.area === zone.area) {
      const d = distance(target.rect, point);
      if (d <= nearestDistance) {
        nearestPile = target;
        nearestDistance = d;
      }
    } else if (
      target.kind === 'card' &&
      target.area === zone.area &&
      contains(target.rect, point)
    ) {
      if (topCard === null || target.z > topCard.z) {
        topCard = target;
      }
    }
  }
  return nearestPile ?? topCard ?? zone;
}

/**
 * The action a drop sends: `at` is where the dragged card's top-left corner
 * lands, in table units. Null when nothing would change: no target, the spot
 * it was taken from, or its own place in the hand.
 */
export function dropAction(
  drag: DragSource,
  target: DropRect | null,
  at: TablePoint,
): Action | null {
  if (target === null) {
    return null;
  }
  switch (target.kind) {
    case 'hand':
      return drag.kind === 'hand' ? reorder(drag, target.index) : null;
    case 'pile':
      return onPile(drag, target.pile, target.drop);
    case 'card':
      if (drag.kind === 'card') {
        return { kind: 'attach', card: drag.card, target: target.card };
      }
      // Anything else lands on the table where it is dropped, over that card.
      return place(drag, at);
    case 'zone':
      return place(drag, at);
  }
}

function reorder(drag: Extract<DragSource, { kind: 'hand' }>, index: number): Action | null {
  const others = drag.hand.filter((id) => id !== drag.card);
  const cards = [...others.slice(0, index), drag.card, ...others.slice(index)];
  if (cards.every((id, i) => id === drag.hand[i])) {
    return null;
  }
  return { kind: 'handOrder', area: drag.area, cards };
}

function onPile(drag: DragSource, pile: string, drop: PileDrop): Action | null {
  // Back onto the pile it came from: a pile's top card, or a card revealed on its deck.
  if (
    (drag.kind === 'pile' && drag.pile === pile) ||
    (drag.kind === 'card' && drag.onPile === pile)
  ) {
    return null;
  }
  if (drag.kind === 'encounter') {
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

function place(drag: DragSource, at: TablePoint): Action | null {
  const x = Math.max(0, snap(at.x));
  const y = Math.max(0, snap(at.y));
  switch (drag.kind) {
    case 'card':
      // A revealed card dropped where it lies is still on its deck: nothing moves.
      if (at.area === drag.area && x === drag.x && y === drag.y) {
        return null;
      }
      return { kind: 'move', card: drag.card, area: at.area, x, y };
    case 'hand':
    case 'pile':
      return { kind: 'play', card: drag.card, area: at.area, x, y };
    case 'encounter':
      return { kind: 'deal', area: at.area, x, y };
  }
}

/**
 * What pressing the element drags, in the current view, or null when it
 * cannot be dragged: a spectator, a deck, an empty pile, another player's
 * set-aside cards, or a card that is no longer there.
 */
export function sourceOf(element: TableElement, view: View): DragSource | null {
  const table = view.table;
  const area = view.you.area;
  if (view.you.role !== 'player' || !area || !table) {
    return null;
  }
  switch (element.kind) {
    case 'card': {
      const card = table.cards.find((c) => c.id === element.id);
      if (card?.zone !== 'table' || !card.area) {
        return null;
      }
      const source: DragSource = {
        kind: 'card',
        card: card.id,
        area: card.area,
        x: card.x,
        y: card.y,
      };
      return card.onPile ? { ...source, onPile: card.onPile } : source;
    }
    case 'hand': {
      const hand = table.hand ?? [];
      return hand.includes(element.id) ? { kind: 'hand', card: element.id, hand, area } : null;
    }
    case 'pile': {
      const pile = table.piles.find((p) => p.id === element.id);
      if (!pile || pile.count === 0) {
        return null;
      }
      if (pile.kind === 'encounter') {
        return { kind: 'encounter', pile: pile.id };
      }
      // Set-aside cards are private to their owner, as checkPile has it.
      const open =
        pile.kind === 'discard' ||
        pile.kind === 'encounterDiscard' ||
        pile.kind === 'victory' ||
        (pile.kind === 'aside' && (pile.owner === -1 || `p${pile.owner}` === area));
      const top = pile.cards?.at(-1);
      return open && top !== undefined ? { kind: 'pile', pile: pile.id, card: top } : null;
    }
  }
}

/** A pile a drag can go onto, and what the drop does there. */
export interface PileTarget {
  pile: string;
  drop: PileDrop;
  label: string;
}

/**
 * The piles a dragged card can go to, as its Move to ▾ menu has them: its
 * owner's deck (the viewer's own cards and encounter cards only), its discard
 * pile, the victory display, and a set-aside pile (the viewer's own for their
 * cards, the scenario's for any other). The encounter deck can only have its
 * top card discarded.
 */
export function pileTargets(drag: DragSource, view: View): PileTarget[] {
  const table = view.table;
  const seat = view.you.area ? seatOf(view.you.area) : null;
  if (!table || seat === null) {
    return [];
  }
  const exists = (target: PileTarget) => table.piles.some((p) => p.id === target.pile);
  if (drag.kind === 'encounter') {
    return [{ pile: 'encd', drop: 'discard' as const, label: 'Discard' }].filter(exists);
  }

  const card = table.cards.find((c) => c.id === drag.card);
  // Mirrors checkNotStageCurrent: the card a stage shows stays on the table.
  if (!card || stageHeldBy(card, table)) {
    return [];
  }
  const encounter = card.owner === -1;
  const own = card.owner === seat;
  const targets: PileTarget[] = [];
  if (own || encounter) {
    targets.push({
      pile: encounter ? 'enc' : `deck:p${card.owner}`,
      drop: 'top',
      label: 'Top of deck',
    });
  }
  targets.push(
    { pile: encounter ? 'encd' : `disc:p${card.owner}`, drop: 'discard', label: 'Discard' },
    { pile: 'vic', drop: 'pile', label: 'Victory display' },
    { pile: own ? `aside:p${seat}` : 'saside', drop: 'pile', label: 'Set aside' },
  );
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

/** Where a card dragged at x slots in among the other hand cards, given their middles. */
export function insertIndex(middles: number[], x: number): number {
  return middles.filter((middle) => middle < x).length;
}
