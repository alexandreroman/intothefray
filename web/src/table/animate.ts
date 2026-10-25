// What changed on the table between two views, as the animations to play:
// cards that moved, changed, turned in, flew to a pile or entered the table
// from one, cards drawn into a hand or taken into one the viewer does not
// see, piles that were shuffled, and the markers (the first player token,
// the active counter) moved. Pure: the table plays the list
// (motion.svelte.ts).

import {
  MARKERS,
  markerPoint,
  type CardView,
  type LogView,
  type MarkerName,
  type PileView,
  type PlayerView,
  type Point,
  type TableView,
  type View,
  type Zone,
} from '../lib/types';
import { discardPileOf, homeDeckOf, isScenarioDeckId, isSideDeckId, sideLabel } from './actions';
import { stackOf } from './drag';
import { isHidden } from './face';
import type { Landing } from './interaction.svelte';
import { ownSeats, seatHero, seatOf, seatPlayer } from './seats';

/** Where a card lies in a view: its zone, and its spot when it is on the table. */
interface Spot {
  zone: Zone;
  x: number;
  y: number;
}

export type Anim =
  /** Moved on the table or between it and a hand; was is the id it had before, when it got a new one (freshIdOf). */
  | { kind: 'move'; id: string; from: Spot; to: Spot; was?: string }
  | { kind: 'glow'; id: string; color: number }
  | { kind: 'turnIn'; id: string }
  /**
   * Turned over on the table: flipped, another face shown, or a hidden card come face up; or
   * taken face down off the table into the viewer's hand, where it turns face up.
   */
  | { kind: 'flip'; id: string }
  | { kind: 'shuffle'; pile: string }
  /** A side deck showing its top card turns a new one face up on it (revealedTops). */
  | { kind: 'reveal'; pile: string }
  /**
   * Gone to a pile: out of the table or the hand, or out of another pile
   * (fromPile). It turns over on the way when it lands on another side than
   * it left on (turnOf). The viewer's own drop (dropped) flies from where it
   * was let go.
   */
  | {
      kind: 'fly';
      id: string;
      toPile: string;
      fromPile?: string;
      turns?: Turn;
      dropped?: true;
    }
  /** Come onto the table out of a pile. */
  | { kind: 'enter'; id: string; fromPile: string }
  /** Taken from the table into a hand the viewer does not see. */
  | { kind: 'away'; id: string }
  /** Put on a pile out of a hand the viewer does not see: the card when the pile shows it. */
  | { kind: 'arrive'; pile: string; card?: string }
  /** Put at the bottom of a deck that does not show it: it flies there and slips under (slidUnder). */
  | { kind: 'under'; id: string; toPile: string }
  /**
   * Drawn into one of the viewer's hands out of a pile: face up all along when
   * the pile showed it, else coming out of the pile on its back.
   */
  | { kind: 'draw'; id: string; fromPile: string; faceUp: boolean }
  /**
   * Drawn by another seat, into a hand the viewer does not see: the card when
   * the pile showed it, none for a pile that does not.
   */
  | { kind: 'drawAway'; pile: string; card?: string }
  /** A marker (the first player token, the active counter) moved to another spot of the table. */
  | { kind: 'marker'; name: MarkerName; from: Point; to: Point };

/**
 * How a card flying to a pile turns over on its way: face up ('up'), leaving
 * on its back, or face down ('down'), leaving on its face.
 */
export type Turn = 'up' | 'down';

type Fly = Extract<Anim, { kind: 'fly' }>;

/**
 * The viewer's own drop waiting for the view that shows it (interaction.landing):
 * the card it moved, and every table or hand card that moved with it (a group's).
 */
export type OwnDrop = Pick<Landing, 'element' | 'card' | 'lifted'>;

/**
 * Views further apart than this are not animated: after a reconnection, the
 * table jumps to its new state instead of replaying everything at once.
 */
export const MAX_APART_MS = 2000;

/** At most this many cards fly from one pile to another in one view (a shuffle back): the top ones. */
const MAX_PILE_FLIGHTS = 5;

const SHUFFLED = 'shuffled ';
// "put Web-Shooter at the bottom of their deck", "put 3 cards at the bottom of the encounter deck".
const PUT = 'put ';
const AT_THE_BOTTOM = ' at the bottom of ';
// The line of an undo: 'undid “shuffled their deck”'.
const UNDID = 'undid ';

/**
 * The animations that take the table from prev to next. ownDrop is what the
 * viewer has just dropped, a card with its stack, and the other cards of a
 * group with it: on the table or in the hand, it already lies where it went;
 * onto a pile, each of its cards flies there from where it was let go. apart
 * is how long the viewer went without a live view between the two, in ms
 * (GameSession.viewGap).
 */
