// Several table cards selected with a rubber band and moved as a group (spec
// 5.2): what the band selects, which cards a drag lifts, and the action a drop
// sends. Pure helpers; Table.svelte draws the band and DragLayer.svelte drags
// the group.

import type { Action, CardView, View } from '../lib/types';
import { pileTargets, sourceOf, type PileTarget, type Rect } from './drag';
import { TABLE_LIMIT } from './layout';
import { ALL_ROWS, type RowMap } from './rows';

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
 * The cards a group drag lifts, each with its stack (stackOf): the selected
 * free table cards none of whose hosts, up the chain, is selected, bottom
 * first. A selected card tucked under an unselected one detaches, as a single
 * drag would (memory "Moving card stacks").
 */
export function groupUnits(selected: ReadonlySet<string>, cards: readonly CardView[]): string[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const hostSelected = (card: CardView): boolean => {
    // The seen set guards against a parent loop in a broken view.
    const seen = new Set([card.id]);
    let parent = card.parent;
    while (parent !== undefined && !seen.has(parent)) {
      if (selected.has(parent)) {
        return true;
      }
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
    return false;
  };
  return cards
    .filter((card) => selected.has(card.id) && isFree(card) && !hostSelected(card))
    .sort((a, b) => a.z - b.z)
    .map((card) => card.id);
}

/**
 * The action a group drop sends, from the action the lead (pressed) card
 * alone would send there: every unit moves by the lead's delta, or goes to
 * the same pile, deck or hand. A drop over a card moves the group there,
 * tucked under nothing. The delta is cut short so that every unit stays
 * within the table, offsets kept. The offsets are those drawn, through
 * `rows`: a group across rows drawn closer or further apart than they lie
 * keeps its shape on the screen. One unit sends its own action; null when
 * the drop does nothing for a group (a play, a deal), moves nothing, or
 * carries more units than the server takes in one group.
 */
export function groupAction(
  units: readonly string[],
  lead: string,
  single: Action,
  cards: readonly CardView[],
  rows: RowMap = ALL_ROWS,
): Action | null {
  let actions: Action[] | null;
  switch (single.kind) {
    case 'move':
    case 'attach':
      actions = groupMoves(units, lead, single, cards, rows);
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
 * edges; null when nothing moves. Across the width, drawn and table units are
 * the same; down the table, each unit lands on the height drawn at its drawn
 * height plus the delta, which only the rows drawn as they lie keep as a
 * table offset (rows.ts, spreadRows).
 */
function groupMoves(
  units: readonly string[],
  lead: string,
  single: Action,
  cards: readonly CardView[],
  rows: RowMap,
): Action[] | null {
  const leadCard = cards.find((card) => card.id === lead);
  if (!leadCard || single.x === undefined || single.y === undefined) {
    return null;
  }
  const leadDrawn = rows.toDisplay(leadCard.y);
  const landingDrawn = rows.toDisplay(single.y);
  if (leadDrawn === null || landingDrawn === null) {
    return null;
  }
  const moved: { card: CardView; drawnY: number }[] = [];
  for (const id of units) {
    const card = cards.find((c) => c.id === id);
    // A unit is a card drawn on the table: one in a hidden row has left the group (pruneGroup).
    const drawnY = card ? rows.toDisplay(card.y) : null;
    if (!card || drawnY === null) {
      return null;
    }
    moved.push({ card, drawnY });
  }
  const xs = moved.map(({ card }) => card.x);
  const drawnYs = moved.map(({ drawnY }) => drawnY);
  // Mirrors the server's bounds: every corner within 0..TABLE_LIMIT. The table's top is drawn at 0.
  const drawnLimit = rows.toDisplay(TABLE_LIMIT) ?? Infinity;
  const dx = clamp(single.x - leadCard.x, -Math.min(...xs), TABLE_LIMIT - Math.max(...xs));
  const dy = clamp(
    landingDrawn - leadDrawn,
    -Math.min(...drawnYs),
    drawnLimit - Math.max(...drawnYs),
  );
  if (dx === 0 && dy === 0) {
    return null;
  }
  // Rounded to the unit, not snapped: the lead lands on its spot, snapped where it was dropped, and
  // the others keep their offsets to it, on the grid or not.
  return moved.map(({ card, drawnY }) => ({
    kind: 'move',
    card: card.id,
    x: card.x + dx,
    y: Math.round(rows.toTable(drawnY + dy)),
  }));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The piles a group drag can go to: those every unit can go to on its own
 * (pileTargets), with the same drop. None when a unit cannot be dragged.
 */
export function groupPileTargets(units: readonly string[], view: View): PileTarget[] {
  let common: PileTarget[] | null = null;
  for (const id of units) {
    const source = sourceOf({ kind: 'card', id }, view);
    if (source === null) {
      return [];
    }
    const targets = pileTargets(source, view);
    common =
      common === null
        ? targets
        : common.filter((kept) =>
            targets.some((t) => t.pile === kept.pile && t.drop === kept.drop),
          );
  }
  return common ?? [];
}
