// What changed on the table between two views, as the animations to play
// (spec 5.2, 5.5, 5.6): cards that moved, changed, turned in or flew to a
// pile, cards drawn into a hand, piles that were shuffled, and the first
// player token moved. Pure: the table plays the list (motion.svelte.ts).

import type {
  CardView,
  LogView,
  PileView,
  PlayerView,
  Point,
  TableView,
  View,
  Zone,
} from '../lib/types';
import { sideLabel } from './actions';
import { stackOf } from './drag';
import { isHidden } from './face';
import type { Landing } from './interaction.svelte';
import { ownSeats, seatHero, seatOf, seatPlayer } from './seats';

/** Where a card lies in a view: its zone, and its spot when it is on the table. */
export interface Box {
  zone: Zone;
  x: number;
  y: number;
}

export type Anim =
  | { kind: 'move'; id: string; from: Box; to: Box }
  | { kind: 'glow'; id: string; color: number }
  | { kind: 'turnIn'; id: string }
  /** Turned over on the table: flipped, another face shown, or a hidden card come face up. */
  | { kind: 'flip'; id: string }
  | { kind: 'shuffle'; pile: string }
  /** A side deck showing its top card turns a new one face up on it (revealedTops). */
  | { kind: 'reveal'; pile: string }
  | { kind: 'fly'; id: string; toPile: string }
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
  /** The first player token moved to another spot of the table. */
  | { kind: 'firstPlayer'; from: Point; to: Point };

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

const SHUFFLED = 'shuffled ';

/**
 * The animations that take the table from prev to next. ownDrop is what the
 * viewer has just dropped: it already lies where it went, a card with its
 * stack, and the other cards of a group with it. apart is how long the viewer went without a live view between the
 * two, in ms (GameSession.viewGap).
 */
