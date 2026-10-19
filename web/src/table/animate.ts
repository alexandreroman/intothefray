// What changed on the table between two views, as the animations to play
// (spec 5.2, 5.5, 5.6): cards that moved, changed, turned in or flew to a
// pile, and piles that were shuffled. Pure: the table plays the list
// (motion.svelte.ts).

import type { CardView, LogView, PileView, PlayerView, TableView, View, Zone } from '../lib/types';
import { stackOf } from './drag';
import { isHidden } from './face';
import { seatHero, seatPlayer } from './seats';

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
  | { kind: 'fly'; id: string; toPile: string };

/**
 * Views further apart than this are not animated: after a reconnection, the
 * table jumps to its new state instead of replaying everything at once.
 */
export const MAX_APART_MS = 2000;

const SHUFFLED = 'shuffled ';

/**
 * The animations that take the table from prev to next. ownDrop is the card
 * the viewer has just dropped: it already lies where it went, with its stack.
 * apart is how long the viewer went without a live view between the two, in
 * ms (GameSession.viewGap).
 */
export function diffViews(prev: View, next: View, ownDrop?: string, apart = 0): Anim[] {
  const before = prev.table;
  const after = next.table;
  if (!before || !after || apart > MAX_APART_MS) {
    return [];
  }

  const dropped = new Set(ownDrop === undefined ? [] : stackOf(ownDrop, after.cards));
  const previous = new Map(before.cards.map((card) => [card.id, card]));
  const lines = changedLines(prev.log, next.log);
  // The glow takes the colour of whoever wrote the latest line; system lines have none.
  const actor = lines.at(-1)?.color ?? -1;
  const turned = turnedIn(before, after);
  const revealed = hiddenPileShrank(before, after);

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
  for (const pile of shuffledPiles(lines, next, after.piles)) {
    anims.push({ kind: 'shuffle', pile });
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

/** Whether a pile that does not show its cards (a deck, the encounter deck) lost some. */
function hiddenPileShrank(before: TableView, after: TableView): boolean {
  return after.piles.some((pile) => {
    const was = before.piles.find((p) => p.id === pile.id);
    return pile.cards === undefined && was !== undefined && pile.count < was.count;
  });
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
  let noun = PILE_NOUNS[pile.kind] ?? 'pile';
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
