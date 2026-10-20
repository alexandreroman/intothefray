// The table's keyboard shortcuts (spec 5.10). One keydown listener on the
// window acts on the element under the pointer, with the items its action bar
// offers; the arrow, which has no button, and the hand cards, which have no
// bar, get their own keys here.

import { modal } from '../components/modal.svelte';
import type { Action, CardView, PileView, Size, View } from '../lib/types';
import { discardPileOf, type ActionItem } from './actions';
import { interaction } from './interaction.svelte';
import { footprints, visualBox } from './layout';
import { ownSeats } from './seats';
import { ZOOM_STEP } from './zoom';

// The free slot of a player's row (ruling P5b-R5): from x 760, where the
// cards in play start past the deck, the discard pile, the identity and the
// main scheme (internal/game/setup.go), in 220 steps, a 140-wide card with 40
// free on each side, as high as a portrait card.
const SLOT_FIRST_X = 760;
const SLOT_STEP = 220;
const SLOT_CARD = { w: 140, h: 196 };
const SLOT_MARGIN = 40;

// Shift + these arrows step through the heroes of the player selector, or in "All" the viewer's decks.
const HERO_STEPS: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  ArrowRight: 1,
};

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
  // Outside a field, Backspace discards: it never takes the browser back in its history.
  if (event.key === 'Backspace' && !isTyping(event.target)) {
    event.preventDefault();
  }
  if (modal.open) {
    return;
  }
  // Escape lets go of the table, even from a field, as in the prototype.
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

/** P plays a card of the hand to the first free slot of its deck's row, Backspace discards it. */
function handKey(key: string, id: string, table: KeyTable): boolean {
  switch (key) {
    case 'p': {
      const seat = handSeatOf(id, table.view);
      if (seat === undefined || !table.view.table) {
        return false;
      }
      const { cards, piles } = table.view.table;
      const { x, y } = freeSlot(cards, piles, seat, table.sizeOf);
      table.act({ kind: 'play', card: id, x, y });
      return true;
    }
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
  return ownSeats(view).find((seat) => view.table?.hands?.[`p${seat}`]?.includes(id));
}

/**
 * The free slot for a card played from the hand: the first spot of the
 * player's row, from x 760 in steps of 220, where a 140-wide card keeps 40
 * free on each side. The row is the height of the player's deck (the top of
 * the table without one). Every table card and pile reaching into the row is
 * in the way.
 */
export function freeSlot(
  cards: CardView[],
  piles: PileView[],
  seat: number,
  sizeOf: (card: CardView) => Size,
): { x: number; y: number } {
  const deck = piles.find((pile) => pile.kind === 'deck' && pile.owner === seat);
  const y = deck?.y ?? 0;
  const items = footprints(cards, piles, sizeOf).filter(
    (item) => item.y < y + SLOT_CARD.h && visualBox(item).bottom > y,
  );
  // Ends: every item is passed after a finite number of steps.
  for (let x = SLOT_FIRST_X; ; x += SLOT_STEP) {
    const blocked = items.some(
      (item) => item.x < x + SLOT_CARD.w + SLOT_MARGIN && visualBox(item).right > x - SLOT_MARGIN,
    );
    if (!blocked) {
      return { x, y };
    }
  }
}
