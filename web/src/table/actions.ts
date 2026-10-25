// The actions of a table element, as its context menu (contextItems.ts) and
// the keys (keys.ts) offer them. The client mirrors the server's permissions only to
// hide what would be refused (internal/game/action.go, resolve); the server
// still checks everything.

import { knownCard } from '../lib/catalog';
import type { Lang } from '../lib/lang';
import { localizedFace } from '../lib/localize';
import { isOutOfPlay } from './layout';
import { seatOf, seatPlayer } from './seats';
import { groupUnits, MAX_COUNT } from './selection';
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
  /** Stable id: 'exhaust', 'flip', 'stage', 'tokens', 'statuses', 'modifiers', 'discard', 'moveTo', 'draw1', … */
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

// Groups of a card in play, in menu order: Exhaust and Flip (or the stage
// choice) turn the card, the token, status and modifier submenus mark it,
// Discard and Move to take it away.
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

/** A token or status of the card menu's submenus; a counter without a key is only reached from the menu. */
interface Counter {
  name: string;
  label: string;
  key?: string;
}

const TOKEN_LIST = [
  { name: 'dmg', label: 'Damage', key: 'D' },
  { name: 'thr', label: 'Threat', key: 'T' },
  { name: 'gen', label: 'Counter', key: 'N' },
  { name: 'acc', label: 'Acceleration' },
] as const;

export type TokenName = (typeof TOKEN_LIST)[number]['name'];

/** The tokens a card carries, in menu order, with the key that adds one. Mirrors tokenNames in internal/game/apply.go. */
export const TOKENS: readonly Counter[] = TOKEN_LIST;

/**
 * The statuses a card carries, in menu and tab order, with the key that adds one. Mirrors statusNames in
 * internal/game/apply.go.
 */
export const STATUSES: readonly Counter[] = [
  { name: 'stunned', label: 'Stunned', key: 'S' },
  { name: 'confused', label: 'Confused', key: 'C' },
  { name: 'tough', label: 'Tough', key: 'G' },
  { name: 'retaliate', label: 'Retaliate', key: 'R' },
  { name: 'locked', label: 'Locked', key: 'L' },
];

/**
 * The stats a modifier changes, in the order cards print them: the stat column, then the hit
 * points. Mirrors modifierNames in internal/game/apply.go.
 */
export const MODIFIERS = ['atk', 'thw', 'def', 'sch', 'rec', 'hp'] as const;

/** The kinds of counters a card carries: tokens and statuses count up from 0, modifiers are signed. */
export type CounterKind = 'token' | 'status' | 'modifier';

/** The counters of one kind a card carries, by name. */
export function countersOf(card: CardView, kind: CounterKind): Record<string, number> | undefined {
  switch (kind) {
    case 'token':
      return card.tokens;
    case 'status':
      return card.status;
    case 'modifier':
      return card.mods;
  }
}

/** A modifier with its sign, a real minus sign (U+2212) when negative: "+1", "−2". */
export function withSign(value: number): string {
  return value < 0 ? `\u2212${-value}` : `+${value}`;
}

/** Whether a card carries the Locked status: exhausted, it does not ready (the server refuses). */
export function isLocked(card: CardView): boolean {
  return (card.status?.locked ?? 0) > 0;
}

/**
 * The name of a counter as the pill says it: a token or status in lower case, "damage",
 * "stunned"; a modifier by its stat, "DEF modifier".
 */
export function counterName(kind: CounterKind, name: string): string {
  if (kind === 'modifier') {
    return `${name.toUpperCase()} modifier`;
  }
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
 * nothing. Spectators only look: see spectatorActions. On a card of the
 * selected group, Discard and Move to take the whole group (spec 2).
 */
export function actionsFor(
  el: TableElement,
  view: View,
  you: { areas?: readonly Area[]; role: Role },
  lang: Lang,
  group?: ReadonlySet<string>,
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
      if (card?.zone !== 'table') {
        return [];
      }
      return cardActions(card, context, groupUnitsOf(card, group, context.table));
    }
    case 'pile': {
      const pile = context.table.piles.find((p) => p.id === el.id);
      // An empty pile is inert: nothing to draw, look at or search. A card revealed on a deck is
      // still its top card.
      if (!pile || deckCount(pile, context.table) === 0) {
        return [];
      }
      return pileActions(pile, context);
    }
    case 'hand':
      return [];
  }
}

