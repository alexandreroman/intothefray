// The actions of a table element, as its context menu (contextItems.ts) and
// the keys (keys.ts) offer them. The client mirrors the server's permissions only to
// hide what would be refused (internal/game/action.go, resolve); the server
// still checks everything.

import { knownCard } from '../lib/catalog';
import type { Lang } from '../lib/lang';
import { localizedFace } from '../lib/localize';
import { isOutOfPlay } from './layout';
import { seatOf, seatPlayer } from './seats';
import type { Action, Area, CardView, PileView, Role, Stage, TableView, View } from '../lib/types';

/**
 * What the actions are for: a table card, a pile or a card of the viewer's
 * hand. Not named Element: that would shadow the DOM's.
 */
export type TableElement =
  { kind: 'card'; id: string } | { kind: 'pile'; id: string } | { kind: 'hand'; id: string };

/** A "How many cards?" question, answered by the app's count dialog. */
export interface CountQuestion {
  title: string;
  question: string;
  /** The pile the cards come from: while the question is open, the answer follows its count. */
  pile: string;
  max: number;
  ok: string;
  make: (n: number) => Action;
}

/** Something the client does by itself, without sending an action: open a box. */
export type LocalAction =
  /** The card choice of the stage the hovered card shows. */
  | { local: 'stageBox' }
  /** The cards of a public pile: the hovered one. */
  | { local: 'browseBox'; pile: string }
  /** The arrow mode from that card, as the A key starts it: a click then picks the card it points at. */
  | { local: 'arrow'; card: string };

/**
 * How an item's key shows in the context menu: a key taken with Shift after
 * ⇧ (⇧W). Only the main key shows, not its alternatives. Undefined for an item
 * without a key.
 */
export function keyLabel(item: Pick<ActionItem, 'key' | 'shift'>): string | undefined {
  if (item.key === undefined) {
    return undefined;
  }
  return item.shift ? `⇧${item.key}` : item.key;
}

export interface ActionItem {
  /** Stable id: 'exhaust', 'flip', 'stage', 'tokens', 'statuses', 'discard', 'moveTo', 'draw1', … */
  id: string;
  label: string;
  key?: string;
  /** Other keys that run the item too, never shown: Backspace discards as X does. */
  altKeys?: string[];
  /** The key is taken with Shift: Draw X is Shift + W, while W alone is Draw 1. */
  shift?: true;
  disabled?: boolean;
  /** Why a disabled item is: the context menu shows it with the item. */
  reason?: string;
  /** The element's default action, usually its first: shown in bold in the context menu. */
  default?: true;
  /** Items of different groups are drawn with a separator between them. */
  group: number;
  /** The items of a submenu; a separator is an item with the id 'sep'. */
  menu?: ActionItem[];
  run?: () => Action | { ask: CountQuestion } | LocalAction;
}

/** Mirrors maxCount in internal/game/action.go: the most cards one action takes. */
const MAX_COUNT = 99;

// Groups of a card in play, in menu order: Exhaust and Flip (or the stage
// choice) turn the card, the token and status submenus mark it, Discard and
// Move to take it away.
const GROUP_TURN = 0;
const GROUP_MARK = 1;
const GROUP_LEAVE = 2;
// The context menu's own last group, which the keys reach otherwise (A): the arrow.
const GROUP_POINT = 3;

// Groups of a pile, in menu order: its main action (Draw, Reveal), the ways to
// look at its cards, then the rarer actions (Discard X, Shuffle).
const GROUP_MAIN = 0;
const GROUP_LOOK = 1;
const GROUP_MORE = 2;

const SEPARATOR: ActionItem = { id: 'sep', label: '-', group: 0 };

const TOKENS = [
  { name: 'dmg', label: 'Damage', key: 'D' },
  { name: 'thr', label: 'Threat', key: 'T' },
  { name: 'gen', label: 'Counter', key: 'N' },
];

