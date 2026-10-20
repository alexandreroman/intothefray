// The actions of a table element, as the floating action bar, its menus and
// the keys offer them. The client mirrors the server's permissions only to
// hide what would be refused (internal/game/action.go, resolve); the server
// still checks everything.

import { knownCard } from '../lib/catalog';
import type { Lang } from '../lib/lang';
import { localizedFace } from '../lib/localize';
import type { IconName } from './Icons.svelte';
import { isOutOfPlay } from './layout';
import { seatOf, seatPlayer } from './seats';
import type { Action, Area, CardView, PileView, Role, Stage, TableView, View } from '../lib/types';

/**
 * What the bar is for: a table card, a pile or a card of the viewer's hand.
 * Not named Element: that would shadow the DOM's.
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
  /** The cards of a public pile: the hovered one, or one of its owner's out-of-play piles. */
  | { local: 'browseBox'; pile: string };

/** How a key shows in a tooltip, a menu or the shortcuts sheet: Backspace as its ⌫ glyph. */
export function keyLabel(key: string): string {
  return key === 'Backspace' ? '⌫' : key;
}

export interface ActionItem {
  /** Stable id: 'exhaust', 'flip', 'stage', 'counters', 'discard', 'moveTo', 'draw1', … */
  id: string;
  label: string;
  icon?: IconName;
  key?: string;
  disabled?: boolean;
  tip?: string;
  /** Drawn pressed: Ready on an exhausted card. */
  pressed?: boolean;
  /** Items of different groups are drawn with a separator between them. */
  group: number;
  /** A dropdown item under a heading: the heading starts where the section changes. */
  section?: string;
  /** Dropdown items; a separator is an item with the id 'sep'. A dropdown with an icon has no caret. */
  menu?: ActionItem[];
  run?: () => Action | { ask: CountQuestion } | LocalAction;
}

/** Mirrors maxCount in internal/game/action.go: the most cards one action takes. */
const MAX_COUNT = 99;

// Groups of a card in play, in bar order: Exhaust and Flip (or the stage
// choice) turn the card, the counters mark it, Discard and Move to take it away.
const GROUP_TURN = 0;
const GROUP_MARK = 1;
const GROUP_LEAVE = 2;

// Groups of a pile: what it does itself, then the buttons opening its owner's out-of-play piles.
const GROUP_PILE = 0;
const GROUP_OUT_OF_PLAY = 1;

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
 * handled by keys.ts) and elements no longer on the table get nothing; an
 * empty pile only the buttons opening its owner's out-of-play piles.
 * Spectators only look: see spectatorActions.
 */
export function actionsFor(
  el: TableElement,
  view: View,
  you: { areas?: readonly Area[]; role: Role },
  lang: Lang = 'en',
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
      if (!pile) {
        return [];
      }
      // An empty deck or discard pile still opens its owner's out-of-play piles.
      return pile.count > 0 ? pileActions(pile, context) : outOfPlayItems(pile, context.table);
    }
    case 'hand':
      return [];
  }
}

/**
 * A spectator's read-only bar (ruling P5c-R2): Browse… on the piles whose
 * cards everyone sees. Cards in play, the villain and main scheme included, get none.
 */
function spectatorActions(el: TableElement, table: TableView): ActionItem[] {
  switch (el.kind) {
    case 'card':
      return [];
    case 'pile': {
      const pile = table.piles.find((p) => p.id === el.id);
      if (!pile) {
        return [];
      }
      // Not drawn on the table: their box opens from their owner's deck or discard pile.
      if (isOutOfPlay(pile)) {
        return [];
      }
      if (pile.count === 0) {
        return outOfPlayItems(pile, table);
      }
      // The server lists the cards of the public piles only.
      const items: ActionItem[] = [];
      if (pile.cards !== undefined) {
        // No key: spectators get no game keys (P5b-R6).
        const browse = browseItem(pile);
        delete browse.key;
        items.push(browse);
      }
      return [...items, ...outOfPlayItems(pile, table)];
    }
    case 'hand':
      return [];
  }
}

// ---- Cards in play ----

function cardActions(card: CardView, context: Context): ActionItem[] {
  const items: ActionItem[] = [exhaustItem(card)];
  const shownBy = context.table.stages.find((stage) => stage.current === card.id);
  if (shownBy) {
    items.push(stageItem(shownBy));
  } else if (canFlip(card)) {
    items.push(flipItem(card));
  }
  items.push(counterMenu(card));
  items.push(...leaveItems(card, context));
  return items;
}

function exhaustItem(card: CardView): ActionItem {
  const label = card.exhausted ? 'Ready' : 'Exhaust';
  const stuck = card.exhausted === true && isLocked(card);
  return {
    id: 'exhaust',
    label,
    icon: 'exhaust',
    key: 'E',
    tip: stuck ? 'Locked: this card does not ready' : label,
    disabled: stuck,
    pressed: card.exhausted,
    group: GROUP_TURN,
    // The server decides the outcome (resolveExhaust): the client sends only the card.
    run: () => ({ kind: 'exhaust', card: card.id }),
  };
}