export function diffViews(prev: View, next: View, ownDrop?: OwnDrop, apart = 0): Anim[] {
  const before = prev.table;
  const after = next.table;
  if (!before || !after || apart > MAX_APART_MS) {
    return [];
  }

  const droppedCard = ownDrop?.card;
  const dropped = new Set(ownDrop?.lifted);
  if (droppedCard) {
    // Not always lifted: a card played from a pile, or a hand reordered, lifts nothing.
    for (const id of stackOf(droppedCard, after.cards)) {
      dropped.add(id);
    }
  }
  const previous = new Map(before.cards.map((card) => [card.id, card]));
  const lines = changedLines(prev.log, next.log);
  // The glow takes the colour of whoever wrote the latest line; system lines have none.
  const actor = lines.at(-1)?.color ?? -1;
  const turned = turnedIn(before, after);
  const shrunk = shrunkHiddenPiles(before, after);
  const revealed = shrunk.length > 0;

  const anims: Anim[] = [];
  for (const card of after.cards) {
    const was = previous.get(card.id);
    if (!was) {
      // Never listed before: it came out of a deck nobody sees, or out of another player's hand.
      // Only the first turns over as it lands, the viewer's own drop included.
      if (revealed && card.zone === 'table' && !isHidden(card)) {
        anims.push({ kind: 'flip', id: card.id });
      }
      continue;
    }
    if (dropped.has(card.id)) {
      continue;
    }
    const travel = travelOf(was, card, after);
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
  // The viewer's own draw, a deck dragged onto the hand, already lies there.
  const draggedPile = ownDrop?.element.kind === 'pile' ? ownDrop.element.id : null;
  for (const draw of drawsOf(before, after, shrunk, ownSeats(next))) {
    if (!dropped.has(draw.id) && draw.fromPile !== draggedPile) {
      anims.push(draw);
    }
  }
  anims.push(...drawnAway(prev, next, before, after));
  for (const pile of shuffledPiles(lines, next, after.piles)) {
    anims.push({ kind: 'shuffle', pile });
  }
  for (const pile of revealedTops(before, after, dropped)) {
    anims.push({ kind: 'reveal', pile });
  }
  const tokenMoved =
    before.firstPlayer.x !== after.firstPlayer.x || before.firstPlayer.y !== after.firstPlayer.y;
  if (tokenMoved && ownDrop?.element.kind !== 'firstPlayer') {
    anims.push({ kind: 'firstPlayer', from: before.firstPlayer, to: after.firstPlayer });
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

/** Drawn where its place can be measured: on the table, or in the viewer's hand. */
function isPlaced(card: CardView): boolean {
  return card.zone === 'table' || card.zone === 'hand';
}

function boxOf(card: CardView): Box {
  return { zone: card.zone, x: card.x, y: card.y };
}

/** A card that went somewhere else on the table or the hand, or onto a pile that shows its cards. */
function travelOf(was: CardView, card: CardView, table: TableView): Anim | null {
  if (!isPlaced(was)) {
    return null;
  }
  if (isPlaced(card)) {
    const moved = was.zone !== card.zone || was.x !== card.x || was.y !== card.y;
    return moved ? { kind: 'move', id: card.id, from: boxOf(was), to: boxOf(card) } : null;
  }
  const pile = table.piles.find((p) => p.cards?.includes(card.id));
  return pile ? { kind: 'fly', id: card.id, toPile: pile.id } : null;
}

/**
 * A table card that shows another side: flipped face down or face up, turned
 * to another face, or come face up out of a pile that does not show its
 * cards (a deck the viewer was looking through).
 */
function isTurnedOver(was: CardView, card: CardView, before: TableView): boolean {
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
 * a seat's hand grew by, taken from that seat's piles that shrank, its deck
 * first, at most what each pile lost. A card out of a pile that showed its
 * cards is named, unless it shows up somewhere else.
 */
function drawnAway(prev: View, next: View, before: TableView, after: TableView): Anim[] {
  const own = ownSeats(next);
  const listed = new Set(after.cards.map((card) => card.id));
  const counts = handCounts(prev);
  const shrunk = shrunkPiles(before, after);
  const anims: Anim[] = [];
  for (const [seat, count] of handCounts(next)) {
    let rise = count - (counts.get(seat) ?? count);
    if (own.includes(seat) || rise <= 0) {
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
 * The side decks showing their top card (topFaceUp) whose top is a card
 * nobody saw before: the previous top left, or the deck was shuffled. A card
 * put back on top was seen, face up, where it came from: it moves there, as
 * the viewer's own drop already lies there.
 */
function revealedTops(before: TableView, after: TableView, dropped: Set<string>): string[] {
  const revealed: string[] = [];
  for (const pile of after.piles) {
    const top = pile.topFaceUp ? pile.cards?.at(-1) : undefined;
    const wasTop = before.piles.find((p) => p.id === pile.id)?.cards?.at(-1);
    if (top === undefined || top === wasTop || dropped.has(top) || wasSeen(top, before)) {
      continue;
    }
    revealed.push(pile.id);
  }
  return revealed;
}

/** Whether the card showed its face before: on the table, in a hand, or in a pile that lists it. */
function wasSeen(id: string, before: TableView): boolean {
  const was = before.cards.find((card) => card.id === id);
  if (!was || isHidden(was)) {
    return false;
  }
  return isPlaced(was) || before.piles.some((pile) => pile.cards?.includes(id));
}

/** Exhausted or readied, flipped, turned face up, or its tokens or statuses changed. */
function hasChanged(was: CardView, card: CardView): boolean {
  return (
    !!was.exhausted !== !!card.exhausted ||
    was.face !== card.face ||
    !!was.faceDown !== !!card.faceDown ||
    !sameCounts(was.tokens, card.tokens) ||
    !sameCounts(was.status, card.status)
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
    const writer = view.players.find((player) => player.color === line.color);
    let best: { pile: string; name: string } | null = null;
    for (const pile of piles) {
      const name = narratedName(pile, writer, view);
      if (line.text.endsWith(` ${name}`) && (!best || name.length > best.name.length)) {
        best = { pile: pile.id, name };
      }
    }
    if (best) {
      shuffled.add(best.pile);
    }
  }
  return [...shuffled];
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
function narratedName(pile: PileView, writer: PlayerView | undefined, view: View): string {
  const shared = SHARED_PILE_NAMES[pile.id];
  if (shared) {
    return shared;
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