export function diffViews(prev: View, next: View, ownDrop?: OwnDrop, apart = 0): Anim[] {
  const after = next.table;
  if (!prev.table || !after || apart > MAX_APART_MS) {
    return [];
  }
  // The card that got a new id is followed under that id from the start.
  const fresh = freshIdOf(prev.table, after);
  const before = fresh ? withFreshId(prev.table, fresh) : prev.table;

  const droppedCard = ownDrop?.card;
  const dropped = new Set(ownDrop?.lifted);
  if (droppedCard) {
    // Not always lifted: a card played from a pile, or a hand reordered, lifts nothing.
    for (const id of stackOf(droppedCard, after.cards)) {
      dropped.add(id);
    }
  }
  if (fresh && dropped.has(fresh.was)) {
    dropped.add(fresh.id);
  }
  const previous = new Map(before.cards.map((card) => [card.id, card]));
  const lines = changedLines(prev.log, next.log);
  // The glow takes the colour of whoever wrote the latest line; system lines have none.
  const actor = lines.at(-1)?.color ?? -1;
  const turned = turnedIn(before, after);
  const shrunk = shrunkHiddenPiles(before, after);
  // The viewer's own draw or deal, a deck dragged onto the hand or the table, already lies there.
  const draggedPile = ownDrop?.element.kind === 'pile' ? ownDrop.element.id : null;
  const tally = tallyOf(prev, next, before, after);
  const unders = slidUnder(lines, next, before, after);
  for (const under of unders) {
    takeOne(tally.growth, under.toPile);
  }

  const anims: Anim[] = [];
  for (const card of after.cards) {
    const was = previous.get(card.id);
    // A card never listed before is new in the view (arrivals).
    if (!was) {
      continue;
    }
    const travel = travelOf(was, card, before, after);
    // The viewer's own drop already lies where it went on the table or in the hand.
    if (dropped.has(card.id)) {
      if (travel?.kind === 'fly') {
        anims.push({ ...travel, dropped: true });
      }
      continue;
    }
    if (travel?.kind === 'move' && card.id === fresh?.id) {
      // The screen still shows it under its old id.
      travel.was = fresh.was;
    }
    if (travel) {
      anims.push(travel);
    }
    const turns = turned.has(card.id);
    if (turns) {
      anims.push({ kind: 'turnIn', id: card.id });
    } else if (isTurnedOver(was, card, before)) {
      anims.push({ kind: 'flip', id: card.id });
    }
    const changed = was.zone === 'table' && card.zone === 'table' && hasChanged(was, card);
    if (actor >= 0 && (turns || changed)) {
      anims.push({ kind: 'glow', id: card.id, color: actor });
    }
  }
  const unslid = new Set(unders.map((under) => under.id));
  anims.push(...departures(before, after, dropped, unslid, draggedPile, tally));
  anims.push(...arrivals(before, after, dropped, draggedPile, shrunk, tally));
  anims.push(...unseenArrivals(after, tally));
  for (const draw of drawsOf(before, after, shrunk, ownSeats(next))) {
    if (!dropped.has(draw.id) && draw.fromPile !== draggedPile) {
      anims.push(draw);
    }
  }
  anims.push(...drawnAway(tally.rises, before, after));
  for (const pile of shuffledPiles(lines, next, after.piles)) {
    anims.push({ kind: 'shuffle', pile });
  }
  anims.push(...unders);
  // A card that flies onto a pile turns over on its way there, if it does.
  const landing = new Set(dropped);
  for (const anim of anims) {
    if (anim.kind === 'fly') {
      landing.add(anim.id);
    }
  }
  for (const pile of revealedTops(before, after, landing)) {
    anims.push({ kind: 'reveal', pile });
  }
  for (const name of MARKERS) {
    const was = markerPoint(before, name);
    const now = markerPoint(after, name);
    const moved = was && now && (was.x !== now.x || was.y !== now.y);
    const own = ownDrop?.element.kind === 'marker' && ownDrop.element.name === name;
    if (moved && !own) {
      anims.push({ kind: 'marker', name, from: was, to: now });
    }
  }
  return anims;
}

/** The lines already shown in prev whose text or time changed in next: a later change merged into them. */
export function mergedLines(prev: readonly LogView[], next: readonly LogView[]): number[] {
  const merged: number[] = [];
  const shared = Math.min(prev.length, next.length);
  for (let i = 0; i < shared; i++) {
    const before = prev[i];
    const after = next[i];
    if (before && after && (before.text !== after.text || before.at !== after.at)) {
      merged.push(i);
    }
  }
  return merged;
}

