// Seats at the table (spec 5): a seat is one deck, and a player owns one or
// more of them. Areas name seats ("p1" is seat 1); card and pile owners are
// seats. These helpers tell which seats are the viewer's, which seat an
// action is credited to, and how a seat reads and shows.

import type { TableElement } from './actions';
import type { Area, DeckView, PlayerView, View } from '../lib/types';

/** The seat index of a seat area: "p1" is seat 1. */
export function seatOf(area: Area): number {
  return Number(area.slice(1));
}

/** The area of a seat: seat 1 is "p1". */
export function areaOf(seat: number): Area {
  return `p${seat}`;
}

// The ids of a seat's own piles, as the server names them (internal/game/state.go).

/** The id of the seat's deck: "deck:p1". */
export function deckId(seat: number): string {
  return `deck:${areaOf(seat)}`;
}

/** The id of the seat's discard pile: "disc:p1". */
export function discardId(seat: number): string {
  return `disc:${areaOf(seat)}`;
}

/** The id of the seat's set-aside pile: "aside:p1". */
export function asideId(seat: number): string {
  return `aside:${areaOf(seat)}`;
}

/** The viewer's own seats, in order; none for a spectator or an unknown token. */
export function ownSeats(view: View): number[] {
  if (view.you.role !== 'player') {
    return [];
  }
  return (view.you.areas ?? []).map(seatOf);
}

/**
 * The seat an action on the target is credited to: the owner of the touched
 * card or pile when it is one of the viewer's seats, else the selected deck.
 * Undefined for a spectator, or when no deck is selected.
 */
export function creditedSeat(
  target: TableElement,
  view: View,
  selected: number | null,
): number | undefined {
  return creditedSeatAmong([target], view, selected);
}

/**
 * The seat an action touching several elements is credited to: the owner of
 * the first one that is one of the viewer's seats, else the selected deck. A
 * box action names its card before its pile, so that an own card of a shared
 * pile (victory display, encounter discard) is credited to the card's seat.
 */
export function creditedSeatAmong(
  targets: readonly TableElement[],
  view: View,
  selected: number | null,
): number | undefined {
  const seats = ownSeats(view);
  if (seats.length === 0) {
    return undefined;
  }
  for (const target of targets) {
    const owner = ownerOf(target, view);
    if (owner !== undefined && seats.includes(owner)) {
      return owner;
    }
  }
  return selected ?? undefined;
}

/** The seat owning the card (on the table or in a hand) or the pile, if it is still there. */
function ownerOf(target: TableElement, view: View): number | undefined {
  const table = view.table;
  if (!table) {
    return undefined;
  }
  switch (target.kind) {
    case 'card':
    case 'hand':
      return table.cards.find((card) => card.id === target.id)?.owner;
    case 'pile':
      return table.piles.find((pile) => pile.id === target.id)?.owner;
  }
}

/** The player sitting at the seat, with the deck that seat is, if anyone sits there. */
function seatAt(view: View, seat: number): { player: PlayerView; deck: DeckView } | undefined {
  const area = areaOf(seat);
  for (const player of view.players) {
    const deck = player.decks.find((d) => d.area === area);
    if (deck) {
      return { player, deck };
    }
  }
  return undefined;
}

/** The player sitting at the seat, if anyone sits there. */
export function seatPlayer(view: View, seat: number): PlayerView | undefined {
  return seatAt(view, seat)?.player;
}

/** The deck sitting at the seat, if anyone sits there. */
export function seatDeck(view: View, seat: number): DeckView | undefined {
  return seatAt(view, seat)?.deck;
}

/** The colour of the player owning the seat; null for a seat nobody sits at. */
export function seatColor(view: View, seat: number): number | null {
  return seatPlayer(view, seat)?.color ?? null;
}

/**
 * How the seat reads in the player selector and on its owner frame: the
 * player's name plus the deck's hero whatever the number of decks ("Sam ·
 * Captain Marvel"), the name alone while the deck has no hero. Empty for a
 * seat nobody sits at.
 */
export function seatFullLabel(view: View, seat: number): string {
  const found = seatAt(view, seat);
  if (!found) {
    return '';
  }
  const hero = found.deck.heroName;
  return hero ? `${found.player.name} · ${hero}` : found.player.name;
}

/**
 * The hero of the deck at the seat when its player holds several decks, ""
 * otherwise: the player's name alone tells the deck of a one-deck player
 * (Game.deckHero in narrate.go).
 */
export function seatHero(view: View, seat: number): string {
  const found = seatAt(view, seat);
  if (!found || found.player.decks.length < 2) {
    return '';
  }
  return found.deck.heroName ?? '';
}

/** How an owner reads and shows: its name and the CSS colour of its frame and name. */
interface OwnerLook {
  /** "Villain", the seat's full label ("Sam · Ant-Man"), or "Player 3" for an empty seat. */
  name: string;
  /** The seat's colour, the villain's for the encounter (owner -1), muted for an empty seat. */
  color: string;
}

/**
 * How the owner of a card or pile (a seat, -1 for the encounter) reads and
 * shows, as its owner frame on the table names and colours it.
 */
export function ownerLook(view: View, owner: number): OwnerLook {
  if (owner === -1) {
    return { name: 'Villain', color: 'var(--villain)' };
  }
  const color = seatColor(view, owner);
  if (color === null) {
    return { name: `Player ${owner + 1}`, color: 'var(--muted)' };
  }
  return { name: seatFullLabel(view, owner), color: `var(--p${color + 1})` };
}
