// Several table cards selected with a rubber band and moved as a group (spec
// 5.2): what the band selects, which cards a drag lifts, and the action a drop
// sends. Pure helpers; Table.svelte draws the band and DragLayer.svelte drags
// the group.

import type { Action, CardView, Point, View } from '../lib/types';
import { mainCardOf, pileTargets, sourceOf, type PileTarget, type Rect } from './drag';
import { TABLE_LIMIT } from './layout';
import { ALL_TABLE, type TableMap } from './rows';

/**
 * Mirrors maxCount in internal/game/action.go: the most cards one action
 * takes, and the most sub-actions a group holds (resolveGroup).
 */
export const MAX_COUNT = 99;

/** Whether the two boxes overlap, edges included: a band that grazes a card selects it. */
function touches(a: Rect, b: Rect): boolean {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

/** The cards whose box, on the screen, the band touches. */
export function cardsInBand(band: Rect, boxes: ReadonlyMap<string, Rect>): string[] {
  const touched: string[] = [];
  for (const [id, box] of boxes) {
    if (touches(band, box)) {
      touched.push(id);
    }
  }
  return touched;
}

/** Whether a group can hold the card: on the table, not lying on a pile. */
export function isFree(card: CardView): boolean {
  return card.zone === 'table' && card.onPile === undefined;
}

/**
 * The cards a group drag lifts, each with what it carries (stackOf): the
 * selected free table cards, bottom first, but those whose main card is one
 * of them, which carries its whole chain. Any other selected tucked card is a
 * unit of its own and moves alone, as a single drag would (memory "Moving
 * card stacks"). It mirrors the server's group rule (resolveGroup).
 */
export function groupUnits(selected: ReadonlySet<string>, cards: readonly CardView[]): string[] {
  const chosen = (card: CardView): boolean => selected.has(card.id) && isFree(card);
  const carried = (card: CardView): boolean => {
    const main = mainCardOf(card, cards);
    return main !== card && chosen(main);
  };
  return cards
    .filter((card) => chosen(card) && !carried(card))
    .sort((a, b) => a.z - b.z)
    .map((card) => card.id);
}

/**
 * The action a group drop sends, from the action the lead (pressed) card
 * alone would send there: every unit moves by the lead's delta, or goes to
 * the same pile, deck or hand. A group tucks under nothing: dropped over a
 * card, the lead moves there as over the table (DragLayer.svelte). The delta
 * is cut short so that every unit stays within the table, offsets kept. The
 * offsets are those drawn, through `map`: a group across rows drawn closer
 * or further apart than they lie, or wrapped, keeps its shape on the screen. One unit
 * sends its own action; null when the drop does nothing for a group (a play,
 * a deal), moves nothing, or carries more units than the server takes in one
 * group.
 */
export function groupAction(
  units: readonly string[],
  lead: string,
  single: Action,
  cards: readonly CardView[],
  map: TableMap = ALL_TABLE,
): Action | null {
  let actions: Action[] | null;
  switch (single.kind) {
    case 'move':
      actions = groupMoves(units, lead, single, cards, map);
      break;
    case 'discard':
    case 'toPile':
    case 'toDeck':
    case 'toHand':
      actions = units.map((card) => ({ ...single, card }));
      break;
    default:
      actions = null;
  }
  if (actions === null || actions.length > MAX_COUNT) {
    return null;
  }
  if (actions.length > 1) {
    return { kind: 'group', actions };
  }
  // One unit, or none.
  return actions[0] ?? null;
}

/**
 * Every unit moved by the lead's delta as drawn, cut short at the table's
 * edges; null when nothing moves. Each unit lands on the point drawn at its
 * drawn corner plus the delta, which only a table drawn as it lies keeps as a
 * table offset (rows.ts, spreadRows; dockLayout.ts).
 */
function groupMoves(
  units: readonly string[],
  lead: string,
  single: Action,
  cards: readonly CardView[],
  map: TableMap,
): Action[] | null {
  const leadCard = cards.find((card) => card.id === lead);
  if (!leadCard || single.x === undefined || single.y === undefined) {
    return null;
  }
  const leadDrawn = map.toDisplay(leadCard, leadCard.id);
  const landingDrawn = map.toDisplay({ x: single.x, y: single.y });
  if (leadDrawn === null || landingDrawn === null) {
    return null;
  }
  const moved: { card: CardView; drawn: Point }[] = [];
  for (const id of units) {
    const card = cards.find((c) => c.id === id);
    // A unit is a card drawn on the table: one in a hidden row has left the group (pruneGroup).
    const drawn = card ? map.toDisplay(card, card.id) : null;
    if (!card || drawn === null) {
      return null;
    }
    moved.push({ card, drawn });
  }
  const drawnXs = moved.map(({ drawn }) => drawn.x);
  const drawnYs = moved.map(({ drawn }) => drawn.y);
  // Mirrors the server's bounds: every corner within 0..TABLE_LIMIT. The table's top-left corner
  // is drawn at 0, and no width is drawn larger than it lies.
  const drawnLimit = map.toDisplay({ x: 0, y: TABLE_LIMIT })?.y ?? Infinity;
  const dx = clamp(
    landingDrawn.x - leadDrawn.x,
    -Math.min(...drawnXs),
    TABLE_LIMIT - Math.max(...drawnXs),
  );
  const dy = clamp(
    landingDrawn.y - leadDrawn.y,
    -Math.min(...drawnYs),
    drawnLimit - Math.max(...drawnYs),
  );
  if (dx === 0 && dy === 0) {
    return null;
  }
  // Rounded to the unit, not snapped: the lead lands on its spot, snapped where it was dropped, and
  // the others keep their offsets to it, on the grid or not.
  return moved.map(({ card, drawn }) => {
    const spot = map.toTable({ x: drawn.x + dx, y: drawn.y + dy });
    return { kind: 'move', card: card.id, x: Math.round(spot.x), y: Math.round(spot.y) };
  });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The piles a group drag can go to: those every unit can go to on its own
 * (pileTargets), with the same drop. A deck is exact (see PileTarget) unless
 * it is the home of every unit. None when a unit cannot be dragged.
 */
export function groupPileTargets(units: readonly string[], view: View): PileTarget[] {
  let common: PileTarget[] | null = null;
  for (const id of units) {
    const source = sourceOf({ kind: 'card', id }, view);
    if (source === null) {
      return [];
    }
    const targets = pileTargets(source, view);
    common = common === null ? targets : commonTargets(common, targets);
  }
  return common ?? [];
}

/** The targets found in both lists, exact when exact in either. */
function commonTargets(kept: PileTarget[], targets: PileTarget[]): PileTarget[] {
  const common: PileTarget[] = [];
  for (const target of kept) {
    const same = targets.find((t) => t.pile === target.pile && t.drop === target.drop);
    if (same === undefined) {
      continue;
    }
    if (same.exact && !target.exact) {
      common.push({ ...target, exact: true });
    } else {
      common.push(target);
    }
  }
  return common;
}