const STATUSES = [
  { name: 'stunned', label: 'Stunned', key: 'S' },
  { name: 'confused', label: 'Confused', key: 'C' },
  { name: 'tough', label: 'Tough', key: 'G' },
  { name: 'locked', label: 'Locked', key: 'L' },
];

/** Whether a card carries the Locked status: exhausted, it does not ready (the server refuses). */
export function isLocked(card: CardView): boolean {
  return (card.status?.locked ?? 0) > 0;
}

/** The lower-case name of a token or status, as the pill says it: "damage", "stunned". */
export function counterName(kind: 'token' | 'status', name: string): string {
  const counters = kind === 'token' ? TOKENS : STATUSES;
  return (counters.find((counter) => counter.name === name)?.label ?? name).toLowerCase();
}

/** What every builder needs to know: the table, the viewer's own seats and the language of card names. */
interface Context {
  view: View;
  table: TableView;
  seats: number[];
  lang: Lang;
}

/**
 * Returns the actions the viewer may take on el, or the text to show instead
 * when the element belongs to someone else. Hand cards (their keys are
 * handled by keys.ts), empty piles and elements no longer on the table get
 * nothing. Spectators only look: see spectatorActions.
 */
export function actionsFor(
  el: TableElement,
  view: View,
  you: { areas?: readonly Area[]; role: Role },
  lang: Lang,
): ActionItem[] | { text: string } {
  if (!view.table) {
    return [];
  }
  if (you.role === 'spectator') {
    return spectatorActions(el, view.table);
  }
  const seats = (you.areas ?? []).map(seatOf);
  if (seats.length === 0) {
    return [];
  }
  const context: Context = { view, table: view.table, seats, lang };

  switch (el.kind) {
    case 'card': {
      const card = context.table.cards.find((c) => c.id === el.id);
      return card?.zone === 'table' ? cardActions(card, context) : [];
    }
    case 'pile': {
      const pile = context.table.piles.find((p) => p.id === el.id);
      // An empty pile is inert: nothing to draw, look at or search.
      if (!pile || pile.count === 0) {
        return [];
      }
      return pileActions(pile, context);
    }
    case 'hand':
      return [];
  }
}

/**
 * A spectator's read-only actions (ruling P5c-R2): Browse… on the piles whose
 * cards everyone sees. Cards in play, the villain and main scheme included, get none.
 */
function spectatorActions(el: TableElement, table: TableView): ActionItem[] {
  switch (el.kind) {
    case 'card':
      return [];
    case 'pile': {
      const pile = table.piles.find((p) => p.id === el.id);
      // Not drawn on the table, the out-of-play piles open from the chips on their owner's frame.
      if (!pile || pile.count === 0 || isOutOfPlay(pile)) {
        return [];
      }
      // The server lists the cards of the public piles only.
      // A side deck showing its top card lists that card alone: it is not browsed.
      if (pile.cards === undefined || pile.kind === 'sideDeck') {
        return [];
      }
      // No key: spectators get no game keys (P5b-R6).
      const browse = browseItem(pile);
      delete browse.key;
      return [browse];
    }
    case 'hand':
      return [];
  }
}

// ---- Cards in play ----

function cardActions(card: CardView, context: Context): ActionItem[] {
  const items: ActionItem[] = [exhaustItem(card)];
  const shownByStage = context.table.stages.some((stage) => stage.current === card.id);
  if (shownByStage) {
    items.push(stageItem());
  } else if (canFlip(card)) {
    items.push(flipItem(card));
  }
  items.push(counterMenu(card, 'token'), counterMenu(card, 'status'));
  items.push(...leaveItems(card, context));
  return items;
}

function exhaustItem(card: CardView): ActionItem {
  const stuck = card.exhausted === true && isLocked(card);
  return {
    id: 'exhaust',
    label: card.exhausted ? 'Ready' : 'Exhaust',
    key: 'E',
    disabled: stuck,
    reason: stuck ? 'Locked: this card does not ready' : undefined,
    default: true,
    group: GROUP_TURN,
    // The server decides the outcome (resolveExhaust): the client sends only the card.
    run: () => ({ kind: 'exhaust', card: card.id }),
  };
}