/** The lines of next that prev did not show: added, or merged into. */
function changedLines(prev: readonly LogView[], next: readonly LogView[]): LogView[] {
  const merged = new Set(mergedLines(prev, next));
  return next.filter((_, i) => i >= prev.length || merged.has(i));
}

/** A card the server gave a new id: the id it had, and the one it has. */
interface FreshId {
  was: string;
  id: string;
}

/**
 * The card the server just gave a new id, so that the other players cannot
 * follow it (freshID in internal/game/ids.go), when the viewer can: a
 * face-down table card taken into the viewer's hand, or that move undone.
 * Exactly one card left the view and one card came into it, the one from the
 * table face down and the other in the hand, or the other way round, with no
 * hidden pile losing a card: they are the same card. Null for any other
 * change.
 */
function freshIdOf(before: TableView, after: TableView): FreshId | null {
  const previous = new Set(before.cards.map((card) => card.id));
  const current = new Set(after.cards.map((card) => card.id));
  const gone = before.cards.filter((card) => !current.has(card.id));
  const come = after.cards.filter((card) => !previous.has(card.id));
  const was = gone[0];
  const card = come[0];
  if (gone.length !== 1 || come.length !== 1 || !was || !card || was.owner !== card.owner) {
    return null;
  }
  if (shrunkHiddenPiles(before, after).length > 0) {
    return null;
  }
  const faceDownOnTable = (c: CardView) => c.zone === 'table' && !!c.faceDown;
  const takenIntoHand = faceDownOnTable(was) && card.zone === 'hand';
  const putBackOnTable = was.zone === 'hand' && faceDownOnTable(card);
  return takenIntoHand || putBackOnTable ? { was: was.id, id: card.id } : null;
}

/** A table with the card that got a new id listed under that id. */
function withFreshId(table: TableView, fresh: FreshId): TableView {
  const cards = table.cards.map((card) =>
    card.id === fresh.was ? { ...card, id: fresh.id } : card,
  );
  return { ...table, cards };
}

/** Drawn where its place can be measured: on the table, or in the viewer's hand. */
function isPlaced(card: CardView): boolean {
  return card.zone === 'table' || card.zone === 'hand';
}

function spotOf(card: CardView): Spot {
  return { zone: card.zone, x: card.x, y: card.y };
}

/** A card that went somewhere else on the table or the hand, or onto a pile that shows its cards. */
function travelOf(was: CardView, card: CardView, before: TableView, after: TableView): Anim | null {
  if (!isPlaced(was)) {
    return null;
  }
  if (isPlaced(card)) {
    const moved = was.zone !== card.zone || was.x !== card.x || was.y !== card.y;
    return moved ? { kind: 'move', id: card.id, from: spotOf(was), to: spotOf(card) } : null;
  }
  const pile = after.piles.find((p) => p.cards?.includes(card.id));
  return pile ? flyOf(card.id, pile.id, undefined, before, after) : null;
}

/**
 * A card's flight to a pile, from another pile when fromPile is given,
 * turning over on the way when it lands on another side (turnOf).
 */
function flyOf(
  id: string,
  toPile: string,
  fromPile: string | undefined,
  before: TableView,
  after: TableView,
): Fly {
  const fly: Fly = { kind: 'fly', id, toPile };
  if (fromPile !== undefined) {
    fly.fromPile = fromPile;
  }
  const turns = turnOf(id, before, after);
  if (turns) {
    fly.turns = turns;
  }
  return fly;
}

/**
 * How a card flying to a pile turns over: it leaves on its face when the
 * viewer saw it where it left, and lands on its face when its new pile shows
 * it (showsFace); else on its back. None when both sides are the same.
 */
function turnOf(id: string, before: TableView, after: TableView): Turn | undefined {
  const leavesFaceUp = showsFace(id, before);
  const landsFaceUp = showsFace(id, after);
  if (leavesFaceUp === landsFaceUp) {
    return undefined;
  }
  return landsFaceUp ? 'up' : 'down';
}

/**
 * A table card that shows another side: flipped face down or face up, turned
 * to another face, or come face up out of a pile that does not show its
 * cards (a deck the viewer was looking through). A card that lay face down on
 * the table shows its face once in the viewer's hand: it turns over there too.
 */
function isTurnedOver(was: CardView, card: CardView, before: TableView): boolean {
  if (card.zone === 'hand') {
    return was.zone === 'table' && !!was.faceDown && !isHidden(card);
  }
  if (card.zone !== 'table') {
    return false;
  }
  if (was.zone === 'table') {
    return was.face !== card.face || !!was.faceDown !== !!card.faceDown;
  }
  const wasPublic = before.piles.some((pile) => pile.cards?.includes(was.id));
  return was.zone === 'pile' && !wasPublic && !isHidden(card);
}