/**
 * A spectator's read-only actions: Browse… on the piles whose cards everyone
 * sees. Cards in play, the villain and main scheme included, get none (see the
 * "Spectators cannot change the stage card" project memory note).
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
      return [browseItem(pile)];
    }
    case 'hand':
      return [];
  }
}

// ---- Cards in play ----

/**
 * The units Discard and Move to take when the card is one of the selected
 * group: its units (groupUnits), when there are two or more. Null otherwise:
 * the card's own items.
 */
function groupUnitsOf(
  card: CardView,
  group: ReadonlySet<string> | undefined,
  table: TableView,
): CardView[] | null {
  if (!group?.has(card.id)) {
    return null;
  }
  const units = groupUnits(group, table.cards).flatMap((id) => {
    const unit = table.cards.find((c) => c.id === id);
    return unit ? [unit] : [];
  });
  return units.length >= 2 ? units : null;
}

function cardActions(card: CardView, context: Context, units: CardView[] | null): ActionItem[] {
  // A card revealed on a deck lies there, out of play: it is neither exhausted nor marked (the
  // server refuses it, inPlayCard), and its owner draws it from there.
  const revealed = card.onPile !== undefined;
  const items: ActionItem[] = [];
  if (!revealed) {
    items.push(exhaustItem(card));
  } else if (drawsRevealed(card, context)) {
    items.push(drawRevealedItem(card));
  }
  const stage = context.table.stages.find((s) => s.current === card.id);
  if (stage) {
    const flip = stageFlipItem(card, stage);
    if (flip) {
      items.push(flip);
    }
    items.push(stageItem());
  } else if (canFlip(card)) {
    items.push(flipItem(card));
  }
  if (!revealed) {
    items.push(counterMenu(card, 'token'), counterMenu(card, 'status'), modifierMenu(card));
  }
  items.push(...(units ? groupLeaveItems(units, context) : leaveItems(card, context)));
  return items;
}

/** Whether the viewer draws a card revealed on a deck: from one of their own decks or side decks. */
function drawsRevealed(card: CardView, context: Context): boolean {
  const pile = context.table.piles.find((p) => p.id === card.onPile);
  const playerDeck = pile?.kind === 'deck' || pile?.kind === 'sideDeck';
  return playerDeck && context.seats.includes(pile.owner);
}

/**
 * Draw takes a card revealed on a deck into its owner's hand: a draw of that deck, whose top card
 * it is (internal/game coveredFor).
 */