/**
 * The card a stage shows has no Flip: its card choice lists every face instead. One short
 * label for the villain and the main scheme alike: the box it opens names its stage.
 */
function stageItem(): ActionItem {
  return {
    id: 'stage',
    label: 'Change card…',
    key: 'V',
    group: GROUP_TURN,
    run: () => ({ local: 'stageBox' }),
  };
}

function canFlip(card: CardView): boolean {
  if (card.faceDown || !card.code) {
    return true;
  }
  const faces = knownCard(card.code)?.card.faces.length ?? 1;
  return faces > 1;
}

function flipItem(card: CardView): ActionItem {
  return {
    id: 'flip',
    label: 'Flip',
    key: 'F',
    group: GROUP_TURN,
    // The server picks the face the card ends on (resolveFlip).
    run: () => ({ kind: 'flip', card: card.id }),
  };
}

/**
 * "Add a token" or "Add a status": a submenu whose items each add one of
 * their counter, its current count in brackets.
 */
function counterMenu(card: CardView, kind: 'token' | 'status'): ActionItem {
  const counters = kind === 'token' ? TOKENS : STATUSES;
  const counts = kind === 'token' ? card.tokens : card.status;
  const menu = counters.map((counter): ActionItem => {
    const count = counts?.[counter.name] ?? 0;
    return {
      id: counter.name,
      label: count > 0 ? `${counter.label} (${count})` : counter.label,
      key: counter.key,
      group: 0,
      run: () => ({ kind, card: card.id, name: counter.name, delta: 1 }),
    };
  });
  return {
    id: kind === 'token' ? 'tokens' : 'statuses',
    label: kind === 'token' ? 'Add a token' : 'Add a status',
    group: GROUP_MARK,
    menu,
  };
}

/**
 * Discard and Move to, disabled while the card is, or holds, one that stays on
 * the table. A card of a side deck without a discard pile has no Discard.
 */
function leaveItems(card: CardView, context: Context): ActionItem[] {
  const discard: ActionItem = {
    id: 'discard',
    label: 'Discard',
    key: 'X',
    altKeys: ['Backspace'],
    group: GROUP_LEAVE,
    run: () => ({ kind: 'discard', card: card.id }),
  };
  const moveTo: ActionItem = {
    id: 'moveTo',
    label: 'Move to',
    group: GROUP_LEAVE,
    menu: moveMenu(card, context),
  };

  const items = discardPileOf(card, context.table.piles) === null ? [moveTo] : [discard, moveTo];
  const reason = staysOnTable(card, context.table);
  if (reason) {
    return items.map((item) => ({ ...item, disabled: true, reason }));
  }
  return items;
}

/**
 * Why the card cannot leave the table, or undefined when it can: it is, or
 * holds tucked under it, the card a stage shows or a player's identity. It
 * mirrors checkStaysOnTable, which refuses to take such a card away, so that
 * the menu, the keys and the drag share one rule.
 */
export function staysOnTable(card: CardView, table: TableView): string | undefined {
  const held = stageHeldBy(card, table);
  if (held) {
    return `The ${held.label.toLowerCase()} card stays on the table: choose another card to show`;
  }
  const holdsIdentity = table.cards.some((c) => c.identity && isInStackOf(c.id, card.id, table));
  if (holdsIdentity) {
    return 'The identity card stays on the table';
  }
  return undefined;
}

/** The stage whose shown card is this card or one tucked under it, if any. */
function stageHeldBy(card: CardView, table: TableView): Stage | undefined {
  return table.stages.find((stage) => isInStackOf(stage.current, card.id, table));
}

/** Whether the card id is root or tucked under root, directly or not. */
function isInStackOf(id: string, root: string, table: TableView): boolean {
  let current = table.cards.find((c) => c.id === id);
  while (current) {
    if (current.id === root) {
      return true;
    }
    const parent = current.parent;
    current = parent ? table.cards.find((c) => c.id === parent) : undefined;
  }
  return false;
}