/** The piles that do not show their cards (a deck, the encounter deck) and lost some, as they are now. */
function shrunkHiddenPiles(before: TableView, after: TableView): PileView[] {
  return shrunkPiles(before, after)
    .map(({ pile }) => pile)
    .filter((pile) => pile.cards === undefined);
}

/** A pile that lost cards: as it was, and as it is now. */
interface Shrunk {
  was: PileView;
  pile: PileView;
}

function shrunkPiles(before: TableView, after: TableView): Shrunk[] {
  return after.piles.flatMap((pile) => {
    const was = before.piles.find((p) => p.id === pile.id);
    return was && pile.count < was.count ? [{ was, pile }] : [];
  });
}

type Draw = Extract<Anim, { kind: 'draw' }>;

/**
 * The cards come into the viewer's hands out of a pile, in hand order. A
 * card on the table before moves instead, and one passed from another hand
 * comes out of no pile. A hidden pile of another seat that shrank is that
 * seat's draw (drawnAway), never the viewer's.
 */
function drawsOf(before: TableView, after: TableView, shrunk: PileView[], own: number[]): Draw[] {
  const ours = shrunk.filter((pile) => own.includes(pile.owner) || pile.owner === -1);
  const previous = new Map(before.cards.map((card) => [card.id, card]));
  const current = new Map(after.cards.map((card) => [card.id, card]));
  const draws: Draw[] = [];
  for (const id of Object.values(after.hands ?? {}).flatMap((hand) => hand ?? [])) {
    const card = current.get(id);
    const was = previous.get(id);
    if (!card || (was && was.zone !== 'pile')) {
      continue;
    }
    const origin = was ? listedOrigin(was, before) : hiddenOrigin(card, ours);
    if (origin) {
      draws.push({ kind: 'draw', id, ...origin });
    }
  }
  return draws;
}

/**
 * The pile a card listed in a pile came from: one that showed it, or the
 * deck the viewer was looking through, which showed it to the viewer only.
 */
function listedOrigin(was: CardView, before: TableView): Pick<Draw, 'fromPile' | 'faceUp'> | null {
  const shown = before.piles.find((pile) => pile.cards?.includes(was.id));
  if (shown) {
    return { fromPile: shown.id, faceUp: true };
  }
  const look = before.private;
  if (look?.cards.includes(was.id)) {
    return { fromPile: look.pile, faceUp: false };
  }
  return null;
}

/**
 * The pile a card never listed came from: a hidden pile that shrank, its
 * owner's deck first, then its owner's other piles, then a pile nobody owns
 * (the encounter deck).
 */
function hiddenOrigin(
  card: CardView,
  shrunk: PileView[],
): Pick<Draw, 'fromPile' | 'faceUp'> | null {
  const pile =
    shrunk.find((p) => p.kind === 'deck' && p.owner === card.owner) ??
    shrunk.find((p) => p.owner === card.owner) ??
    shrunk.find((p) => p.owner === -1);
  return pile ? { fromPile: pile.id, faceUp: false } : null;
}

/**
 * The cards the other seats drew, which the viewer does not see: as many as
 * a seat's hand grew by, less the table cards taken into it (away), taken
 * from that seat's piles that shrank, its deck first, at most what each pile
 * lost. A card out of a pile that showed its cards is named, unless it shows
 * up somewhere else.
 */
function drawnAway(rises: Map<number, number>, before: TableView, after: TableView): Anim[] {
  const listed = new Set(after.cards.map((card) => card.id));
  const shrunk = shrunkPiles(before, after);
  const anims: Anim[] = [];
  for (const [seat, seatRise] of rises) {
    let rise = seatRise;
    if (rise <= 0) {
      continue;
    }
    const piles = shrunk.filter(({ pile }) => pile.owner === seat);
    const decksFirst = [
      ...piles.filter(({ pile }) => pile.kind === 'deck'),
      ...piles.filter(({ pile }) => pile.kind !== 'deck'),
    ];
    for (const { was, pile } of decksFirst) {
      if (rise === 0) {
        break;
      }
      // Top first: a pile lists its cards bottom to top.
      const gone = (was.cards ?? [])
        .filter((id) => !pile.cards?.includes(id) && !listed.has(id))
        .reverse();
      const taken = Math.min(rise, was.count - pile.count);
      for (let i = 0; i < taken; i++) {
        const card = gone[i];
        anims.push(
          card === undefined
            ? { kind: 'drawAway', pile: pile.id }
            : { kind: 'drawAway', pile: pile.id, card },
        );
      }
      rise -= taken;
    }
  }
  return anims;
}

/** How many cards each seat holds in its hand. */
function handCounts(view: View): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of view.players) {
    for (const deck of player.decks) {
      if (deck.area) {
        counts.set(seatOf(deck.area), deck.handCount);
      }
    }
  }
  return counts;
}

