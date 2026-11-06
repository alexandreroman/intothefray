// Drag and drop on the table (spec 5.4): what can be dragged, where it can be
// dropped, and the action a drop sends. Pure helpers; DragLayer.svelte follows
// the pointer, measures the screen and calls them.

import { byId } from '../lib/byId';
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
  decksFor,
  discardPileOf,
  homeDeckOf,
  staysOnTable,
} from './actions';
import type { Pressable } from './interaction.svelte';
import { FINE_GRID, floorTo, snapTo, type SnapGrid } from './grid';
import { isDiscardPile, TABLE_LIMIT } from './layout';
import { ALL_TABLE, ROW_LABEL_ROOM, type TableMap } from './rows';
import { areaOf, isScenarioDeckId, isSideDeckId, ownSeats, PILE_ENCOUNTER } from './seats';

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
 * that pile. A deck's top card dropped back on its own deck returns there: the
 * drop is outlined as any other, and sends nothing.
 */
export type PileDrop = 'top' | 'discard' | 'pile' | 'return';

/** Where a drop can land, with its box on the screen. */
export type DropRect =
  /** A slot among the hand cards, for a hand card. */
  | { kind: 'hand'; index: number; rect: Rect }
  /**
   * The hand as a whole, for a table card going back to it. In dock mode it is the dock's hand
   * button, which also takes a hand card back: a drop there sends nothing.
   */
  | { kind: 'toHand'; rect: Rect }
  /** The table itself, where it shows. */
  | { kind: 'table'; rect: Rect }
  /** A pile, as pileTargets has it (`exact`: see PileTarget). */
  | { kind: 'pile'; pile: string; drop: PileDrop; label: string; exact?: boolean; rect: Rect }
  | { kind: 'card'; card: string; z: number; rect: Rect };

export type TableRect = Extract<DropRect, { kind: 'table' }>;

/**
 * Where a card dropped on the table goes, in table units, from the corner it
 * is drawn at: in dock mode, its insertion among the units of a row (spec 3.7,
 * dockLayout.ts insertAt), which knows the dragged card's size and what is
 * dragged.
 */
export type DropSpot = (corner: Point) => Point;
type PileRect = Extract<DropRect, { kind: 'pile' }>;
type CardRect = Extract<DropRect, { kind: 'card' }>;

/** What is dragged, read from the current view. */
export type DragSource =
  /** A table card, with what it carries (stackOf). */
  | { kind: 'card'; card: string; x: number; y: number }
  /** A card of the hand of the player seated in `area`. */
  | { kind: 'hand'; card: string; hand: readonly string[]; area: Area }
  /** The top card of a pile that shows its cards. */
  | { kind: 'pile'; pile: string; card: string }
  /**
   * The unknown top card of an encounter deck, the classic one or a scenario one: dealt face down
   * where it lands or under a card, or discarded.
   */
  | { kind: 'encounter'; pile: string }
  /**
   * The unknown top card of one of the viewer's own decks: drawn, discarded, or played face down,
   * or face up from a side deck that shows its top card (the server's landsFaceDown), where it
   * lands or under a card. Also the top card of a scenario deck that is not an encounter deck,
   * which belongs to nobody: discarded, or played face up.
   */
  | { kind: 'deck'; pile: string }
  /** A marker (the first player token, the active counter), from where it lies. */
  | { kind: 'marker'; name: MarkerName; x: number; y: number };

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
 * the table itself. Null outside the table. An exact pile (a deck that is not
 * the dragged card's home) counts only right under the point, and only when
 * no card lies there: a card revealed on that deck takes the tuck.
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

  const topCard = topCardAt(point, targets);
  let nearestPile: PileRect | null = null;
  let nearestDistance = PILE_MARGIN;
  for (const target of targets) {
    if (target.kind !== 'pile') {
      continue;
    }
    if (target.exact && (topCard !== null || !contains(target.rect, point))) {
      continue;
    }
    const d = distance(target.rect, point);
    if (d <= nearestDistance) {
      nearestPile = target;
      nearestDistance = d;
    }
  }
  return nearestPile ?? topCard ?? table;
}

