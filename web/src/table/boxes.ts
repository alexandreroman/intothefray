// What the card boxes (Search, Look at top, Browse, the stage choice) show
// and offer: the pile names, the order of the tiles, and the actions of a
// tile. As in actions.ts, the client mirrors the server's permissions
// (internal/game/action.go) only to hide what would be refused.

import type { Action, CardView, PackFace, PileView, Size, Stage, View } from '../lib/types';
import { homeDeckOf } from './actions';
import type { IconName } from './Icons.svelte';
import { freeSlot } from './keys';

/** A box opened by the client alone: browsing a public pile, or choosing a stage card. */
export type LocalBox = { kind: 'browse'; pile: string } | { kind: 'stage'; stage: string };

/**
 * What a box shows, as the current view has it: the cards of a pile, top
 * first (a Look or a Search the server sent, or a public pile browsed), or
 * the cards of a stage. The box lists the cards of a stage and of an
 * out-of-play pile by card number instead (compareCardNumbers).
 */
export type ShownBox =
  | { kind: 'pile'; pile: PileView; mode: 'top' | 'search' | 'browse'; cards: readonly string[] }
  | { kind: 'stage'; stage: Stage };

/** How the stage choice names a face, as the history does: "Rhino (stage II)", "The Break-In! (1A)". */
export function stageFaceName(face: PackFace | undefined, index: number): string {
  if (!face) {
    return `Face ${index + 1}`;
  }
  if (!face.stage) {
    return face.name;
  }
  return face.type === 'main_scheme'
    ? `${face.name} (${face.stage})`
    : `${face.name} (stage ${face.stage})`;
}

/**
 * Orders cards by card number, their code: codes are zero-padded, so their text order is the
 * numeric one, "01043a" before "01043b". Cards without a code (face down) go last; cards of
 * one code by id, so that their order does not change with the pile's.
 */
export function compareCardNumbers(a: CardView, b: CardView): number {
  if (a.code === b.code) {
    return compareText(a.id, b.id);
  }
  if (a.code === undefined) {
    return 1;
  }
  if (b.code === undefined) {
    return -1;
  }
  return compareText(a.code, b.code);
}

// Plain code unit order: localeCompare could rank digits and letters otherwise.
function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** An action of a tile's floating bar. */
export interface TileAction {
  /** 'draw', 'play', 'discard', 'bottom' or 'shuffle'. */
  id: string;
  label: string;
  /** Drawn as an icon button, its label in the tooltip. */
  icon?: IconName;
  /** Built when clicked: Play looks for the first free slot then. */
  run: () => Action;
}

/** What the tile actions need to know about the table. */
export interface TileContext {
  view: View;
  /** The viewer's seat. */
  seat: number;
  sizeOf: (card: CardView) => Size;
}

/** The name of a pile from the viewer's side, as the box titles say it: "Your deck", "Sam's discard". */
export function pileLabel(pile: PileView, view: View): string {
  switch (pile.kind) {
    case 'encounter':
      return 'Encounter deck';
    case 'encounterDiscard':
      return 'Encounter discard';
    case 'victory':
      return 'Victory display';
    case 'deck':
      return `${ownerOf(pile, view)} deck`;
    case 'discard':
      return `${ownerOf(pile, view)} discard`;
    case 'aside':
      // The scenario's own set-aside cards belong to nobody.
      return pile.owner === -1 ? 'Set-aside cards' : `${ownerOf(pile, view)} set-aside cards`;
  }
}

/** "Your" for the viewer's own pile, else "<name>'s". */
function ownerOf(pile: PileView, view: View): string {
  if (view.you.role === 'player' && view.you.area === `p${pile.owner}`) {
    return 'Your';
  }
  return `${view.players[pile.owner]?.name ?? 'Another player'}'s`;
}

/**
 * Whether the viewer may shuffle a set-aside pile into the encounter deck from
 * its box: the scenario's own, or their own, once it holds cards.
 */
export function canShuffleIn(pile: PileView, seat: number): boolean {
  return pile.kind === 'aside' && (pile.owner === -1 || pile.owner === seat) && pile.count > 0;
}

/** Whether the pile is a deck the boxes search with a choice to shuffle on closing. */
export function isDeck(pile: PileView): boolean {
  return pile.kind === 'deck' || pile.kind === 'encounter';
}

/**
 * The actions of a card in a pile box, in bar order (the prototype's
 * renderDeckView): Draw from the own deck or discard pile, Play to the first
 * free slot of the viewer's row, Discard, Put at the bottom of the deck, and
 * Shuffle into its deck for the out-of-play piles. Another player's deck or
 * set-aside cards cannot be touched.
 */
export function tileActions(card: CardView, pile: PileView, context: TileContext): TileAction[] {
  const own = pile.owner === context.seat;
  const shared = pile.owner === -1;
  const outOfPlay = pile.kind === 'victory' || pile.kind === 'aside';
  if ((pile.kind === 'deck' || pile.kind === 'aside') && !own && !shared) {
    return [];
  }

  const actions: TileAction[] = [];
  if (own && (pile.kind === 'deck' || pile.kind === 'discard')) {
    actions.push({ id: 'draw', label: 'Draw', run: () => ({ kind: 'toHand', card: card.id }) });
  }
  actions.push({ id: 'play', label: 'Play', run: () => playAction(card, context) });

  // A card in a discard pile is discarded already.
  if (pile.kind !== 'discard' && pile.kind !== 'encounterDiscard') {
    actions.push({
      id: 'discard',
      label: 'Discard',
      icon: 'discard',
      run: () => ({ kind: 'discard', card: card.id }),
    });
  }

  // A deck's card goes under its own deck; an out-of-play card under its home
  // deck, which only its owner (or anyone, for the encounter deck) may touch.
  const canGoHome = card.owner === -1 || card.owner === context.seat;
  const hasHome = context.view.table?.piles.some((p) => p.id === homeDeckOf(card)) ?? false;
  if (isDeck(pile) || (outOfPlay && canGoHome && hasHome)) {
    actions.push({
      id: 'bottom',
      label: 'Put at the bottom of the deck',
      icon: 'bottom',
      run: () => ({ kind: 'toDeck', card: card.id, where: 'bottom' }),
    });
  }
  if (outOfPlay && canGoHome && hasHome) {
    actions.push({
      id: 'shuffle',
      label: 'Shuffle into its deck',
      icon: 'shuffle',
      run: () => ({ kind: 'toDeck', card: card.id, where: 'shuffle' }),
    });
  }
  return actions;
}

function playAction(card: CardView, context: TileContext): Action {
  const table = context.view.table;
  const { x, y } = freeSlot(table?.cards ?? [], table?.piles ?? [], context.seat, context.sizeOf);
  return { kind: 'play', card: card.id, x, y };
}
