// The table's keyboard shortcuts (spec 5.10). One keydown listener on the
// window acts on the element under the pointer, or on the one whose context
// menu is open, with the items its menu lists; the arrow, which is no item of
// that list, and the hand cards, which have no menu, get their own keys here.

import { modal } from '../components/modal.svelte';
import type { Action, CardView, Size, TableView, View } from '../lib/types';
import { countersOf, discardPileOf, type ActionItem, type CounterKind } from './actions';
import { interaction } from './interaction.svelte';
import {
  ACTIVE_COUNTER_BOX,
  cardBox,
  FIRST_PLAYER_BOX,
  footprints,
  GRID,
  PORTRAIT_CARD,
  visualBox,
} from './layout';
import { areaOf, ownSeats } from './seats';
import { ZOOM_STEP } from './zoom';

// The free slot of a player's row: room for the played card with 50 free on
// each side, as the setup leaves between the cards it puts in play
// (internal/game/setup.go). Turned 15° when exhausted, a portrait card reaches
// about 23 further on each side: 50 lets two neighbours both be exhausted
// without overlapping. The row is as high as a portrait card.
const SLOT_ROW_HEIGHT = PORTRAIT_CARD.h;
const SLOT_GAP = 50;

// Shift + these arrows step through the heroes of the player selector, or in "All" the viewer's decks.
const HERO_STEPS: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  ArrowRight: 1,
};

/** What the keys need from the table. */
export interface KeyTable {
  view: View;
  /** The actions of the hovered element, as its context menu lists them. */
  items: ActionItem[] | { text: string };
  zoom: number;
  setZoom: (zoom: number) => void;
  /** Runs an action item, as choosing it in the context menu would. */
  run: (item: ActionItem) => void;
  act: (action: Action) => void;
  /** Whether the table has a card that Ready all would ready. */
  canReadyAll: boolean;
  /** Shows the keyboard shortcuts sheet (a dialog: it has the keys while it is open). */
  showKeys: () => void;
  /** Selects the viewer's next own deck, whose hand then shows (Q, with two decks or more). */
  selectNextDeck: () => void;
  /** Whether there are two heroes or more to step through: the player selector's, or in "All" own decks. */
  canStepHero: boolean;
  /** Picks the previous (-1) or next (1) hero: in the player selector, else among the viewer's decks. */
  stepHero: (step: -1 | 1) => void;
  sizeOf: (card: CardView) => Size;
}

/**
 * Handles a key pressed anywhere on the page. Nothing acts while a dialog is
 * open, and only Escape while the viewer types in a field: the keys are theirs.
 */