function moveMenu(card: CardView, context: Context): ActionItem[] {
  const own = context.seats.includes(card.owner);
  const menu: ActionItem[] = [];

  // Encounter cards go to no hand; the viewer's cards to the hand of their own deck (the server picks
  // it), other players' cards only to theirs.
  if (own) {
    menu.push({
      id: 'hand',
      label: 'Hand',
      key: 'H',
      group: 0,
      run: () => ({ kind: 'toHand', card: card.id }),
    });
  }
  // A card returns to its home deck, which is private to its owner.
  const encounter = card.owner === -1;
  const home = context.table.piles.find((pile) => pile.id === homeDeckOf(card));
  if ((own || encounter) && home) {
    const deck = home.kind === 'sideDeck' ? `${sideLabel(home)} deck` : 'deck';
    menu.push(
      { id: 'deckTop', label: `Top of ${deck}`, group: 0, run: () => toDeck(card, 'top') },
      {
        id: 'deckBottom',
        label: `Bottom of ${deck}`,
        key: 'B',
        group: 0,
        run: () => toDeck(card, 'bottom'),
      },
      {
        id: 'deckShuffle',
        label: encounter ? 'Shuffle into encounter deck' : `Shuffle into ${deck}`,
        group: 0,
        run: () => toDeck(card, 'shuffle'),
      },
    );
  }

  const outOfPlay: ActionItem[] = [];
  if (hasPile(context.table, 'vic')) {
    outOfPlay.push({
      id: 'victory',
      label: 'Victory display',
      group: 0,
      run: () => toPile(card, 'vic'),
    });
  }
  const aside = asidePileOf(card, context.seats);
  if (hasPile(context.table, aside)) {
    outOfPlay.push({ id: 'aside', label: 'Set aside', group: 0, run: () => toPile(card, aside) });
  }

  if (menu.length > 0 && outOfPlay.length > 0) {
    menu.push(SEPARATOR);
  }
  return [...menu, ...outOfPlay];
}

/**
 * Draw an arrow, for the context menu only: it is no action of the keys' list, as the A key and
 * Shift + drag start it. It starts the same arrow mode as A.
 */
export function arrowItem(card: string): ActionItem {
  return {
    id: 'arrow',
    label: 'Draw an arrow',
    key: 'A',
    group: GROUP_POINT,
    run: () => ({ local: 'arrow', card }),
  };
}

// The piles a card goes to, as the server names them (internal/game/state.go).

const SIDE_DECK_PREFIX = 'side:';
const SIDE_DISCARD_PREFIX = 'sided:';

/**
 * The deck a card goes back to: the side deck it belongs to (`home`), else the
 * encounter deck for an encounter card, else its owner's deck.
 */
export function homeDeckOf(card: CardView): string {
  if (card.home !== undefined) {
    return card.home;
  }
  return card.owner === -1 ? 'enc' : `deck:p${card.owner}`;
}

/**
 * The discard pile a card goes to, as discardPileID has it: a side deck's card
 * to that deck's discard pile, or nowhere (null) when the side deck has none.
 */
export function discardPileOf(card: CardView, piles: readonly PileView[]): string | null {
  const home = homeDeckOf(card);
  if (isSideDeckId(home)) {
    const discard = deckDiscardOf(home);
    return piles.some((pile) => pile.id === discard) ? discard : null;
  }
  return card.owner === -1 ? 'encd' : `disc:p${card.owner}`;
}

/**
 * The discard pile paired with a deck, by id: "deck:p0" with "disc:p0", a side
 * deck "side:p0:1" with "sided:p0:1", the encounter deck with "encd". It may
 * not exist: only some side decks have one.
 */
