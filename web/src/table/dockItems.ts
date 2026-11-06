// What dock mode's projection lays out (spec 3.7, dockLayout.ts): the table cards, the piles drawn on
// the table, the owner frames around them and the markers, in table units, each with the item it
// travels with. A tucked card goes with the card it is tucked under, a card revealed on a pile with
// that pile, a pile with its owner frame, and a marker with the card it lies by.

import type { CardView, MarkerName, PileView, Point, Size } from '../lib/types';
import type { DockItem } from './dockLayout';
import { isHidden } from './face';
import {
  ACTIVE_COUNTER_BOX,
  cardBox,
  FIRST_PLAYER_BOX,
  frameLabel,
  pileBox,
  type OwnerFrame,
} from './layout';
import { rowOf } from './rows';

/** The table as dock mode lays it out, in table units. */
export interface DockTable {
  /** The cards lying on the table. */
  cards: readonly CardView[];
  /** The piles drawn on the table: not the out-of-play ones. */
  piles: readonly PileView[];
  /** The frames around the owners' piles (ownerFrames). */
  frames: readonly OwnerFrame[];
  /** Where each marker the table has lies. */
  markers: Partial<Record<MarkerName, Point>>;
  sizeOf: (card: CardView) => Size;
}

// A marker lies by a card when its box comes at most this close to the card's, in table units: the
// first player token starts 40 right of its identity, the active counter 23 under its villain.
const MARKER_REACH = 60;

/** The id of an owner frame among the laid out items: frames have no id of their own. */
export function frameItemId(frame: OwnerFrame): string {
  return `frame:${frame.owner}:${frame.label ?? ''}`;
}

/** The id of a marker among the laid out items. */
export function markerItemId(name: MarkerName): string {
  return `marker:${name}`;
}

/** How far apart two boxes lie: the widest gap between them along either axis, 0 when they overlap. */
function gapBetween(a: DockItem, b: DockItem): number {
  return Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
}

/** The card a marker lies by: the closest one within reach, the leftmost of those as close; none else. */
function cardBy(marker: DockItem, cards: readonly DockItem[]): string | undefined {
  let found: DockItem | undefined;
  let foundGap = Infinity;
  for (const card of cards) {
    const gap = gapBetween(marker, card);
    if (gap > MARKER_REACH) {
      continue;
    }
    if (gap < foundGap || (gap === foundGap && card.x < (found?.x ?? Infinity))) {
      found = card;
      foundGap = gap;
    }
  }
  return found?.id;
}

/** Every item of the table dock mode lays out, with the item each travels with. */
export function dockItems(table: DockTable): DockItem[] {
  const cards = table.cards.map((card): DockItem => {
    const box = cardBox(table.sizeOf(card), { faceDown: isHidden(card), onPile: !!card.onPile });
    return {
      id: card.id,
      x: card.x,
      y: card.y,
      w: box.w,
      h: box.h,
      kind: 'card',
      anchor: card.parent ?? card.onPile,
    };
  });
  const frames = table.frames.map((frame): DockItem => ({
    id: frameItemId(frame),
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    kind: 'frame',
  }));
  const piles = table.piles.map((pile): DockItem => {
    const label = frameLabel(pile);
    const frame = table.frames.find((f) => f.owner === pile.owner && f.label === label);
    return {
      id: pile.id,
      x: pile.x,
      y: pile.y,
      ...pileBox(pile),
      kind: 'pile',
      anchor: frame === undefined ? undefined : frameItemId(frame),
    };
  });
  const markers = (Object.entries(table.markers) as [MarkerName, Point][]).map(
    ([name, at]): DockItem => {
      const box = name === 'active' ? ACTIVE_COUNTER_BOX : FIRST_PLAYER_BOX;
      const marker: DockItem = { id: markerItemId(name), x: at.x, y: at.y, ...box, kind: 'marker' };
      return { ...marker, anchor: cardBy(marker, cards) };
    },
  );
  return [...frames, ...piles, ...cards, ...markers];
}

/**
 * The rows dock mode shows, top to bottom: in "Villain + player" the villain's
 * and the shown row; in "All" the villain's and every row an item lies in, so
 * that nothing below the last seat's row is lost. An item that travels with
 * another lies in that item's row.
 */
export function dockRows(items: readonly DockItem[], shownRow?: number): number[] {
  if (shownRow !== undefined) {
    return [0, shownRow];
  }
  const ids = new Set(items.map((item) => item.id));
  const rows = new Set([0]);
  for (const item of items) {
    if (item.anchor === undefined || !ids.has(item.anchor)) {
      rows.add(rowOf(item.y));
    }
  }
  return [...rows].sort((a, b) => a - b);
}
