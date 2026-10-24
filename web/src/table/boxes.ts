// What the card boxes (Search, Look at top, Browse, the stage choice) show
// and offer: the pile names, the order of the tiles, and the actions of a
// tile. As in actions.ts, the client mirrors the server's permissions
// (internal/game/action.go) only to hide what would be refused.

import type {
  Action,
  CardView,
  PackFace,
  PileKind,
  PileView,
  Size,
  Stage,
  View,
} from '../lib/types';
import { discardPileOf, homeDeckOf, sideLabel, type TableElement } from './actions';
import { freeSlot } from './keys';
import { isOutOfPlay } from './layout';
import { creditedSeatAmong, ownSeats, seatPlayer } from './seats';

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
  const stage = stageLabel(face);
  return stage ? `${face.name} (${stage})` : face.name;
}

/**
 * How a stage card's face names its stage: a main scheme by its own number
 * ("1A"), any other stage card as "stage I". Undefined for a face without a stage.
 */
export function stageLabel(face: PackFace): string | undefined {
  if (!face.stage) {
    return undefined;
  }
  return face.type === 'main_scheme' ? face.stage : `stage ${face.stage}`;
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

/** An action of a tile, which its context menu lists (contextItems.ts). */
export interface TileAction {
  /** 'draw', 'play', 'discard', 'bottom' or 'shuffle'. */
  id: string;
  label: string;
  /** Built when chosen: Play looks for the first free slot then. */
  run: () => Action;
}

/** What the tile actions need to know about the table. */
export interface TileContext {
  view: View;
  /** The viewer's selected deck: a card of a pile that is not one of theirs is played to its row. */
  selected: number;
  sizeOf: (card: CardView) => Size;
}

/**
 * The name of a pile from the viewer's side, as the box titles say it: "Your
 * deck", "Sam's discard", "Your Invocation deck", "Sam's Invocation discard".
 */
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
    case 'sideDeck':
      return `${ownerOf(pile, view)} ${sideLabel(pile)} deck`;
    case 'sideDiscard':
      return `${ownerOf(pile, view)} ${sideLabel(pile)} discard`;
    case 'aside':
      // The scenario's own set-aside cards belong to nobody.
      return pile.owner === -1 ? 'Set-aside cards' : `${ownerOf(pile, view)} set-aside cards`;
  }
}

/** "Your" for a pile of one of the viewer's own decks, else "<name>'s". */
function ownerOf(pile: PileView, view: View): string {
  if (ownSeats(view).includes(pile.owner)) {
    return 'Your';
  }
  return `${seatPlayer(view, pile.owner)?.name ?? 'Another player'}'s`;
}

/**
 * Whether the viewer may shuffle a set-aside pile into the encounter deck from
 * its box: the scenario's own, or that of one of their own seats (`seats`),
 * once it holds cards.
 */
export function canShuffleIn(pile: PileView, seats: readonly number[]): boolean {
  const allowed = pile.owner === -1 || seats.includes(pile.owner);
  return pile.kind === 'aside' && allowed && pile.count > 0;
}

/** Whether the pile is a deck the boxes search with a choice to shuffle on closing. */
export function isDeck(pile: PileView): boolean {
  return pile.kind === 'deck' || pile.kind === 'encounter' || pile.kind === 'sideDeck';
}

/** A player's decks and discard piles, whose cards their owner draws from a box. */
const PLAYER_PILES: readonly PileKind[] = ['deck', 'discard', 'sideDeck', 'sideDiscard'];

/**
 * The actions of a card in a pile box, in menu order (the prototype's
 * renderDeckView): Draw from an own deck or discard pile (side ones too), Play to the first
 * free slot of the credited deck's row (creditedSeat), face up even out of a
 * deck that hides its cards, Discard, Put at the bottom of the deck, and
 * Shuffle into deck for the out-of-play and discard piles. Another player's
 * decks or set-aside cards cannot be touched.
 */
export function tileActions(card: CardView, pile: PileView, context: TileContext): TileAction[] {
  const seats = ownSeats(context.view);
  const own = seats.includes(pile.owner);
  const shared = pile.owner === -1;
  const outOfPlay = isOutOfPlay(pile);
  const discardPile =
    pile.kind === 'discard' || pile.kind === 'encounterDiscard' || pile.kind === 'sideDiscard';
  const privatePile = pile.kind === 'deck' || pile.kind === 'sideDeck' || pile.kind === 'aside';
  if (privatePile && !own && !shared) {
    return [];
  }

  const actions: TileAction[] = [];
  if (own && PLAYER_PILES.includes(pile.kind)) {
    actions.push({ id: 'draw', label: 'Draw', run: () => ({ kind: 'toHand', card: card.id }) });
  }
  actions.push({ id: 'play', label: 'Play', run: () => playAction(card, pile, context) });

  // A card in a discard pile is discarded already; a side deck's card without one has nowhere to go.
  const piles = context.view.table?.piles ?? [];
  if (!discardPile && discardPileOf(card, piles) !== null) {
    actions.push({
      id: 'discard',
      label: 'Discard',
      run: () => ({ kind: 'discard', card: card.id }),
    });
  }

  // A deck's card goes under its own deck; an out-of-play card under its home
  // deck, and an out-of-play or discarded card can be shuffled into it. Only
  // its owner (or anyone, for the encounter deck) may touch that home deck.
  const canGoHome = card.owner === -1 || seats.includes(card.owner);
  const hasHome = piles.some((p) => p.id === homeDeckOf(card));
  if (isDeck(pile) || (outOfPlay && canGoHome && hasHome)) {
    actions.push({
      id: 'bottom',
      label: 'Put at the bottom of the deck',
      run: () => ({ kind: 'toDeck', card: card.id, where: 'bottom' }),
    });
  }
  if ((outOfPlay || discardPile) && canGoHome && hasHome) {
    actions.push({
      id: 'shuffle',
      label: 'Shuffle into deck',
      run: () => ({ kind: 'toDeck', card: card.id, where: 'shuffle' }),
    });
  }
  return actions;
}

function playAction(card: CardView, pile: PileView, context: TileContext): Action {
  const { view, selected, sizeOf } = context;
  // The card first: an own card of a shared pile goes to its own deck's row.
  const touched: TableElement[] = [
    { kind: 'card', id: card.id },
    { kind: 'pile', id: pile.id },
  ];
  const seat = creditedSeatAmong(touched, view, selected) ?? selected;
  const { x, y } = freeSlot(
    view.table?.cards ?? [],
    view.table?.piles ?? [],
    seat,
    sizeOf,
    view.table?.firstPlayer,
  );
  // An explicit Play shows the card, even out of a deck that hides its cards; a drag lands it face down.
  return { kind: 'play', card: card.id, x, y, faceUp: true };
}