/** The card a stage shows has no Flip: its card choice lists every face instead. */
function stageItem(stage: Stage): ActionItem {
  const label = `Choose the ${stage.label.toLowerCase()} card to show`;
  return {
    id: 'stage',
    label,
    icon: 'stage-pick',
    tip: label,
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
    icon: 'flip',
    key: 'F',
    tip: 'Flip',
    group: GROUP_TURN,
    // The server picks the face the card ends on (resolveFlip).
    run: () => ({ kind: 'flip', card: card.id }),
  };
}

/** The "+" dropdown: the tokens, then the statuses, each in its section. */
function counterMenu(card: CardView): ActionItem {
  const label = 'Add a token or status';
  const menu = [
    ...counterItems(card, 'token', 'Tokens', TOKENS, card.tokens),
    ...counterItems(card, 'status', 'Status', STATUSES, card.status),
  ];
  return { id: 'counters', label, icon: 'token', tip: label, group: GROUP_MARK, menu };
}

/** Each counter adds one, its current count in brackets. */
function counterItems(
  card: CardView,
  kind: 'token' | 'status',
  section: string,
  counters: { name: string; label: string; key: string }[],
  counts: Record<string, number> | undefined,
): ActionItem[] {
  return counters.map((counter): ActionItem => {
    const count = counts?.[counter.name] ?? 0;
    return {
      id: counter.name,
      label: count > 0 ? `${counter.label} (${count})` : counter.label,
      key: counter.key,
      group: 0,
      section,
      run: () => ({ kind, card: card.id, name: counter.name, delta: 1 }),
    };
  });
}

/** Discard and Move to, disabled while the card holds what a stage shows. */
function leaveItems(card: CardView, context: Context): ActionItem[] {
  const discard: ActionItem = {
    id: 'discard',
    label: 'Discard',
    icon: 'discard',
    key: 'Backspace',
    tip: 'Discard',
    group: GROUP_LEAVE,
    run: () => ({ kind: 'discard', card: card.id }),
  };
  const moveTo: ActionItem = {
    id: 'moveTo',
    label: 'Move to',
    icon: 'move',
    tip: 'Move to',
    group: GROUP_LEAVE,
    menu: moveMenu(card, context),
  };

  const held = stageHeldBy(card, context.table);
  if (held) {
    // Mirrors checkNotStageCurrent: the server refuses to take that card away.
    const tip = `The ${held.label.toLowerCase()} card stays on the table: choose another card to show`;
    return [
      { ...discard, disabled: true, tip },
      { ...moveTo, disabled: true, tip },
    ];
  }
  return [discard, moveTo];
}