function drawRevealedItem(card: CardView): ActionItem {
  return {
    id: 'draw',
    label: 'Draw',
    key: 'W',
    default: true,
    group: GROUP_TURN,
    run: () => ({ kind: 'draw', n: 1, pile: card.onPile }),
  };
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
 * The card choice of the card a stage shows: it lists every face of the stage's cards, and is
 * the only way to show another card. One short label for the villain and the main scheme alike:
 * the box it opens names its stage.
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

/**
 * Flip on the card a stage shows turns it over, never changes it: a card with several faces (a
 * main scheme's 1A and 1B, a villain such as Spiral) shows its next face, back to the first after
 * the last, through the card choice's action (applyChooseStage). It never turns face down, so a
 * single-faced card has no Flip, nor a card the catalog does not know yet.
 */
function stageFlipItem(card: CardView, stage: Stage): ActionItem | null {
  const faces = card.code ? (knownCard(card.code)?.card.faces.length ?? 1) : 1;
  if (faces < 2) {
    return null;
  }
  const face = (card.face + 1) % faces;
  return {
    id: 'flip',
    label: 'Flip',
    key: 'F',
    group: GROUP_TURN,
    run: () => ({ kind: 'chooseStage', stage: stage.key, card: card.id, face }),
  };
}

/**
 * Whether Flip changes the card (the server decides how, in resolveFlip): a face-down card turns
 * face up, a card with several faces shows its next one, and a card with a single face turns face
 * down. An identity card stays face up, so a single-faced one has nothing to flip to.
 */
function canFlip(card: CardView): boolean {
  if (card.faceDown || !card.code || !card.identity) {
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
 * their counter, its current count in brackets. Acceleration has no key.
 */
function counterMenu(card: CardView, kind: 'token' | 'status'): ActionItem {
  const counters = kind === 'token' ? TOKENS : STATUSES;
  const counts = countersOf(card, kind);
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
 * "Add a modifier": a submenu that gives the card +1 to a stat, then, past a
 * separator, −1. Unlike most token and status items, these have no keys.
 */
function modifierMenu(card: CardView): ActionItem {
  const step = (delta: 1 | -1) =>
    MODIFIERS.map((name): ActionItem => ({
      id: `${name}${delta > 0 ? '+1' : '-1'}`,
      label: `${withSign(delta)} ${name.toUpperCase()}`,
      group: 0,
      run: () => ({ kind: 'modifier', card: card.id, name, delta }),
    }));
  return {
    id: 'modifiers',
    label: 'Add a modifier',
    group: GROUP_MARK,
    menu: [...step(1), SEPARATOR, ...step(-1)],
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

/**
 * Discard and Move to for a selected group: one group action over every unit,
 * as a group drop sends (selection.ts, groupAction). An entry shows only when
 * every unit could take it alone, and none shuffles: the server refuses to
 * shuffle a group (resolveGroup). Disabled for more units than one group
 * takes, or while a unit is, or holds, a card that stays on the table.
 */
function groupLeaveItems(units: readonly CardView[], context: Context): ActionItem[] {
  const discard: ActionItem = {
    id: 'discard',
    label: `Discard ${units.length} cards`,
    key: 'X',
    altKeys: ['Backspace'],
    group: GROUP_LEAVE,
    run: () => groupOf(units, (unit) => ({ kind: 'discard', card: unit.id })),
  };
  const moveTo: ActionItem = {
    id: 'moveTo',
    label: 'Move to',
    group: GROUP_LEAVE,
    menu: groupMoveMenu(units, context),
  };

  const discardable = units.every((unit) => discardPileOf(unit, context.table.piles) !== null);
  const items = discardable ? [discard, moveTo] : [moveTo];
  if (units.length > MAX_COUNT) {
    const reason = `A group moves ${MAX_COUNT} cards at most`;
    return items.map((item) => ({ ...item, disabled: true, reason }));
  }
  for (const unit of units) {
    const reason = staysOnTable(unit, context.table);
    if (reason) {
      return items.map((item) => ({ ...item, disabled: true, reason }));
    }
  }
  return items;
}

function groupMoveMenu(units: readonly CardView[], context: Context): ActionItem[] {
  const menu: ActionItem[] = [];

  if (units.every((unit) => context.seats.includes(unit.owner))) {
    menu.push({
      id: 'hand',
      label: 'Hand',
      key: 'H',
      group: 0,
      run: () => groupOf(units, (unit) => ({ kind: 'toHand', card: unit.id })),
    });
  }
  // Each unit returns to its own home deck: the viewer's, or the encounter deck.
  const homes = units.map((unit) =>
    context.table.piles.find((pile) => pile.id === homeDeckOf(unit)),
  );
  const toDecks = units.every((unit, i) => {
    const own = context.seats.includes(unit.owner);
    return (own || unit.owner === -1) && homes[i] !== undefined;
  });
  if (toDecks) {
    const first = homes[0];
    const shared = first && homes.every((home) => home?.id === first.id);
    const deck = shared ? deckName(first) : 'decks';
    menu.push(
      {
        id: 'deckTop',
        label: `Top of ${deck}`,
        group: 0,
        run: () => groupOf(units, (unit) => toDeck(unit, 'top')),
      },
      {
        id: 'deckBottom',
        label: `Bottom of ${deck}`,
        key: 'B',
        group: 0,
        run: () => groupOf(units, (unit) => toDeck(unit, 'bottom')),
      },
    );
  }

  const outOfPlay: ActionItem[] = [];
  if (hasPile(context.table, 'vic')) {
    outOfPlay.push({
      id: 'victory',
      label: 'Victory display',
      group: 0,
      run: () => groupOf(units, (unit) => toPile(unit, 'vic')),
    });
  }
  const asides = units.every((unit) => hasPile(context.table, asidePileOf(unit, context.seats)));
  if (asides) {
    outOfPlay.push({
      id: 'aside',
      label: 'Set aside',
      group: 0,
      run: () => groupOf(units, (unit) => toPile(unit, asidePileOf(unit, context.seats))),
    });
  }

  if (menu.length > 0 && outOfPlay.length > 0) {
    menu.push(SEPARATOR);
  }
  return [...menu, ...outOfPlay];
}

/** One group action: the action each unit would send alone, in unit order. */
function groupOf(units: readonly CardView[], actionOf: (unit: CardView) => Action): Action {
  return { kind: 'group', actions: units.map(actionOf) };
}

/** How Move to names a deck: "deck", or a side deck's "Sense deck". */
export function deckName(home: PileView): string {
  if (home.kind === 'sideDeck') {
    return `${sideLabel(home)} deck`;
  }
  return home.kind === 'scenarioDeck' || (home.kind === 'encounter' && home.label)
    ? `${home.label} deck`
    : 'deck';
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
    const deck = deckName(home);
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
        label: encounter && !home.label ? 'Shuffle into encounter deck' : `Shuffle into ${deck}`,
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
const SCENARIO_ENCOUNTER_PREFIX = 'enc:';
const SCENARIO_ENCOUNTER_DISCARD_PREFIX = 'encd:';
const SCENARIO_DECK_PREFIX = 'sdeck:';
const SCENARIO_DISCARD_PREFIX = 'sdisc:';

/**
 * The deck a card goes back to: the side or scenario deck it belongs to (`home`), else the
 * encounter deck for an encounter card, else its owner's deck.
 */
export function homeDeckOf(card: CardView): string {
  if (card.home !== undefined) {
    return card.home;
  }
  return card.owner === -1 ? 'enc' : `deck:p${card.owner}`;
}

/**
 * The discard pile a card goes to, as discardPileID has it: a side or scenario deck's card
 * to that deck's discard pile, or nowhere (null) when the deck has none; an encounter card
 * without a home to the encounter discard pile, when the table has one.
 */
export function discardPileOf(card: CardView, piles: readonly PileView[]): string | null {
  const home = homeDeckOf(card);
  if (isSideDeckId(home) || isScenarioDeckId(home)) {
    const discard = deckDiscardOf(home);
    return piles.some((pile) => pile.id === discard) ? discard : null;
  }
  const discard = card.owner === -1 ? 'encd' : `disc:p${card.owner}`;
  return card.owner === -1 && !piles.some((pile) => pile.id === discard) ? null : discard;
}

/**
 * The discard pile paired with a deck, by id: "deck:p0" with "disc:p0", a side
 * deck "side:p0:1" with "sided:p0:1", the encounter deck with "encd", a scenario
 * deck "enc:w" with "encd:w" and "sdeck:x" with "sdisc:x". It may not exist: only
 * some side and scenario decks have one.
 */
export function deckDiscardOf(deck: string): string {
  if (deck === 'enc') {
    return 'encd';
  }
  if (isSideDeckId(deck)) {
    return SIDE_DISCARD_PREFIX + deck.slice(SIDE_DECK_PREFIX.length);
  }
  if (deck.startsWith(SCENARIO_ENCOUNTER_PREFIX)) {
    return SCENARIO_ENCOUNTER_DISCARD_PREFIX + deck.slice(SCENARIO_ENCOUNTER_PREFIX.length);
  }
  if (deck.startsWith(SCENARIO_DECK_PREFIX)) {
    return SCENARIO_DISCARD_PREFIX + deck.slice(SCENARIO_DECK_PREFIX.length);
  }
  return deck.replace(/^deck:/, 'disc:');
}

/** Whether the pile id is a side deck's: "side:p0:1". */
export function isSideDeckId(pile: string): boolean {
  return pile.startsWith(SIDE_DECK_PREFIX);
}

/** Whether the pile id is a scenario deck's: "enc:wrecker" or "sdeck:weapons". */
export function isScenarioDeckId(pile: string): boolean {
  return pile.startsWith(SCENARIO_ENCOUNTER_PREFIX) || pile.startsWith(SCENARIO_DECK_PREFIX);
}

/** The name of a side deck and of its discard pile: "Invocation", as in "Invocation deck". */
export function sideLabel(pile: PileView): string {
  return pile.label ?? 'side';
}

/** The set-aside pile for a card: its deck's own for the viewer's cards, the scenario's for any other. */
function asidePileOf(card: CardView, seats: readonly number[]): string {
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
        drawCountItem(pile, context.table),
        revealItem(pile, context),
        lookTopItem(pile, 'your deck', context.table),
        searchItem(pile),
        discardOneItem(pile),
        discardTopItem(pile, 'your deck', context.table),
        shuffleItem(pile),
      ];
    case 'sideDeck': {
      // Private to its owner, like a deck.
      if (!own) {
        const name = seatPlayer(context.view, pile.owner)?.name ?? 'another player';
        return { text: `Belongs to ${name}: only they can use it.` };
      }
      const pileName = `your ${sideLabel(pile)} deck`;
      const items = [drawOneItem(pile), drawCountItem(pile, context.table)];
      // A side deck showing its top card has nothing to reveal.
      if (!pile.topFaceUp) {
        items.push(revealItem(pile, context));
      }
      items.push(lookTopItem(pile, pileName, context.table), searchItem(pile));
      // Only a side deck with its own discard pile discards from the top.
      if (hasPile(context.table, deckDiscardOf(pile.id))) {
        items.push(discardOneItem(pile), discardTopItem(pile, pileName, context.table));
      }
      items.push(shuffleItem(pile));
      return items;
    }
    case 'encounter':
    case 'scenarioDeck': {
      // A scenario deck is named by its label; the classic encounter deck has none.
      const pileName = pile.label ? `the ${pile.label} deck` : 'the encounter deck';
      const items = [
        revealItem(pile, context),
        lookTopItem(pile, pileName, context.table),
        searchItem(pile),
      ];
      // A scenario deck may have no discard pile.
      if (hasPile(context.table, deckDiscardOf(pile.id))) {
        items.push(discardOneItem(pile), discardTopItem(pile, pileName, context.table));
      }
      items.push(shuffleItem(pile));
      return items;
    }
    case 'discard':
    case 'encounterDiscard':
    case 'scenarioDiscard':
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
function drawCountItem(pile: PileView, table: TableView): ActionItem {
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
        max: countLimit(pile, table),
        ok: 'Draw',
        make: (n) => drawAction(n, sideDeck),
      },
    }),
  };
}

/**
 * Reveal turns a deck's top card face up onto the deck. It is the encounter deck's main action,
 * which names no pile for the classic one; a player's deck or side deck draws by default, and names itself.
 */
function revealItem(pile: PileView, context: Context): ActionItem {
  const encounter = pile.kind === 'encounter' || pile.kind === 'scenarioDeck';
  const reveal: ActionItem = {
    id: 'reveal',
    label: 'Reveal',
    key: 'R',
    group: GROUP_MAIN,
    run: () => (pile.id === 'enc' ? { kind: 'reveal' } : { kind: 'reveal', pile: pile.id }),
  };
  if (encounter) {
    reveal.default = true;
  }
  const shown = revealedOn(pile, context.table)[0];
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
function lookTopItem(pile: PileView, pileName: string, table: TableView): ActionItem {
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
        max: countLimit(pile, table),
        ok: 'Look',
        make: (n) => ({ kind: 'look', pile: pile.id, n }),
      },
    }),
  };
}