/**
 * What a change of view leaves to account for, used up as cards are matched
 * to it: no more cards go into a pile or come out of one than it gained or
 * lost.
 */
interface Tally {
  /** The cards each pile gained. */
  growth: Map<string, number>;
  /** The cards each pile that does not show its cards lost. */
  losses: Map<string, number>;
  /** The cards each hand the viewer does not see gained, by seat. */
  rises: Map<number, number>;
  /** The cards each hand the viewer does not see lost, by seat. */
  falls: Map<number, number>;
  /** The cards that flew from one pile to another (MAX_PILE_FLIGHTS). */
  flown: Map<string, number>;
}

function tallyOf(prev: View, next: View, before: TableView, after: TableView): Tally {
  const growth = new Map<string, number>();
  for (const pile of after.piles) {
    const was = before.piles.find((p) => p.id === pile.id);
    if (was && pile.count > was.count) {
      growth.set(pile.id, pile.count - was.count);
    }
  }
  const losses = new Map<string, number>();
  for (const { was, pile } of shrunkPiles(before, after)) {
    if (pile.cards === undefined) {
      losses.set(pile.id, was.count - pile.count);
    }
  }
  const own = ownSeats(next);
  const counts = handCounts(prev);
  const rises = new Map<number, number>();
  const falls = new Map<number, number>();
  for (const [seat, count] of handCounts(next)) {
    if (own.includes(seat)) {
      continue;
    }
    const change = count - (counts.get(seat) ?? count);
    if (change > 0) {
      rises.set(seat, change);
    } else if (change < 0) {
      falls.set(seat, -change);
    }
  }
  return { growth, losses, rises, falls, flown: new Map() };
}

/** Uses up one of a key's count; false when none is left. */
function takeOne<K>(counts: Map<K, number>, key: K): boolean {
  const left = counts.get(key) ?? 0;
  if (left <= 0) {
    return false;
  }
  counts.set(key, left - 1);
  return true;
}

/** Whether one more card may fly from one pile to another in this view. */
function admitFlight(tally: Tally, from: string, to: string): boolean {
  const pair = `${from} ${to}`;
  const flown = tally.flown.get(pair) ?? 0;
  if (flown >= MAX_PILE_FLIGHTS) {
    return false;
  }
  tally.flown.set(pair, flown + 1);
  return true;
}

/** A card a pile listed: a pile that shows its cards, or the viewer's look through a deck. */
interface Listed {
  id: string;
  pile: string;
}

/** The cards each pile of a table lists, top first, then those of the viewer's look. */
function listedCards(table: TableView): Listed[] {
  const listed: Listed[] = [];
  for (const pile of table.piles) {
    // A pile lists its cards bottom to top.
    for (const id of [...(pile.cards ?? [])].reverse()) {
      listed.push({ id, pile: pile.id });
    }
  }
  const look = table.private;
  if (look) {
    for (const id of look.cards) {
      listed.push({ id, pile: look.pile });
    }
  }
  return listed;
}

/** A card that left a pile or the view: it entered the table, flew to a pile, or went into a hand. */
type Departure = Extract<Anim, { kind: 'enter' | 'fly' | 'away' }>;

/**
 * The cards that left a pile, and those gone from the view: out of the table
 * or the hand, out of a pile that showed them, or out of the viewer's look
 * through a deck. A card come onto the table enters from its pile, and one
 * that another pile lists flies there from it. Placed cards first, then each
 * pile's cards top first, so that the top ones fly when a pile gives many.
 */