export function handleKey(event: KeyboardEvent, table: KeyTable): void {
  if (event.defaultPrevented) {
    return;
  }
  // Outside a field, Backspace discards (as X does): it never takes the browser back in its history.
  if (event.key === 'Backspace' && !isTyping(event.target)) {
    event.preventDefault();
  }
  if (modal.open) {
    return;
  }
  // Escape lets go of the table, even from a field, as in the prototype. What
  // it dropped takes the key, so that fullscreen stays (lib/fullscreen, and the
  // "Escape in fullscreen" project memory note).
  if (event.key === 'Escape') {
    if (!event.repeat && interaction.escape()) {
      event.preventDefault();
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

/**
 * The keys everyone has, spectators too: the zoom (it repeats while held), the shortcuts sheet and
 * Shift + ← / → through the heroes, which only changes what the viewer sees.
 */
function tableKey(event: KeyboardEvent, table: KeyTable): boolean {
  const heroStep = HERO_STEPS[event.key];
  if (heroStep !== undefined && event.shiftKey) {
    if (event.repeat || !table.canStepHero) {
      return false;
    }
    table.stepHero(heroStep);
    return true;
  }
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

  // Q selects the next deck of a player with several, wherever the pointer is.
  if (key === 'q' && !event.shiftKey) {
    if (event.repeat || ownSeats(table.view).length < 2) {
      return false;
    }
    table.selectNextDeck();
    return true;
  }

  // Shift + Space readies all the player's cards, wherever the pointer is. Handled even when
  // there is nothing to ready: Space never scrolls the page under the table.
  if (key === ' ' && event.shiftKey) {
    if (!event.repeat && table.canReadyAll) {
      table.act({ kind: 'readyAll' });
    }
    return true;
  }

  // During a drag, the hovered element is still the one pressed: a key would act on the card in mid-air.
  const hovered = interaction.hovered;
  if (hovered === null || interaction.dragging !== null) {
    return false;
  }
  if (hovered.kind === 'hand') {
    return !event.shiftKey && !event.repeat && handKey(key, hovered.id, table);
  }
  // A starts an arrow from a card in play; a click then picks the card it points at.
  if (key === 'a' && hovered.kind === 'card') {
    const card = table.view.table?.cards.find((c) => c.id === hovered.id);
    if (event.shiftKey || event.repeat || card?.zone !== 'table') {
      return false;
    }
    interaction.startArrow(hovered.id);
    return true;
  }
  if (!Array.isArray(table.items)) {
    return false;
  }
  const item = findItem(table.items, key, event.shiftKey);
  if (item) {
    if (event.repeat && counterAction(item) === null) {
      return false;
    }
    table.run(item);
    return true;
  }
  // Without an item of its own (Draw X is Shift + W), Shift + a token or status key takes one off.
  const plain = event.shiftKey ? findItem(table.items, key, false) : undefined;
  const adds = plain ? counterAction(plain) : null;
  return adds !== null && removeOne(adds, table);
}

/**
 * The enabled item with that key, its main key or one of its alternatives, in
 * the list or in one of its enabled submenus, taken with Shift or not as the
 * item says.
 */
function findItem(items: ActionItem[], key: string, shift: boolean): ActionItem | undefined {
  for (const item of items) {
    if (item.disabled) {
      continue;
    }
    if (answersTo(item, key) && (item.shift ?? false) === shift) {
      return item;
    }
    const inMenu = item.menu ? findItem(item.menu, key, shift) : undefined;
    if (inMenu) {
      return inMenu;
    }
  }
  return undefined;
}

/** Whether the item runs on that key (lower case): its main key or one of its alternatives. */
function answersTo(item: ActionItem, key: string): boolean {
  const keys = [item.key, ...(item.altKeys ?? [])];
  return keys.some((itemKey) => itemKey?.toLowerCase() === key);
}

/** An action that changes a counter of a card: a token or status item's, as the keys send it. */
type CounterAction = Action & { kind: CounterKind };

/** The action of a token or status item, which adds one; null for any other item. */
function counterAction(item: ActionItem): CounterAction | null {
  const result = item.run?.();
  if (!result || !('kind' in result)) {
    return null;
  }
  const { kind } = result;
  return kind === 'token' || kind === 'status' ? { ...result, kind } : null;
}

/**
 * Shift + a token or status key takes one off: the item's own action, the
 * other way. Nothing is sent when the card has none, rather than a change
 * that changes nothing.
 */
function removeOne(adds: CounterAction, table: KeyTable): boolean {
  const card = table.view.table?.cards.find((c) => c.id === adds.card);
  const counts = card && countersOf(card, adds.kind);
  if ((counts?.[adds.name ?? ''] ?? 0) > 0) {
    table.act({ ...adds, delta: -1 });
  }
  return true;
}

/**
 * P plays a card of the hand to the first free slot of its deck's row, X or
 * Backspace discards it, as they discard a card in play.
 */
function handKey(key: string, id: string, table: KeyTable): boolean {
  switch (key) {
    case 'p': {
      const seat = handSeatOf(id, table.view);
      const card = table.view.table?.cards.find((c) => c.id === id);
      if (seat === undefined || !table.view.table || !card) {
        return false;
      }
      const { x, y } = freeSlot(card, table.view.table, seat, table.sizeOf);
      table.act({ kind: 'play', card: id, x, y });
      return true;
    }
    case 'x':
    case 'backspace': {
      // A side deck's card without a discard pile has nowhere to be discarded to.
      const card = table.view.table?.cards.find((c) => c.id === id);
      if (!card || discardPileOf(card, table.view.table?.piles ?? []) === null) {
        return false;
      }
      table.act({ kind: 'discard', card: id });
      return true;
    }
    default:
      return false;
  }
}

/** The own seat whose hand holds the card, if any. */
function handSeatOf(id: string, view: View): number | undefined {
  return ownSeats(view).find((seat) => view.table?.hands?.[areaOf(seat)]?.includes(id));
}

/**
 * The free slot for a played card, from the hand or from a pile box: the
 * first spot of the player's row, from its deck on, where the card, as wide as
 * it lands, keeps 50 free on each side. The spots tried are the deck's x and
 * the spot 50 past the right edge of each thing in the row, taken up to the
 * grid, from left to right: the card lands right after the last card or pile
 * of the row, or in the first hole wide enough before it. On a fresh row, the
 * deck, the discard pile, any side piles and the identity lie closer together
 * than that, so the card lands after the identity. The row is the height of
 * the player's deck (the top of the table, from x 0, without one). Every
 * table card and pile reaching into the row is in the way, and so is every
 * marker.
 */
export function freeSlot(
  played: CardView,
  table: Pick<TableView, 'cards' | 'piles' | 'firstPlayer' | 'active'>,
  seat: number,
  sizeOf: (card: CardView) => Size,
): { x: number; y: number } {
  const { cards, piles, firstPlayer, active } = table;
  // Played from the hand or explicitly from a pile, a card lands face up (applyPlay, internal/game/apply.go).
  const width = cardBox(sizeOf(played), { faceDown: false }).w;
  const deck = piles.find((pile) => pile.kind === 'deck' && pile.owner === seat);
  const start = deck?.x ?? 0;
  const y = deck?.y ?? 0;
  const markers = [
    { id: 'firstPlayer', ...firstPlayer, ...FIRST_PLAYER_BOX },
    ...(active ? [{ id: 'active', ...active, ...ACTIVE_COUNTER_BOX }] : []),
  ];
  const items = [...footprints(cards, piles, sizeOf), ...markers].filter(
    (item) => item.y < y + SLOT_ROW_HEIGHT && visualBox(item).bottom > y,
  );
  const isFree = (x: number) =>
    items.every((item) => {
      const box = visualBox(item);
      return box.right <= x - SLOT_GAP || box.left >= x + width + SLOT_GAP;
    });
  const pastItems = items
    .map((item) => Math.ceil((visualBox(item).right + SLOT_GAP) / GRID) * GRID)
    .filter((x) => x >= start);
  const candidates = [start, ...pastItems].sort((a, b) => a - b);
  // The last spot lies past every item, so there is always a free one.
  return { x: candidates.find(isFree) ?? Math.max(...candidates), y };
}