/** The topmost card under the point, null when none lies there. */
function topCardAt(point: Point, targets: DropRect[]): CardRect | null {
  let topCard: CardRect | null = null;
  for (const target of targets) {
    if (target.kind === 'card' && contains(target.rect, point)) {
      if (topCard === null || target.z > topCard.z) {
        topCard = target;
      }
    }
  }
  return topCard;
}

/**
 * The action a drop sends: `at` is where the dragged card's top-left corner
 * is drawn, in table units, `dealTo` the player an encounter card dealt there
 * goes to (see dealRecipient), `map` where the view mode draws the table, and
 * `spot` where a card dropped on the table goes, when the view mode places it
 * itself (dock mode); without it, and for a marker, the corner snapped to
 * `grid` (grid.ts: a tablet's is coarser) and mapped back to the table.
 * Null when nothing would change: no target, the spot it was taken from, or
 * its own place in the hand. A card revealed on a deck lies on that deck, so
 * dropped where it lies it goes back on top of the deck it lies on.
 */
export function dropAction(
  drag: DragSource,
  target: DropRect | null,
  at: Point,
  dealTo: Area,
  map: TableMap = ALL_TABLE,
  spot?: DropSpot,
  grid: SnapGrid = FINE_GRID,
): Action | null {
  if (target === null) {
    return null;
  }
  // A marker lies anywhere on the table, over cards and piles alike.
  if (drag.kind === 'marker') {
    return target.kind === 'hand' || target.kind === 'toHand'
      ? null
      : place(drag, spotOf(at, map, grid), dealTo);
  }
  switch (target.kind) {
    case 'hand':
      return drag.kind === 'hand' ? reorder(drag, target.index) : null;
    case 'toHand':
      return toHand(drag);
    case 'pile':
      return onPile(drag, target.pile, target.drop);
    case 'card':
      return onCard(drag, target.card, dealTo);
    case 'table':
      return place(drag, spot ? withinTable(spot(at)) : spotOf(at, map, grid), dealTo);
  }
}

/**
 * A table card goes back to its owner's hand; the top card of the viewer's
 * deck is drawn, from the side deck it was dragged from (a deck's draw names
 * no pile: the server draws from the credited seat's deck). A scenario deck
 * belongs to no hand.
 */
function toHand(drag: DragSource): Action | null {
  switch (drag.kind) {
    case 'card':
      return { kind: 'toHand', card: drag.card };
    case 'deck':
      if (isScenarioDeckId(drag.pile)) {
        return null;
      }
      return isSideDeckId(drag.pile)
        ? { kind: 'draw', n: 1, pile: drag.pile }
        : { kind: 'draw', n: 1 };
    default:
      return null;
  }
}

/** What can be dropped onto a card or a pile: everything but a marker. */
type CardSource = Exclude<DragSource, { kind: 'marker' }>;

/**
 * A drop on a card tucks the dragged card into that card's stack. The server
 * appends it to the end of the chain and lays the chain out itself, whatever
 * card of the stack it was dropped on: the drop point is not sent. `dealTo`
 * is who an encounter card dealt there goes to (see dealRecipient).
 */
function onCard(drag: CardSource, card: string, dealTo: Area): Action | null {
  switch (drag.kind) {
    case 'card':
      return { kind: 'attach', card: drag.card, target: card };
    case 'hand':
    case 'pile':
      // Played and tucked in one action: one undo step.
      return { kind: 'play', card: drag.card, target: card };
    case 'deck':
      // A deck's top card is played and tucked as a hand card is: the server plays the deck's top
      // card, which the client may not know, and chooses its facing, face down out of a main deck.
      return { kind: 'play', pile: drag.pile, target: card };
    case 'encounter':
      // Dealt face down and tucked in one action (spec 5.5). The classic encounter deck is the
      // default: only a scenario deck names itself.
      return drag.pile === PILE_ENCOUNTER
        ? { kind: 'deal', area: dealTo, target: card }
        : { kind: 'deal', pile: drag.pile, area: dealTo, target: card };
  }
}