function departures(
  before: TableView,
  after: TableView,
  dropped: Set<string>,
  unslid: Set<string>,
  draggedPile: string | null,
  tally: Tally,
): Anim[] {
  const previous = new Map(before.cards.map((card) => [card.id, card]));
  const current = new Map(after.cards.map((card) => [card.id, card]));
  const anims: Anim[] = [];
  // A pile's drag carries its top card only.
  const draggedTop = listedCards(before).find((listed) => listed.pile === draggedPile)?.id;
  // The viewer's own drop, or the top of a pile they dragged, already lies where it went, unless it went
  // to a pile: it flies there from where it was let go.
  const keep = (anim: Departure | null) => {
    if (!anim) {
      return;
    }
    const from = 'fromPile' in anim ? anim.fromPile : undefined;
    const own = dropped.has(anim.id) || (from === draggedPile && anim.id === draggedTop);
    if (!own) {
      anims.push(anim);
    } else if (anim.kind === 'fly') {
      anims.push({ ...anim, dropped: true });
    }
  };
  for (const was of before.cards) {
    if (isPlaced(was) && !current.has(was.id) && !unslid.has(was.id)) {
      keep(vanished(was, undefined, before, after, tally));
    }
  }
  const seen = new Set<string>();
  for (const { id, pile } of listedCards(before)) {
    const was = previous.get(id);
    if (!was || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const card = current.get(id);
    if (!card) {
      keep(vanished(was, pile, before, after, tally));
    } else if (card.zone === 'table') {
      // A card out of the viewer's look also turns over (isTurnedOver).
      keep({ kind: 'enter', id, fromPile: pile });
    } else if (card.zone === 'pile') {
      const to = after.piles.find((p) => p.cards?.includes(id));
      if (to && to.id !== pile && admitFlight(tally, pile, to.id)) {
        keep(flyOf(id, to.id, pile, before, after));
      }
    }
  }
  return anims;
}

/**
 * Where a card gone from the view went: its home deck when that deck grew, a
 * card from a pile flying from it; else, from the table or the hand, the
 * hand of its owner when that hand, which the viewer does not see, grew.
 */
function vanished(
  was: CardView,
  from: string | undefined,
  before: TableView,
  after: TableView,
  tally: Tally,
): Departure | null {
  const home = homeDeckOf(was);
  // Covered on the pile it lies in (a side deck lists its top card only): the pile grew by the card on it.
  if (from === home) {
    return null;
  }
  if (takeOne(tally.growth, home)) {
    if (from !== undefined && !admitFlight(tally, from, home)) {
      return null;
    }
    return flyOf(was.id, home, from, before, after);
  }
  if (from === undefined && takeOne(tally.rises, was.owner)) {
    return { kind: 'away', id: was.id };
  }
  return null;
}

/** Where a card new in the view came from: a pile that does not show its cards, or a hand the viewer does not see. */
type Origin = { pile: string } | { hand: number };

/**
 * A hidden pile that lost cards, as hiddenOrigin picks it, each pile giving at
 * most what it lost; else the hand of the card's owner when that hand lost
 * cards.
 */
function originOf(card: CardView, shrunk: PileView[], tally: Tally): Origin | null {
  const giving = shrunk.filter((pile) => (tally.losses.get(pile.id) ?? 0) > 0);
  const pile = hiddenOrigin(card, giving)?.fromPile;
  if (pile !== undefined) {
    takeOne(tally.losses, pile);
    return { pile };
  }
  return takeOne(tally.falls, card.owner) ? { hand: card.owner } : null;
}

/**
 * The cards new in the view, out of a hidden pile or a hand the viewer does
 * not see (originOf). Onto the table, a card out of a pile enters from it,
 * and one that shows its face turns over as it lands, the viewer's own drop
 * included. Onto a pile that shows it, a card out of a pile flies there on
 * its back, top first, and one out of a hand rises into it. A card drawn into
 * the viewer's hand is a draw (drawsOf). The viewer's own drop of a deck's
 * hidden top card on a pile that shows it flies there from where it was let
 * go, on its back.
 */
function arrivals(
  before: TableView,
  after: TableView,
  dropped: Set<string>,
  draggedPile: string | null,
  shrunk: PileView[],
  tally: Tally,
): Anim[] {
  const previous = new Set(before.cards.map((card) => card.id));
  const current = new Map(after.cards.map((card) => [card.id, card]));
  const isOwnDrop = (id: string, origin: Origin) =>
    dropped.has(id) || ('pile' in origin && origin.pile === draggedPile);
  // The top card of a pile the viewer dragged lands on top of the pile it was dropped on.
  const isDroppedTop = (id: string, origin: Origin, pile: PileView) =>
    isOwnDrop(id, origin) && id === pile.cards?.at(-1);
  const anims: Anim[] = [];
  for (const card of after.cards) {
    const origin =
      previous.has(card.id) || card.zone !== 'table' ? null : originOf(card, shrunk, tally);
    if (!origin) {
      continue;
    }
    if ('pile' in origin && !isOwnDrop(card.id, origin)) {
      anims.push({ kind: 'enter', id: card.id, fromPile: origin.pile });
    }
    if (!isHidden(card)) {
      anims.push({ kind: 'flip', id: card.id });
    }
  }
  for (const pile of after.piles) {
    for (const id of [...(pile.cards ?? [])].reverse()) {
      const card = current.get(id);
      if (!card || previous.has(id)) {
        continue;
      }
      const origin = originOf(card, shrunk, tally);
      if (!origin) {
        continue;
      }
      if (!('pile' in origin)) {
        anims.push({ kind: 'arrive', pile: pile.id, card: id });
      } else if (admitFlight(tally, origin.pile, pile.id)) {
        const fly = flyOf(id, pile.id, origin.pile, before, after);
        anims.push(isDroppedTop(id, origin, pile) ? { ...fly, dropped: true } : fly);
      }
    }
  }
  return anims;
}

/**
 * The cards put on a hidden pile out of a hand the viewer does not see, which
 * nothing names: as many as the pile grew by and the hand lost, at most
 * MAX_PILE_FLIGHTS, out of its owner's hand first.
 */
function unseenArrivals(after: TableView, tally: Tally): Anim[] {
  const anims: Anim[] = [];
  for (const pile of after.piles) {
    if (pile.cards !== undefined) {
      continue;
    }
    let left = Math.min(tally.growth.get(pile.id) ?? 0, MAX_PILE_FLIGHTS);
    for (const seat of [pile.owner, ...tally.falls.keys()]) {
      while (left > 0 && takeOne(tally.falls, seat)) {
        takeOne(tally.growth, pile.id);
        anims.push({ kind: 'arrive', pile: pile.id });
        left--;
      }
    }
  }
  return anims;
}

/**
 * The side decks showing their top card (topFaceUp) whose top is a card
 * nobody saw before: the previous top left, or the deck was shuffled. A card
 * put back on top was seen, face up, where it came from, and one that flies
 * there (landing) turns over on its way, if it does: neither turns there.
 */
function revealedTops(before: TableView, after: TableView, landing: Set<string>): string[] {
  const revealed: string[] = [];
  for (const pile of after.piles) {
    const top = pile.topFaceUp ? pile.cards?.at(-1) : undefined;
    const wasTop = before.piles.find((p) => p.id === pile.id)?.cards?.at(-1);
    if (top === undefined || top === wasTop || landing.has(top) || showsFace(top, before)) {
      continue;
    }
    revealed.push(pile.id);
  }
  return revealed;
}

/**
 * Whether a table shows a card's face: on the table, in a hand, or in a pile
 * that lists it. A card the viewer's look through a deck lists lies in that
 * deck, on its back.
 */
function showsFace(id: string, table: TableView): boolean {
  const card = table.cards.find((c) => c.id === id);
  if (!card || isHidden(card)) {
    return false;
  }
  return isPlaced(card) || table.piles.some((pile) => pile.cards?.includes(id));
}

/** Exhausted or readied, flipped, turned face up, or its tokens, statuses or modifiers changed. */
function hasChanged(was: CardView, card: CardView): boolean {
  return (
    !!was.exhausted !== !!card.exhausted ||
    was.face !== card.face ||
    !!was.faceDown !== !!card.faceDown ||
    !sameCounts(was.tokens, card.tokens) ||
    !sameCounts(was.status, card.status) ||
    !sameCounts(was.mods, card.mods)
  );
}

function sameCounts(a: Record<string, number> = {}, b: Record<string, number> = {}): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...names].every((name) => (a[name] ?? 0) === (b[name] ?? 0));
}