export function deckDiscardOf(deck: string): string {
  if (deck === 'enc') {
    return 'encd';
  }
  if (isSideDeckId(deck)) {
    return SIDE_DISCARD_PREFIX + deck.slice(SIDE_DECK_PREFIX.length);
  }
  return deck.replace(/^deck:/, 'disc:');
}

/** Whether the pile id is a side deck's: "side:p0:1". */
export function isSideDeckId(pile: string): boolean {
  return pile.startsWith(SIDE_DECK_PREFIX);
}

/** The name of a side deck and of its discard pile: "Invocation", as in "Invocation deck". */
export function sideLabel(pile: PileView): string {
  return pile.label ?? 'side';
}

/** The set-aside pile for a card: its deck's own for the viewer's cards, the scenario's for any other. */
export function asidePileOf(card: CardView, seats: readonly number[]): string {
  return seats.includes(card.owner) ? `aside:p${card.owner}` : 'saside';
}

function toDeck(card: CardView, where: 'top' | 'bottom' | 'shuffle'): Action {
  return { kind: 'toDeck', card: card.id, where };
}

function toPile(card: CardView, target: string): Action {
  return { kind: 'toPile', card: card.id, target };
}

function hasPile(table: TableView, id: string): boolean {
  return table.piles.some((p) => p.id === id);
}

// ---- Piles ----

/**
 * Every pile's actions have the same order, a separator between the groups:
 * the main action, the ways to look at the cards, then the rarer actions.
 */
function pileActions(pile: PileView, context: Context): ActionItem[] | { text: string } {
  // Shared piles have no owner (-1).
  const own = pile.owner === -1 || context.seats.includes(pile.owner);
  switch (pile.kind) {
    case 'deck':
      if (!own) {
        const name = seatPlayer(context.view, pile.owner)?.name ?? 'another player';
        return { text: `Belongs to ${name}: only they can use it.` };
      }
      return [
        drawOneItem(),
        drawCountItem(pile),
        lookTopItem(pile, 'your deck'),
        searchItem(pile),
        discardTopItem(pile, 'your deck'),
        shuffleItem(pile),
      ];
    case 'sideDeck': {
      // Private to its owner, like a deck.
      if (!own) {
        const name = seatPlayer(context.view, pile.owner)?.name ?? 'another player';
        return { text: `Belongs to ${name}: only they can use it.` };
      }
      const pileName = `your ${sideLabel(pile)} deck`;
      const items = [
        drawOneItem(pile),
        drawCountItem(pile),
        lookTopItem(pile, pileName),
        searchItem(pile),
      ];
      // Only a side deck with its own discard pile discards from the top.
      if (hasPile(context.table, deckDiscardOf(pile.id))) {
        items.push(discardTopItem(pile, pileName));
      }
      items.push(shuffleItem(pile));
      return items;
    }
    case 'encounter':
      return [
        revealItem(pile, context),
        lookTopItem(pile, 'the encounter deck'),
        searchItem(pile),
        discardTopItem(pile, 'the encounter deck'),
        shuffleItem(pile),
      ];
    case 'discard':
    case 'encounterDiscard':
    case 'sideDiscard': {
      // Anyone may search a discard pile, its default action; only its owner shuffles it into its deck.
      const search: ActionItem = { ...searchItem(pile), default: true };
      return own ? [search, shuffleBackItem(pile)] : [search];
    }
    case 'victory':
    case 'aside':
      // Not drawn on the table: the chips on their owner's frame open their box.
      return [];
  }
}

/**
 * Draw 1, from a side deck when one is given. For a deck the server draws from
 * the deck of the credited seat, the deck's owner (creditedSeat): no pile is sent.
 */
function drawOneItem(sideDeck?: PileView): ActionItem {
  return {
    id: 'draw1',
    label: 'Draw 1',
    key: 'W',
    default: true,
    group: GROUP_MAIN,
    run: () => drawAction(1, sideDeck),
  };
}

function drawAction(n: number, sideDeck?: PileView): Action {
  return sideDeck ? { kind: 'draw', n, pile: sideDeck.id } : { kind: 'draw', n };
}