/** Whether the action tucks a card under another: attach, or a play or a deal with a target. */
export function tucks(action: Action): boolean {
  if (action.kind === 'attach') {
    return true;
  }
  return (action.kind === 'play' || action.kind === 'deal') && action.target !== undefined;
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
  // A pile's top card dropped back onto its pile stays where it is. A card revealed on a deck
  // goes back on top of the deck it lies on.
  if (drag.kind === 'pile' && drag.pile === pile) {
    return null;
  }
  // A deck's top card is discarded on its discard pile; dropped back on its deck, it stays there.
  if (drag.kind === 'encounter' || drag.kind === 'deck') {
    return drop === 'discard' ? { kind: 'discardTop', pile: drag.pile, n: 1 } : null;
  }
  switch (drop) {
    case 'return':
      return null;
    case 'top':
      return { kind: 'toDeck', card: drag.card, where: 'top', pile };
    case 'discard':
      return { kind: 'discard', card: drag.card };
    case 'pile':
      return { kind: 'toPile', card: drag.card, target: pile };
  }
}

/** Where a card whose corner is drawn at `at` lies on the table, on the grid. */
function spotOf(at: Point, map: TableMap, grid: SnapGrid): Point {
  // Snapped where it is drawn, then mapped to the table: snapping after would
  // push a card drawn at the bottom of a row into the next, hidden, one. A row
  // that ends there keeps the card on its last height, taken down to the grid.
  // Across, a point drawn smaller (dock mode) comes back between two grid
  // lines, and goes to the nearest one.
  const { step, offsetY } = grid;
  const spot = map.toTable({ x: snapTo(at.x, step), y: snapTo(at.y, step, offsetY) });
  return withinTable({ x: snapTo(spot.x, step), y: floorTo(spot.y, step, offsetY) });
}

/** A spot within the server's bounds: never off the top or left edge, nor past TABLE_LIMIT. */
function withinTable(spot: Point): Point {
  return {
    x: Math.min(TABLE_LIMIT, Math.max(0, spot.x)),
    y: Math.min(TABLE_LIMIT, Math.max(0, spot.y)),
  };
}

