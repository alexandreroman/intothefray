// The table's keyboard shortcuts (spec 5.10). One keydown listener on the
// window acts on the element under the pointer, with the items its action bar
// offers; the hand cards, which have no bar, get their own keys here.

import { modal } from '../components/modal.svelte';
import type { Action, Area, CardView, PileView, Size, View } from '../lib/types';
import type { ActionItem } from './actions';
import { interaction } from './interaction.svelte';
import { footprints, isOutOfPlay, visualBox } from './layout';
import { ZOOM_STEP } from './zoom';

// The prototype's free slot (ruling P5b-R5): from x 280, past the deck and
// the discard pile, in 140 steps, a 100-wide card with 20 free on each side,
// on the top row (140 high).
const SLOT_FIRST_X = 280;
const SLOT_STEP = 140;
const SLOT_CARD_WIDTH = 100;
const SLOT_MARGIN = 20;
const TOP_ROW_HEIGHT = 140;

/** What the keys need from the table. */
export interface KeyTable {
  view: View;
  /** The actions of the hovered element, as its bar offers them. */
  items: ActionItem[] | { text: string };
  zoom: number;
  setZoom: (zoom: number) => void;
  /** Runs a bar item, as a click on it would. */
  run: (item: ActionItem) => void;
  act: (action: Action) => void;
  /** Shows the keyboard shortcuts sheet. */
  showKeys: () => void;
  sizeOf: (card: CardView) => Size;
}

/**
 * Handles a key pressed anywhere on the page. Nothing acts while a dialog is
 * open, and only Escape while the viewer types in a field: the keys are theirs.
 */
export function handleKey(event: KeyboardEvent, table: KeyTable): void {
  if (event.defaultPrevented || modal.open) {
    return;
  }
  // Escape lets go of the table even from a field, as in the prototype.
  if (event.key === 'Escape') {
    if (!event.repeat) {
      interaction.escape();
    }
    return;
  }
  if (isTyping(event.target)) {
    return;
  }
  // ⌘ or Ctrl + a key is the browser's shortcut, not ours.
  if (event.metaKey || event.ctrlKey) {
    return;
  }
  if (tableKey(event, table) || playerKey(event, table)) {
    event.preventDefault();
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  );
}

/** The keys everyone has, spectators too: the zoom (it repeats while held) and the shortcuts sheet. */
function tableKey(event: KeyboardEvent, table: KeyTable): boolean {
  switch (event.key) {
    case '+':
    case '=':
      table.setZoom(table.zoom + ZOOM_STEP);
      return true;
    case '-':
    case '_':
      table.setZoom(table.zoom - ZOOM_STEP);
      return true;
    case '0':
      table.setZoom(1);
      return true;
    case '?':
      if (!event.repeat) {
        table.showKeys();
      }
      return true;
    default:
      return false;
  }
}

/**
 * The keys that act on the game, for players only. A held key repeats only
 * the counters: played or discarded cards, undos and the rest happen once.
 * Returns whether the key did something.
 */
function playerKey(event: KeyboardEvent, table: KeyTable): boolean {
  // Alt + a letter types another character on macOS, and opens the browser's menus elsewhere.
  if (table.view.you.role !== 'player' || event.altKey) {
    return false;
  }
  // Case-insensitive: Caps Lock does not change what a key does, only Shift does.
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    if (event.repeat || !table.view.canUndo) {
      return false;
    }
    table.act({ kind: 'undo' });
    return true;
  }

  const hovered = interaction.hovered;
  if (hovered === null) {
    return false;
  }
  if (hovered.kind === 'hand') {
    return !event.shiftKey && !event.repeat && handKey(key, hovered.id, table);
  }
  if (!Array.isArray(table.items)) {
    return false;
  }
  const item = findItem(table.items, key);
  if (!item) {
    return false;
  }
  const adds = counterAction(item);
  if (event.shiftKey) {
    // Shift goes with the token and status keys only.
    return adds !== null && removeOne(adds, table);
  }
  if (event.repeat && adds === null) {
    return false;
  }
  table.run(item);
  return true;
}

/** The enabled item with that key, in the bar or in one of its enabled dropdowns. */
function findItem(items: ActionItem[], key: string): ActionItem | undefined {
  for (const item of items) {
    if (item.disabled) {
      continue;
    }
    if (item.key?.toLowerCase() === key) {
      return item;
    }
    const inMenu = item.menu ? findItem(item.menu, key) : undefined;
    if (inMenu) {
      return inMenu;
    }
  }
  return undefined;
}

/** The action of a token or status item, which adds one; null for any other item. */
function counterAction(item: ActionItem): Action | null {
  const result = item.run?.();
  if (!result || !('kind' in result)) {
    return null;
  }
  return result.kind === 'token' || result.kind === 'status' ? result : null;
}

/**
 * Shift + a token or status key takes one off: the item's own action, the
 * other way. Nothing is sent when the card has none, rather than a change
 * that changes nothing.
 */
function removeOne(adds: Action, table: KeyTable): boolean {
  const card = table.view.table?.cards.find((c) => c.id === adds.card);
  const counts = adds.kind === 'token' ? card?.tokens : card?.status;
  if ((counts?.[adds.name ?? ''] ?? 0) > 0) {
    table.act({ ...adds, delta: -1 });
  }
  return true;
}

/** P plays a card of the hand to the first free slot of the viewer's area, X discards it. */
function handKey(key: string, id: string, table: KeyTable): boolean {
  switch (key) {
    case 'p': {
      const area = table.view.you.area;
      if (!area || !table.view.table) {
        return false;
      }
      const { cards, piles } = table.view.table;
      const { x, y } = freeSlot(cards, piles, area, table.sizeOf);
      table.act({ kind: 'play', card: id, area, x, y });
      return true;
    }
    case 'x':
      table.act({ kind: 'discard', card: id });
      return true;
    default:
      return false;
  }
}

/**
 * The prototype's free slot for a card played from the hand: the first spot
 * of the top row of an area, from x 280 in steps of 140, where a 100-wide
 * card keeps 20 free on each side. The area's table cards and in-play piles
 * are in the way; its victory and set-aside piles are not, being drawn at
 * the right end of the zone (placeOutPiles).
 */
export function freeSlot(
  cards: CardView[],
  piles: PileView[],
  area: Area,
  sizeOf: (card: CardView) => Size,
): { x: number; y: number } {
  const inPlay = piles.filter((p) => !isOutOfPlay(p));
  const items = footprints(cards, inPlay, area, sizeOf).filter((item) => item.y < TOP_ROW_HEIGHT);
  // Ends: every item is passed after a finite number of steps.
  for (let x = SLOT_FIRST_X; ; x += SLOT_STEP) {
    const blocked = items.some(
      (item) =>
        item.x < x + SLOT_CARD_WIDTH + SLOT_MARGIN && visualBox(item).right > x - SLOT_MARGIN,
    );
    if (!blocked) {
      return { x, y: 0 };
    }
  }
}