/**
 * Draw X asks how many cards: Shift + W, beside Draw 1's W. As Draw 1, it sends
 * the pile only for a side deck.
 */
function drawCountItem(pile: PileView): ActionItem {
  const sideDeck = pile.kind === 'sideDeck' ? pile : undefined;
  return {
    id: 'drawN',
    label: 'Draw X',
    key: 'W',
    shift: true,
    group: GROUP_MAIN,
    run: () => ({
      ask: {
        title: 'Draw cards',
        question: 'How many cards do you draw?',
        pile: pile.id,
        max: countLimit(pile),
        ok: 'Draw',
        make: (n) => drawAction(n, sideDeck),
      },
    }),
  };
}

function revealItem(pile: PileView, context: Context): ActionItem {
  const reveal: ActionItem = {
    id: 'reveal',
    label: 'Reveal',
    key: 'R',
    default: true,
    group: GROUP_MAIN,
    run: () => ({ kind: 'reveal' }),
  };
  const shown = context.table.cards.find((c) => c.zone === 'table' && c.onPile === pile.id);
  if (!shown) {
    return reveal;
  }
  return {
    ...reveal,
    disabled: true,
    reason: `${cardName(shown, context.lang)} is already revealed on this deck: move it first`,
  };
}

function cardName(card: CardView, lang: Lang): string {
  const face = card.code ? knownCard(card.code)?.card.faces[card.face] : undefined;
  return face ? localizedFace(face, lang).name : 'A card';
}

/** Top X asks how many cards to look at; pileName is how the question names the pile. */
function lookTopItem(pile: PileView, pileName: string): ActionItem {
  return {
    id: 'lookTop',
    label: 'Top X',
    key: 'L',
    group: GROUP_LOOK,
    run: () => ({
      ask: {
        title: 'Look at the top cards',
        question: `How many cards from the top of ${pileName}?`,
        pile: pile.id,
        max: countLimit(pile),
        ok: 'Look',
        make: (n) => ({ kind: 'look', pile: pile.id, n }),
      },
    }),
  };
}

/** Discard X, a deck's rarer action: pileName is how the question names the pile. */
function discardTopItem(pile: PileView, pileName: string): ActionItem {
  return {
    id: 'discardTop',
    label: 'Discard X',
    group: GROUP_MORE,
    run: () => ({
      ask: {
        title: 'Discard from the top',
        question: `How many cards from the top of ${pileName} go to the discard pile?`,
        pile: pile.id,
        max: countLimit(pile),
        ok: 'Discard',
        make: (n) => ({ kind: 'discardTop', pile: pile.id, n }),
      },
    }),
  };
}

function shuffleItem(pile: PileView): ActionItem {
  return {
    id: 'shuffle',
    label: 'Shuffle',
    key: 'U',
    group: GROUP_MORE,
    run: () => ({ kind: 'shuffle', pile: pile.id }),
  };
}

function countLimit(pile: PileView): number {
  return Math.min(pile.count, MAX_COUNT);
}

/** Search opens a private view: the server sends the cards, which the box shows. */
function searchItem(pile: PileView): ActionItem {
  return {
    id: 'search',
    label: 'Search',
    key: 'K',
    group: GROUP_LOOK,
    run: () => ({ kind: 'search', pile: pile.id }),
  };
}

/** The only rarer action of a discard pile. */
function shuffleBackItem(pile: PileView): ActionItem {
  return {
    id: 'shuffleBack',
    label: 'Shuffle into deck',
    group: GROUP_MORE,
    run: () => ({ kind: 'shuffleBack', pile: pile.id }),
  };
}

/** Browse… needs no server: public piles are face up, their cards listed. */
function browseItem(pile: PileView): ActionItem {
  return {
    id: 'browse',
    label: 'Browse…',
    key: 'K',
    // A spectator's only action on a pile.
    default: true,
    group: GROUP_LOOK,
    run: () => ({ local: 'browseBox', pile: pile.id }),
  };
}