/** Discard 1 sends the deck's top card to its discard pile in one click: X or Backspace, as on a card. */
function discardOneItem(pile: PileView): ActionItem {
  return {
    id: 'discard1',
    label: 'Discard 1',
    key: 'X',
    altKeys: ['Backspace'],
    group: GROUP_MORE,
    run: () => ({ kind: 'discardTop', pile: pile.id, n: 1 }),
  };
}

/**
 * Discard X, a deck's rarer action: Shift + X, beside Discard 1's X. pileName is
 * how the question names the pile.
 */
function discardTopItem(pile: PileView, pileName: string, table: TableView): ActionItem {
  return {
    id: 'discardTop',
    label: 'Discard X',
    key: 'X',
    shift: true,
    group: GROUP_MORE,
    run: () => ({
      ask: {
        title: 'Discard from the top',
        question: `How many cards from the top of ${pileName} go to the discard pile?`,
        pile: pile.id,
        max: countLimit(pile, table),
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

function countLimit(pile: PileView, table: TableView): number {
  return Math.min(deckCount(pile, table), MAX_COUNT);
}

/** The table cards lying revealed on a deck, which still count as its top cards (internal/game coveredFor). */
function revealedOn(pile: PileView, table: TableView): CardView[] {
  return table.cards.filter((c) => c.zone === 'table' && c.onPile === pile.id);
}

/** How many cards a deck's actions take from: those in it, and those revealed on it. */
export function deckCount(pile: PileView, table: TableView): number {
  return pile.count + revealedOn(pile, table).length;
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

/**
 * Browse… needs no server: public piles are face up, their cards listed. It
 * has no key: it is a spectator's only action on a pile, and spectators get
 * no game keys.
 */
function browseItem(pile: PileView): ActionItem {
  return {
    id: 'browse',
    label: 'Browse…',
    default: true,
    group: GROUP_LOOK,
    run: () => ({ local: 'browseBox', pile: pile.id }),
  };
}