/** The stage whose shown card is this card or one tucked under it, if any. */
export function stageHeldBy(card: CardView, table: TableView): Stage | undefined {
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
  if ((own || encounter) && hasPile(context.table, homeDeckOf(card))) {
    menu.push(
      { id: 'deckTop', label: 'Top of deck', group: 0, run: () => toDeck(card, 'top') },
      { id: 'deckBottom', label: 'Bottom of deck', group: 0, run: () => toDeck(card, 'bottom') },
      {
        id: 'deckShuffle',
        label: encounter ? 'Shuffle into encounter deck' : 'Shuffle into deck',
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

// The piles a card goes to, as the server names them (internal/game/state.go).

/** The deck a card goes back to: the encounter deck for an encounter card, else its owner's. */
export function homeDeckOf(card: CardView): string {
  return card.owner === -1 ? 'enc' : `deck:p${card.owner}`;
}

/** The discard pile a card goes to, as discardPileID has it. */
export function discardPileOf(card: CardView): string {
  return card.owner === -1 ? 'encd' : `disc:p${card.owner}`;
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

function pileActions(pile: PileView, context: Context): ActionItem[] | { text: string } {
  // Shared piles have no owner (-1).
  const own = pile.owner === -1 || context.seats.includes(pile.owner);
  const outOfPlay = outOfPlayItems(pile, context.table);
  switch (pile.kind) {
    case 'deck':
      if (!own) {
        // Only its owner may touch it: what is left are their out-of-play piles.
        if (outOfPlay.length > 0) {
          return outOfPlay;
        }
        const name = seatPlayer(context.view, pile.owner)?.name ?? 'another player';
        return { text: `Belongs to ${name}: only they can use it.` };
      }
      return [
        drawOneItem(),
        lookMenu(pile, 'your deck'),
        deckMenu(pile, 'your deck', true),
        ...outOfPlay,
      ];
    case 'encounter':
      return [
        revealItem(pile, context),
        lookMenu(pile, 'the encounter deck'),
        deckMenu(pile, 'the encounter deck', false),
        ...outOfPlay,
      ];
    case 'discard':
    case 'encounterDiscard':
      // Anyone may search a discard pile; only its owner shuffles it back.
      return own
        ? [searchItem(pile), shuffleBackItem(pile), ...outOfPlay]
        : [searchItem(pile), ...outOfPlay];
    case 'victory':
    case 'aside':
      // Not drawn on the table: their box opens from their owner's deck or discard pile.
      return [];
  }
}

/**
 * The out-of-play piles are not drawn on the table: the bar of a deck or a
 * discard pile opens its owner's, each button saying how many cards it holds.
 * The encounter piles open the victory display and the scenario's set-aside
 * cards, a player's piles that player's set-aside cards.
 */
function outOfPlayItems(pile: PileView, table: TableView): ActionItem[] {
  switch (pile.kind) {
    case 'encounter':
    case 'encounterDiscard':
      return [
        outOfPlayItem(table, 'vic', 'victory', 'Victory display', 'trophy'),
        outOfPlayItem(table, 'saside', 'aside', 'Set-aside cards', 'hourglass'),
      ].filter((item) => item !== null);
    case 'deck':
    case 'discard': {
      const aside = outOfPlayItem(
        table,
        `aside:p${pile.owner}`,
        'aside',
        'Set-aside cards',
        'hourglass',
      );
      return aside ? [aside] : [];
    }
    default:
      return [];
  }
}

/** The button opening an out-of-play pile, disabled while it is empty; null without that pile. */
function outOfPlayItem(
  table: TableView,
  pileId: string,
  id: string,
  name: string,
  icon: IconName,
): ActionItem | null {
  const pile = table.piles.find((p) => p.id === pileId);
  if (!pile) {
    return null;
  }
  const label = `${name} (${pile.count})`;
  const empty = pile.count === 0;
  return {
    id,
    label,
    icon,
    tip: empty ? `${label}: empty` : label,
    disabled: empty,
    group: GROUP_OUT_OF_PLAY,
    run: () => ({ local: 'browseBox', pile: pile.id }),
  };
}

function drawOneItem(): ActionItem {
  // The server draws from the deck of the credited seat, the deck's owner (creditedSeat): no pile is sent.
  return {
    id: 'draw1',
    label: 'Draw 1',
    key: 'W',
    tip: 'Draw 1',
    group: 0,
    run: () => ({ kind: 'draw', n: 1 }),
  };
}

function revealItem(pile: PileView, context: Context): ActionItem {
  const reveal: ActionItem = {
    id: 'reveal',
    label: 'Reveal',
    key: 'R',
    tip: 'Reveal',
    group: 0,
    run: () => ({ kind: 'reveal' }),
  };
  const shown = context.table.cards.find((c) => c.zone === 'table' && c.onPile === pile.id);
  if (!shown) {
    return reveal;
  }
  return {
    ...reveal,
    disabled: true,
    tip: `${cardName(shown, context.lang)} is already revealed on this deck: move it first`,
  };
}

function cardName(card: CardView, lang: Lang): string {
  const face = card.code ? knownCard(card.code)?.card.faces[card.face] : undefined;
  return face ? localizedFace(face, lang).name : 'A card';
}

/** Look ▾: Look at top… and Search…; pileName is how the questions name the pile. */
function lookMenu(pile: PileView, pileName: string): ActionItem {
  const lookTop: ActionItem = {
    id: 'lookTop',
    label: 'Look at top…',
    key: 'L',
    group: 0,
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
  return { id: 'look', label: 'Look', tip: 'Look', group: 0, menu: [lookTop, searchItem(pile)] };
}

/** Deck ▾: Draw… (own deck only), Discard top…, then Shuffle. */
function deckMenu(pile: PileView, pileName: string, withDraw: boolean): ActionItem {
  const menu: ActionItem[] = [];
  if (withDraw) {
    menu.push({
      id: 'drawN',
      label: 'Draw…',
      group: 0,
      run: () => ({
        ask: {
          title: 'Draw cards',
          question: 'How many cards do you draw?',
          pile: pile.id,
          max: countLimit(pile),
          ok: 'Draw',
          make: (n) => ({ kind: 'draw', n }),
        },
      }),
    });
  }
  menu.push(
    {
      id: 'discardTop',
      label: 'Discard top…',
      group: 0,
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
    },
    SEPARATOR,
    {
      id: 'shuffle',
      label: 'Shuffle',
      key: 'U',
      group: 0,
      run: () => ({ kind: 'shuffle', pile: pile.id }),
    },
  );
  return { id: 'deck', label: 'Deck', tip: 'Deck', group: 0, menu };
}

function countLimit(pile: PileView): number {
  return Math.min(pile.count, MAX_COUNT);
}

/** Search… opens a private view: the server sends the cards, which the box shows. */
function searchItem(pile: PileView): ActionItem {
  return {
    id: 'search',
    label: 'Search…',
    key: 'K',
    tip: 'Search…',
    group: 0,
    run: () => ({ kind: 'search', pile: pile.id }),
  };
}

function shuffleBackItem(pile: PileView): ActionItem {
  return {
    id: 'shuffleBack',
    label: 'Shuffle back',
    tip: 'Shuffle this discard pile back into its deck',
    group: 0,
    run: () => ({ kind: 'shuffleBack', pile: pile.id }),
  };
}

/** Browse… needs no server: public piles are face up, their cards listed. */
function browseItem(pile: PileView): ActionItem {
  return {
    id: 'browse',
    label: 'Browse…',
    key: 'K',
    tip: 'Browse…',
    group: GROUP_PILE,
    run: () => ({ local: 'browseBox', pile: pile.id }),
  };
}