/** The stage cards just chosen: another card of the pile, or the other face of the same card. */
function turnedIn(before: TableView, after: TableView): Set<string> {
  const turned = new Set<string>();
  for (const stage of after.stages) {
    const was = before.stages.find((s) => s.key === stage.key);
    if (!was) {
      continue;
    }
    const swapped = was.current !== stage.current;
    const oldFace = before.cards.find((card) => card.id === stage.current)?.face;
    const newFace = after.cards.find((card) => card.id === stage.current)?.face;
    if (swapped || oldFace !== newFace) {
      turned.add(stage.current);
    }
  }
  return turned;
}

/**
 * The piles that the new lines say were shuffled. A line names the pile
 * last: "shuffled their deck", "shuffled X into the encounter deck". It is
 * matched against every pile's name as the line's writer would say it,
 * the longest name winning ("Big Sam's deck" over "Sam's deck").
 */
function shuffledPiles(lines: LogView[], view: View, piles: PileView[]): string[] {
  const shuffled = new Set<string>();
  for (const line of lines) {
    if (line.undone || !line.text.startsWith(SHUFFLED)) {
      continue;
    }
    const pile = lastNamedPile(line, view, piles);
    if (pile !== null) {
      shuffled.add(pile);
    }
  }
  return [...shuffled];
}

type Under = Extract<Anim, { kind: 'under' }>;

/**
 * The cards just put at the bottom of a deck that does not list them, as
 * they left the view and their home deck grew: those a new line says were
 * "put … at the bottom of" that deck (one card, or a group), and the side
 * cards tucked under a card that left the table, which go to the bottom of a
 * side deck without a discard pile (the line names only that card). Cards of
 * the table or the viewer's hand only. A deck that lists the card (a side deck
 * showing its only card) shows it flying there instead (travelOf). The
 * viewer's own drop slips under too, from where it was dropped.
 */