/** The action that lays the dragged card or marker at a spot of the table. */
function place(drag: DragSource, { x, y }: Point, dealTo: Area): Action | null {
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
      return drag.pile === PILE_ENCOUNTER
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
 * a marker, and drag the top card of a scenario deck that is not an
 * encounter deck.
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
      const card = byId(table.cards).get(element.id);
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
      const pile = byId(table.piles).get(element.id);
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
      // A scenario deck belongs to nobody: anyone plays its top card.
      if (pile.kind === 'scenarioDeck') {
        return { kind: 'deck', pile: pile.id };
      }
      // Out-of-play piles are not drawn on the table: only a discard pile is dragged from.
      const open = isDiscardPile(pile.kind);
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

/**
 * Whether a drop on a hand takes what is dragged: `units` are the units of a
 * group drag (selection.ts, groupUnits), empty when one card or stack is
 * dragged. Each card of a group goes to its owner's hand, which must be one of
 * the viewer's (handAreaOf).
 */
export function goesToHand(drag: DragSource, units: readonly string[], view: View): boolean {
  if (units.length === 0) {
    return handAreaOf(drag, view) !== null;
  }
  return units.every((id) => {
    const unit = sourceOf({ kind: 'card', id }, view);
    return unit !== null && handAreaOf(unit, view) !== null;
  });
}

/** A pile a drag can go onto, and what the drop does there. */
export interface PileTarget {
  pile: string;
  drop: PileDrop;
  label: string;
  /**
   * Set on a deck that is not the dragged card's home: a drop goes onto it only right over it, and
   * a card lying there wins over it (dropTarget). Other piles take a drop up to 20 px away.
   */
  exact?: boolean;
}

/**
 * The piles a dragged card can go to: the top of every deck that takes it
 * (decksFor: those of its owner, its home deck first; the viewer's own cards
 * and cards of nobody's only), any deck but its home an exact target (see
 * PileTarget), and its discard pile, when it has one; none
 * when it stays on the table. Move to ▾ offers its home deck only. The top
 * card of a deck goes to the pile that deck discards to (deckDiscardOf): a
 * player's deck to its discard pile, the encounter deck's to the encounter
 * discard pile, a side or scenario deck's to the pile it names. A deck's top
 * card also takes its own deck, where a drop returns it and sends nothing.
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
    const deck = table.piles.find((p) => p.id === drag.pile);
    if (!deck) {
      return [];
    }
    const targets: PileTarget[] = [];
    const discard = deckDiscardOf(deck, table.piles);
    if (discard !== null) {
      targets.push({ pile: discard, drop: 'discard', label: 'Discard' });
    }
    // A drop on the deck itself cancels the drag: without this target, it would deal or play the
    // card at the deck's spot.
    targets.push({ pile: deck.id, drop: 'return', label: `Top of ${deckName(deck)}` });
    return targets;
  }

  const card = table.cards.find((c) => c.id === drag.card);
  if (!card || staysOnTable(card, table)) {
    return [];
  }
  const targets: PileTarget[] = [];
  const home = homeDeckOf(card);
  for (const deck of decksFor(card, seats, table.piles)) {
    const target: PileTarget = { pile: deck.id, drop: 'top', label: `Top of ${deckName(deck)}` };
    if (deck.id !== home) {
      // Side decks lie next to the identity, scenario decks among the villain's cards: a card
      // dropped near one is placed on the table, not put into it.
      target.exact = true;
    }
    targets.push(target);
  }
  // The out-of-play piles are not drawn: Move to ▾ sends a card there.
  const discard = discardPileOf(card, table.piles);
  if (discard !== null) {
    targets.push({ pile: discard, drop: 'discard', label: 'Discard' });
  }
  return targets.filter(exists);
}

/**
 * What moves with a table card: a main card (tucked under none) carries its
 * whole chain, in order; a tucked card moves alone, and the server closes
 * the chain behind it. It mirrors the server's carried cards
 * (internal/game/apply.go).
 */
export function stackOf(id: string, cards: readonly CardView[]): string[] {
  const card = cards.find((c) => c.id === id);
  if (card?.parent !== undefined) {
    return [id];
  }
  return chainOf(id, cards);
}

/**
 * The card, then the table card tucked directly under it, then the one
 * under that, and so on to the end of the chain: each card holds at most one.
 */
function chainOf(id: string, cards: readonly CardView[]): string[] {
  const chain = [id];
  let next = tuckedUnder(id, cards);
  // The includes check guards against a loop in a broken view.
  while (next !== undefined && !chain.includes(next.id)) {
    chain.push(next.id);
    next = tuckedUnder(next.id, cards);
  }
  return chain;
}

function tuckedUnder(id: string, cards: readonly CardView[]): CardView | undefined {
  return cards.find((card) => card.parent === id && card.zone === 'table');
}

/** The main card of the stack the card belongs to: up its chain, the card tucked under none. */
export function mainCardOf(card: CardView, cards: readonly CardView[]): CardView {
  const cardsById = byId(cards);
  const seen = new Set([card.id]);
  let main = card;
  // The seen set guards against a parent loop in a broken view.
  while (main.parent !== undefined && !seen.has(main.parent)) {
    const host = cardsById.get(main.parent);
    if (host === undefined) {
      break;
    }
    seen.add(host.id);
    main = host;
  }
  return main;
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

/**
 * Where an element drawn at `rect` on the screen lies without its `translate`: the computed style,
 * "none" or "x [y]" in px of the surface, which `zoom` scales. In dock mode a drag draws the cards
 * and piles it pushes aside with a translate (spec 3.8): the drop reads them where they lie, so that
 * the cards gliding out of the way never move what the pointer is over.
 */
export function unshifted(rect: Rect, translate: string, zoom: number): Rect {
  if (translate === 'none') {
    return rect;
  }
  const [x = 0, y = 0] = translate.split(' ').map((length) => Number.parseFloat(length) || 0);
  return {
    left: rect.left - x * zoom,
    top: rect.top - y * zoom,
    right: rect.right - x * zoom,
    bottom: rect.bottom - y * zoom,
  };
}

/**
 * What a drop lands on and the action it sends, as text: two drops alike land alike, wherever the
 * screen measured their target.
 */
export function dropKey(target: DropRect | null, action: Action | null): string {
  if (target === null) {
    return 'none';
  }
  let on: string;
  switch (target.kind) {
    case 'hand':
      on = `hand:${target.index}`;
      break;
    case 'pile':
      on = `pile:${target.pile}:${target.drop}`;
      break;
    case 'card':
      on = `card:${target.card}`;
      break;
    default:
      on = target.kind;
  }
  return `${on} ${JSON.stringify(action)}`;
}

/**
 * How far past the edge of the drop the rows show (dock mode, spec 3.8) the pointer goes before
 * they show the next one, in drawn units: a quarter of a slot.
 */
export const DROP_MARGIN = 11;

/** How long the pointer stays past that edge, if not by the margin, before the next drop shows. */
export const DROP_DWELL_MS = 80;

/**
 * The drop the rows show during a drag in dock mode (spec 3.8), kept while the pointer wavers on
 * its edge (hysteresis): a finger shaking by a pixel on the boundary between two slots would
 * otherwise flip the cards making way back and forth. The next drop shows once the pointer is
 * `margin` past the last point the shown one lay under it, or has stayed off it DROP_DWELL_MS. A
 * drop let go is settled the same way: it lands where the rows show it.
 */
export class SteadyDrop<T> {
  readonly #keyOf: (drop: T) => string;
  /** The drop shown, with its key and the last point it lay under the pointer. */
  #shown: { key: string; drop: T; at: Point } | null = null;
  /** The other drop under the pointer, and since when, while the shown one holds. */
  #pending: { key: string; since: number } | null = null;

  constructor(keyOf: (drop: T) => string) {
    this.#keyOf = keyOf;
  }

  /** Whether another drop lies under the pointer, which shows once it stays there long enough. */
  get waiting(): boolean {
    return this.#pending !== null;
  }

  /**
   * The drop to show with the pointer at `at`, `now` in ms: `locate`'s there, unless the pointer is
   * still within `margin` of where the shown one last lay under it and has not stayed off it
   * DROP_DWELL_MS.
   */
  settle(at: Point, margin: number, now: number, locate: (at: Point) => T): T {
    const drop = locate(at);
    const key = this.#keyOf(drop);
    const shown = this.#shown;
    const near = shown !== null && Math.hypot(at.x - shown.at.x, at.y - shown.at.y) < margin;
    if (shown !== null && key !== shown.key && near) {
      if (this.#pending?.key !== key) {
        this.#pending = { key, since: now };
      }
      if (now - this.#pending.since < DROP_DWELL_MS) {
        return shown.drop;
      }
    }
    this.#shown = { key, drop, at };
    this.#pending = null;
    return drop;
  }

  /** Forgets the drop shown: the next drag starts afresh. */
  reset(): void {
    this.#shown = null;
    this.#pending = null;
  }
}
