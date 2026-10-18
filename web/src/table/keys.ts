// The table's keyboard shortcuts (spec 5.10). One keydown listener on the
// window acts on the element under the pointer, with the items its action bar
// offers; the hand cards, which have no bar, get their own keys here.

import { modal } from '../components/modal.svelte';
import type { Action, Area, CardView, Size, View } from '../lib/types';
import type { ActionItem } from './actions';
import { interaction } from './interaction.svelte';
import { cardBox, footprints, GRID } from './layout';
import { ZOOM_STEP } from './zoom';

/** P plays a card no further left than this: past the deck, the discard pile and the identity. */
const PLAY_FROM_X = 280;

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
 * Handles a key pressed anywhere on the page. Nothing acts while the viewer
 * types in a field or a dialog is open: the key is theirs.
 */
export function handleKey(event: KeyboardEvent, table: KeyTable): void {
  if (event.defaultPrevented || modal.open || isTyping(event.target)) {
    return;
  }
  if (event.key === 'Escape') {
    interaction.escape();
    return;
  }
  // ⌘ or Ctrl + a key is the browser's shortcut, not ours.
  if (event.metaKey || event.ctrlKey) {
    return;
  }
  if (tableKey(event.key, table) || playerKey(event, table)) {
    event.preventDefault();
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  );
}

/** The keys everyone has, spectators too: the zoom and the shortcuts sheet. */
function tableKey(key: string, table: KeyTable): boolean {
  switch (key) {
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
      table.showKeys();
      return true;
    default:
      return false;
  }
}

/** The keys that act on the game, for players only. Returns whether the key did something. */
function playerKey(event: KeyboardEvent, table: KeyTable): boolean {
  // Alt + a letter types another character on macOS, and opens the browser's menus elsewhere.
  if (table.view.you.role !== 'player' || event.altKey) {
    return false;
  }
  // Case-insensitive: Caps Lock does not change what a key does, only Shift does.
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) {
    if (!table.view.canUndo) {
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
    return !event.shiftKey && handKey(key, hovered.id, table);
  }
  if (!Array.isArray(table.items)) {
    return false;
  }
  const item = findItem(table.items, key);
  if (!item) {
    return false;
  }
  if (event.shiftKey) {
    return removeOne(item, table);
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

/**
 * Shift + a token or status key takes one off: the item's own action, the
 * other way. Nothing is sent when the card has none, rather than a change
 * that changes nothing. Shift with any other key does nothing.
 */
function removeOne(item: ActionItem, table: KeyTable): boolean {
  const adds = item.run?.();
  if (!adds || !('kind' in adds) || (adds.kind !== 'token' && adds.kind !== 'status')) {
    return false;
  }
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
      const cards = table.view.table?.cards ?? [];
      const card = cards.find((c) => c.id === id);
      if (!area || !card) {
        return false;
      }
      const { x, y } = freeSlot(card, cards, area, table.sizeOf);
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
 * The first spot of the top row of an area, from x 280 on and on the 10-unit
 * grid, where the card would overlap none of the area's table cards.
 */
export function freeSlot(
  card: CardView,
  cards: CardView[],
  area: Area,
  sizeOf: (card: CardView) => Size,
): { x: number; y: number } {
  const { w, h } = cardBox(sizeOf(card), { faceDown: card.faceDown });
  const taken = footprints(cards, [], area, sizeOf);
  // Ends: every card is passed after a finite number of steps.
  for (let x = PLAY_FROM_X; ; x += GRID) {
    const overlaps = taken.some(
      (box) => box.x < x + w && x < box.x + box.w && box.y < h && 0 < box.y + box.h,
    );
    if (!overlaps) {
      return { x, y: 0 };
    }
  }
}