function slidUnder(lines: LogView[], view: View, before: TableView, after: TableView): Under[] {
  const done = lines.filter((line) => !line.undone);
  const named = new Set<string>();
  for (const line of done) {
    if (line.text.startsWith(PUT) && line.text.includes(AT_THE_BOTTOM)) {
      const pile = lastNamedPile(line, view, after.piles);
      if (pile !== null) {
        named.add(pile);
      }
    }
  }
  // An undo puts cards back where they were: nothing is tucked away then.
  const acted = done.some((line) => !line.text.startsWith(UNDID));
  if (named.size === 0 && !acted) {
    return [];
  }

  const listed = new Set(after.cards.map((card) => card.id));
  const onTable = new Set(after.cards.filter((c) => c.zone === 'table').map((c) => c.id));
  const grew = (id: string) => {
    const was = before.piles.find((pile) => pile.id === id);
    const now = after.piles.find((pile) => pile.id === id);
    return was !== undefined && now !== undefined && now.count > was.count;
  };
  const tuckedAway = (was: CardView) =>
    acted &&
    was.parent !== undefined &&
    !onTable.has(was.parent) &&
    (isSideDeckId(homeDeckOf(was)) || isScenarioDeckId(homeDeckOf(was))) &&
    discardPileOf(was, after.piles) === null;

  const anims: Under[] = [];
  for (const was of before.cards) {
    const home = homeDeckOf(was);
    const gone = isPlaced(was) && !listed.has(was.id) && grew(home);
    if (gone && (named.has(home) || tuckedAway(was))) {
      anims.push({ kind: 'under', id: was.id, toPile: home });
    }
  }
  return anims;
}

/**
 * The pile a history line names last, as the line's writer says it: "shuffled
 * their deck", "put X at the bottom of the encounter deck". The longest name
 * wins ("Big Sam's deck" over "Sam's deck"); null when the line names none.
 */
function lastNamedPile(line: LogView, view: View, piles: PileView[]): string | null {
  const writer = view.players.find((player) => player.color === line.color);
  let best: { pile: string; name: string } | null = null;
  for (const pile of piles) {
    const name = narratedName(pile, writer, view);
    if (line.text.endsWith(` ${name}`) && (!best || name.length > best.name.length)) {
      best = { pile: pile.id, name };
    }
  }
  return best?.pile ?? null;
}

const SHARED_PILE_NAMES: Record<string, string> = {
  enc: 'the encounter deck',
  encd: 'the encounter discard pile',
  vic: 'the victory display',
  saside: 'the set-aside cards',
};

const PILE_NOUNS: Partial<Record<PileView['kind'], string>> = {
  deck: 'deck',
  discard: 'discard pile',
  aside: 'set-aside cards',
};

/**
 * What the history calls a scenario deck or its discard pile (Game.pileName): "Wrecker's encounter deck"
 * for an encounter deck, "the Experimental Weapons deck" for another; undefined for any other pile.
 */
function scenarioName(pile: PileView): string | undefined {
  if (!pile.label || pile.owner !== -1) {
    return undefined;
  }
  switch (pile.kind) {
    case 'encounter':
      return `${pile.label}'s encounter deck`;
    case 'encounterDiscard':
      return `${pile.label}'s encounter discard pile`;
    case 'scenarioDeck':
      return `the ${pile.label} deck`;
    case 'scenarioDiscard':
      return `the ${pile.label} discard pile`;
    default:
      return undefined;
  }
}

/** What the history calls a pile of a player: "deck", "Invocation deck", "Invocation discard pile". */
function pileNoun(pile: PileView): string {
  const label = sideLabel(pile);
  switch (pile.kind) {
    case 'sideDeck':
      return `${label} deck`;
    case 'sideDiscard':
      return `${label} discard pile`;
    default:
      return PILE_NOUNS[pile.kind] ?? 'pile';
  }
}

/**
 * A pile's name in the history, written by the writer (Game.pileName in
 * narrate.go): the piles of any of the writer's seats are "their" piles, and
 * the pile of a player holding several decks adds the deck's hero ("their
 * Spider-Man deck", "Alex's Spider-Man deck").
 */
export function narratedName(pile: PileView, writer: PlayerView | undefined, view: View): string {
  const shared = SHARED_PILE_NAMES[pile.id];
  if (shared) {
    return shared;
  }
  const scenario = scenarioName(pile);
  if (scenario) {
    return scenario;
  }
  let noun = pileNoun(pile);
  const hero = seatHero(view, pile.owner);
  if (hero) {
    noun = `${hero} ${noun}`;
  }
  const owner = seatPlayer(view, pile.owner);
  if (writer !== undefined && owner === writer) {
    return `their ${noun}`;
  }
  return `${owner?.name ?? 'another player'}'s ${noun}`;
}
