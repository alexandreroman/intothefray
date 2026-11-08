// The actions of a table element, as its context menu (contextItems.ts) and
// the keys (keys.ts) offer them. The client mirrors the server's permissions only to
// hide what would be refused (internal/game/action.go, resolve); the server
// still checks everything.

import { knownCard } from '../lib/catalog';
import type { Lang } from '../lib/lang';
import { localizedFace } from '../lib/localize';
import { mainCardOf, stackOf } from './drag';
import { SCHEME_TYPES } from './face';
import { detachSlot, freeSlot, isOutOfPlay } from './layout';
import {
  areaOf,
  asideId,
  deckId,
  discardId,
  isScenarioDeckId,
  isSideDeckId,
  ownSeats,
  PILE_ENCOUNTER,
  PILE_ENCOUNTER_DISCARD,
  PILE_SCENARIO_ASIDE,
  PILE_VICTORY,
  seatPlayer,
} from './seats';
import { groupUnits } from './selection';
import type {
  Action,
  CardView,
  PileKind,
  PileView,
  Size,
  Stage,
  TableView,
  View,
} from '../lib/types';

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
  /**
   * Chosen from a menu (the desktop action menu, the inspector's submenu page), it leaves that menu
   * open where it is, to be chosen again: a token entry, as a card often takes several at once.
   */
  staysOpen?: true;
  run?: () => Action | { ask: CountQuestion } | LocalAction;
}

/**
 * The key of each action, as its menu entry shows it and the keys sheet lists
 * it (KeysSheet.svelte). The arrow is no item of actionsFor: its menu entry is
 * added by contextItems and its key handled by keys.ts. A hand card's actions
 * (handActions) have no context menu: keys.ts and the dock's hand sheet run
 * them. Several actions share a key, each on its own kind of element: W draws a
 * revealed card or from a deck, X discards a card, a hand card or a deck's
 * top card, H takes a card or an own discard pile's top card to the hand, and
 * with Shift, Draw X and Discard X.
 */
export const KEYS = {
  exhaust: 'E',
  flip: 'F',
  arrow: 'A',
  discard: 'X',
  hand: 'H',
  bottom: 'B',
  stage: 'V',
  draw: 'W',
  reveal: 'R',
  look: 'L',
  search: 'K',
  shuffle: 'U',
  play: 'P',
} as const;

// Groups of a card in play, in menu order: Exhaust (none on a villain or a
// scheme) and Flip (or the stage choice) turn the card, the token, status and
// modifier submenus mark it, Discard and Move to take it away.
const GROUP_TURN = 0;
const GROUP_MARK = 1;
const GROUP_LEAVE = 2;
// The context menu's own last group, which the keys reach otherwise (A): the arrow.
const GROUP_POINT = 3;

// Groups of a pile, in menu order: its main action (Draw, Reveal, Take top card
// to hand), the ways to look at its cards, the rarer actions (Discard 1,
// Discard X), then a deck's Shuffle on its own, apart from the entries that
// move cards.
const GROUP_MAIN = 0;
const GROUP_LOOK = 1;
const GROUP_MORE = 2;
const GROUP_SHUFFLE = 3;

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

/**
 * The tokens a card carries, in menu order, with the key that adds one. Mirrors tokenNames in
 * internal/game/apply.go.
 */
export const TOKENS: readonly Counter[] = TOKEN_LIST;

/** The tokens piled up from the bottom right corner on every card: damage in the corner, counters on top. */
export const CORNER_TOKENS: readonly TokenName[] = ['dmg', 'gen'];

/**
 * The threat, then the acceleration to its left: in the top right corner of a scheme, between
 * damage and counters in the corner pile of any other card. The first one takes the threat's place.
 */
export const THREAT_TOKENS: readonly TokenName[] = ['thr', 'acc'];

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
 * The number a status tab shows after its label: none for one, "×2" for several ("Tough ×2").
 * The count of Retaliate is its value, which always shows: "Retaliate 1".
 */
export function statusCount(name: string, count: number): string | null {
  if (name === 'retaliate') {
    return `${count}`;
  }
  return count > 1 ? `×${count}` : null;
}

/**
 * The stats a modifier changes, in the order cards print them: the stat column, then the hit
 * points. Mirrors modifierNames in internal/game/apply.go.
 */
export const MODIFIERS = ['atk', 'thw', 'def', 'sch', 'rec', 'hp'] as const;

/**
 * Mirrors maxCount in internal/game/action.go: the most cards one action takes, the most
 * sub-actions a group holds (resolveGroup), and the largest modifier either way, where the
 * server clamps it (applyCounter), so that a step past it changes nothing.
 */
export const MAX_COUNT = 99;

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

/** The card's modifier on that stat, 0 when it has none. */
function modifierOf(card: CardView, name: string): number {
  return card.mods?.[name] ?? 0;
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
 * The label of a counter as its list gives it: a token or status by its label, "Damage",
 * "Stunned"; a modifier by its stat, "DEF".
 */
export function counterLabel(kind: CounterKind, name: string): string {
  if (kind === 'modifier') {
    return name.toUpperCase();
  }
  const counters = kind === 'token' ? TOKENS : STATUSES;
  return counters.find((counter) => counter.name === name)?.label ?? name;
}

/**
 * The name of a counter as the pill says it: a token or status in lower case, "damage",
 * "stunned"; a modifier by its stat, "DEF modifier".
 */
export function counterName(kind: CounterKind, name: string): string {
  if (kind === 'modifier') {
    return `${counterLabel(kind, name)} modifier`;
  }
  return counterLabel(kind, name).toLowerCase();
}

/**
 * What a touch screen's inspector offers beyond the menu and the keys: Detach,
 * which a mouse or a pen does by dragging the card off its stack. The card
 * sizes place the detached card in its row.
 */
export interface TouchOptions {
  sizeOf: (card: CardView) => Size;
}

/**
 * What every builder needs to know: the table, the viewer's own seats, the language of card names,
 * and on a touch screen its options.
 */
interface Context {
  view: View;
  table: TableView;
  seats: number[];
  lang: Lang;
  touch?: TouchOptions;
}

/**
 * Returns the actions the viewer (view.you) may take on el, or the text to
 * show instead when the element belongs to someone else. Hand cards (their
 * actions are handActions'), empty piles and elements no longer on the
 * table get nothing, nor does a viewer of an unknown token. Spectators only
 * look: see spectatorActions. On a card of the selected group, Discard and
 * Move to take the whole group. With `touch`, for a touch screen's
 * inspector, a tucked card offers Detach too.
 */
export function actionsFor(
  el: TableElement,
  view: View,
  lang: Lang,
  group?: ReadonlySet<string>,
  touch?: TouchOptions,
): ActionItem[] | { text: string } {
  if (!view.table) {
    return [];
  }
  if (view.you.role === 'spectator') {
    return spectatorActions(el, view.table);
  }
  const seats = ownSeats(view);
  if (seats.length === 0) {
    return [];
  }
  const context: Context = { view, table: view.table, seats, lang, touch };

  switch (el.kind) {
    case 'card': {
      const card = context.table.cards.find((c) => c.id === el.id);
      if (card?.zone !== 'table') {
        return [];
      }
      return cardActions(card, context, leavingUnits(card, group, context.table));
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
 * "Action menu organisation" project memory note).
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
 * The units Discard and Move to take: the selected group's units
 * (groupUnits) when the card is one of a group of two or more, else the card
 * alone.
 */
function leavingUnits(
  card: CardView,
  group: ReadonlySet<string> | undefined,
  table: TableView,
): CardView[] {
  if (!group?.has(card.id)) {
    return [card];
  }
  const units = groupUnits(group, table.cards).flatMap((id) => {
    const unit = table.cards.find((c) => c.id === id);
    return unit ? [unit] : [];
  });
  return units.length >= 2 ? units : [card];
}

function cardActions(card: CardView, context: Context, units: CardView[]): ActionItem[] {
  // A card revealed on a deck lies there, out of play: it is neither exhausted nor given statuses
  // or modifiers (the server refuses it, inPlayCard), and its owner draws it from there. It takes
  // tokens, which count on it where it lies.
  const revealed = card.onPile !== undefined;
  const exhausts = !revealed && canExhaust(card);
  const items: ActionItem[] = [];
  if (exhausts) {
    items.push(exhaustItem(card));
  } else if (revealed && drawsRevealed(card, context)) {
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
  // Without Exhaust, a card in play makes its first turning action the default: Flip or Change card….
  const firstTurn = items.find((item) => item.group === GROUP_TURN);
  if (!revealed && !exhausts && firstTurn) {
    firstTurn.default = true;
  }
  if (context.touch && card.parent !== undefined && !revealed) {
    items.push(detachItem(card, context.table, context.touch.sizeOf));
  }
  items.push(counterMenu(card, 'token'));
  if (!revealed) {
    items.push(counterMenu(card, 'status'), modifierMenu(card));
  }
  items.push(...leaveItems(units, context));
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
    key: KEYS.draw,
    default: true,
    group: GROUP_TURN,
    run: () => ({ kind: 'draw', n: 1, pile: card.onPile }),
  };
}

/** Whether a card of this type never exhausts in the game: the villain and the schemes. */
function neverExhausts(type: string): boolean {
  return type === 'villain' || SCHEME_TYPES.includes(type);
}

/**
 * Whether the card offers Exhaust (or Ready): a villain or a scheme does not, unless it is
 * somehow exhausted already, so that it can always be readied. A card whose face the viewer
 * does not know (face down, or not in the catalog yet) keeps it.
 */
export function canExhaust(card: CardView): boolean {
  if (card.exhausted || card.faceDown || !card.code) {
    return true;
  }
  const face = knownCard(card.code)?.card.faces[card.face];
  return !face || !neverExhausts(face.type);
}

function exhaustItem(card: CardView): ActionItem {
  const stuck = card.exhausted === true && isLocked(card);
  return {
    id: 'exhaust',
    label: card.exhausted ? 'Ready' : 'Exhaust',
    key: KEYS.exhaust,
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
    key: KEYS.stage,
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
  const faces = faceCount(card);
  if (faces < 2) {
    return null;
  }
  const face = (card.face + 1) % faces;
  return {
    id: 'flip',
    label: 'Flip',
    key: KEYS.flip,
    group: GROUP_TURN,
    run: () => ({ kind: 'chooseStage', stage: stage.key, card: card.id, face }),
  };
}

/**
 * The number of faces of the card, one while it is unknown or its catalog entry is not loaded.
 * Mirrors faceCount in internal/game/apply.go.
 */
function faceCount(card: CardView): number {
  if (!card.code) {
    return 1;
  }
  return knownCard(card.code)?.card.faces.length ?? 1;
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
  return faceCount(card) > 1;
}

function flipItem(card: CardView): ActionItem {
  return {
    id: 'flip',
    label: 'Flip',
    key: KEYS.flip,
    group: GROUP_TURN,
    // The server picks the face the card ends on (resolveFlip).
    run: () => ({ kind: 'flip', card: card.id }),
  };
}

/**
 * Detach takes a tucked card off its stack, alone, which closes up (applyDetach, internal/game): on
 * a touch screen, where the card lies mostly covered, it stands for the drag off the stack. The
 * card goes to the first free spot of its stack's row past the stack (detachSlot). No key: a
 * keyboard comes with a mouse, which drags the card.
 */
function detachItem(card: CardView, table: TableView, sizeOf: TouchOptions['sizeOf']): ActionItem {
  return {
    id: 'detach',
    label: 'Detach',
    group: GROUP_TURN,
    run: () => {
      const host = mainCardOf(card, table.cards);
      const { x, y } = detachSlot(card, host, table, sizeOf);
      return { kind: 'detach', card: card.id, x, y };
    },
  };
}

/**
 * "Add a token" or "Add a status": a submenu whose items each add one of
 * their counter, its current count in brackets. Acceleration has no key. A
 * token entry leaves its menu open, to add the same token again: damage and
 * threat often come several at a time.
 */
function counterMenu(card: CardView, kind: 'token' | 'status'): ActionItem {
  const counters = kind === 'token' ? TOKENS : STATUSES;
  const counts = countersOf(card, kind);
  const menu = counters.map((counter): ActionItem => {
    const count = counts?.[counter.name] ?? 0;
    const item: ActionItem = {
      id: counter.name,
      label: count > 0 ? `${counter.label} (${count})` : counter.label,
      key: counter.key,
      group: 0,
      run: () => ({ kind, card: card.id, name: counter.name, delta: 1 }),
    };
    return kind === 'token' ? { ...item, staysOpen: true } : item;
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
 * separator, −1. Unlike most token and status items, these have no keys. A
 * step past ±MAX_COUNT is greyed: the server would change nothing.
 */
function modifierMenu(card: CardView): ActionItem {
  const step = (delta: 1 | -1) =>
    MODIFIERS.map((name): ActionItem => {
      const limit = delta * MAX_COUNT;
      const atLimit = delta > 0 ? modifierOf(card, name) >= limit : modifierOf(card, name) <= limit;
      return {
        id: `${name}${delta > 0 ? '+1' : '-1'}`,
        label: `${withSign(delta)} ${name.toUpperCase()}`,
        disabled: atLimit,
        reason: atLimit
          ? `The ${name.toUpperCase()} modifier is already ${withSign(limit)}`
          : undefined,
        group: 0,
        run: () => ({ kind: 'modifier', card: card.id, name, delta }),
      };
    });
  return {
    id: 'modifiers',
    label: 'Add a modifier',
    group: GROUP_MARK,
    menu: [...step(1), SEPARATOR, ...step(-1)],
  };
}

/**
 * Discard and Move to, for a card or for a selected group (two units or
 * more). A group's entries send one group action over every unit, as a group
 * drop does (selection.ts, groupAction), and show only when every unit could
 * take them alone. A card of a side deck without a discard pile has no
 * Discard. Disabled while a unit is, or holds, a card that stays on the
 * table, or for more units than one group takes.
 */
function leaveItems(units: readonly CardView[], context: Context): ActionItem[] {
  const discard: ActionItem = {
    id: 'discard',
    label: units.length >= 2 ? `Discard ${units.length} cards` : 'Discard',
    key: KEYS.discard,
    altKeys: ['Backspace'],
    group: GROUP_LEAVE,
    run: () => actionOver(units, (unit) => ({ kind: 'discard', card: unit.id })),
  };
  const moveTo: ActionItem = {
    id: 'moveTo',
    label: 'Move to',
    group: GROUP_LEAVE,
    menu: moveMenu(units, context),
  };

  const discardable = units.every((unit) => discardPileOf(unit, context.table.piles) !== null);
  const items = discardable ? [discard, moveTo] : [moveTo];
  const reason = leaveRefusal(units, context.table);
  if (reason) {
    return items.map((item) => ({ ...item, disabled: true, reason }));
  }
  return items;
}

/** Why the units cannot leave the table together, or undefined when they can. */
function leaveRefusal(units: readonly CardView[], table: TableView): string | undefined {
  // Only a group can be that large: a single card is no group action.
  if (units.length > MAX_COUNT) {
    return `A group moves ${MAX_COUNT} cards at most`;
  }
  for (const unit of units) {
    const reason = staysOnTable(unit, table);
    if (reason) {
      return reason;
    }
  }
  return undefined;
}

/**
 * Why the card cannot leave the table, or undefined when it can: it is, or
 * carries (stackOf), the card a stage shows or a player's identity. It
 * mirrors checkStaysOnTable, which refuses to take such a card away, so that
 * the menu, the keys and the drag share one rule.
 */
export function staysOnTable(card: CardView, table: TableView): string | undefined {
  const stack = new Set(stackOf(card.id, table.cards));
  const stage = table.stages.find((s) => stack.has(s.current));
  if (stage) {
    return `The ${stage.label.toLowerCase()} card stays on the table: choose another card to show`;
  }
  const holdsIdentity = table.cards.some((c) => c.identity && stack.has(c.id));
  if (holdsIdentity) {
    return 'The identity card stays on the table';
  }
  return undefined;
}

/**
 * The Move to submenu of a card or a group. Encounter cards go to no hand;
 * the viewer's cards to the hand of their own deck (the server picks it). A
 * deck shows when every unit may return to its home deck (homeDeckFor),
 * named "decks" when those differ. Only a single card shuffles into its
 * deck: the server refuses to shuffle a group (resolveGroup).
 */
function moveMenu(units: readonly CardView[], context: Context): ActionItem[] {
  const menu: ActionItem[] = [];

  if (units.every((unit) => context.seats.includes(unit.owner))) {
    menu.push({
      id: 'hand',
      label: 'Hand',
      key: KEYS.hand,
      group: 0,
      run: () => actionOver(units, (unit) => ({ kind: 'toHand', card: unit.id })),
    });
  }
  // The decks show when every unit has a home deck it may return to.
  const homes = units
    .map((unit) => homeDeckFor(unit, context.seats, context.table.piles))
    .filter((home) => home !== undefined);
  const [first] = homes;
  if (first && homes.length === units.length) {
    const deck = homes.every((home) => home.id === first.id) ? deckName(first) : 'decks';
    menu.push(
      {
        id: 'deckTop',
        label: `Top of ${deck}`,
        group: 0,
        run: () => actionOver(units, (unit) => toDeck(unit, 'top')),
      },
      {
        id: 'deckBottom',
        label: `Bottom of ${deck}`,
        key: KEYS.bottom,
        group: 0,
        run: () => actionOver(units, (unit) => toDeck(unit, 'bottom')),
      },
    );
    const [card] = units;
    if (card && units.length === 1) {
      const encounter = card.owner === -1 && !first.label;
      menu.push({
        id: 'deckShuffle',
        label: encounter ? 'Shuffle into encounter deck' : `Shuffle into ${deck}`,
        group: 0,
        run: () => toDeck(card, 'shuffle'),
      });
    }
  }

  // The scenario's own areas come first and take any card, as the victory display does:
  // "The Collection".
  const outOfPlay: ActionItem[] = [];
  for (const area of context.table.piles.filter((pile) => pile.kind === 'scenarioArea')) {
    outOfPlay.push({
      id: area.id,
      label: pileName(area),
      group: 0,
      run: () => actionOver(units, (unit) => toPile(unit, area.id)),
    });
  }
  if (hasPile(context.table, PILE_VICTORY)) {
    outOfPlay.push({
      id: 'victory',
      label: 'Victory display',
      group: 0,
      run: () => actionOver(units, (unit) => toPile(unit, PILE_VICTORY)),
    });
  }
  const asides = units.every((unit) => hasPile(context.table, asidePileOf(unit, context.seats)));
  if (asides) {
    outOfPlay.push({
      id: 'aside',
      label: 'Set aside',
      group: 0,
      run: () => actionOver(units, (unit) => toPile(unit, asidePileOf(unit, context.seats))),
    });
  }

  if (menu.length > 0 && outOfPlay.length > 0) {
    menu.push(SEPARATOR);
  }
  return [...menu, ...outOfPlay];
}

/**
 * What the units send: the card's own action for a single card, else one
 * group action, the action each unit would send alone, in unit order.
 */
function actionOver(units: readonly CardView[], actionOf: (unit: CardView) => Action): Action {
  const [card] = units;
  if (card && units.length === 1) {
    return actionOf(card);
  }
  return { kind: 'group', actions: units.map(actionOf) };
}

/** How Move to names a deck: "deck", or a deck with a name of its own, "Sense deck", "Wrecker deck". */
export function deckName(home: PileView): string {
  const plain = home.kind === 'deck' || (home.kind === 'encounter' && !home.label);
  return plain ? 'deck' : pileName(home);
}

/** The id of Draw an arrow, whatever card it is for. */
export const ARROW_ID = 'arrow';

/**
 * Draw an arrow, for the context menu only: it is no action of the keys' list, as the A key and
 * Shift + drag start it. It starts the same arrow mode as A.
 */
export function arrowItem(card: string): ActionItem {
  return {
    id: ARROW_ID,
    label: 'Draw an arrow',
    key: KEYS.arrow,
    group: GROUP_POINT,
    run: () => ({ local: 'arrow', card }),
  };
}

// The piles a card goes to.

/**
 * The deck a card goes back to: the side or scenario deck it belongs to (`home`), else the
 * encounter deck for an encounter card, else its owner's deck.
 */
export function homeDeckOf(card: CardView): string {
  if (card.home !== undefined) {
    return card.home;
  }
  return card.owner === -1 ? PILE_ENCOUNTER : deckId(card.owner);
}

/**
 * Whether the viewer, seated at `seats`, may put the card into a deck: a deck is private to its
 * owner, so the viewer's own cards and cards of nobody's (encounter and scenario cards) only.
 */
function mayPutInDeck(card: CardView, seats: readonly number[]): boolean {
  return seats.includes(card.owner) || card.owner === -1;
}

/**
 * The home deck (homeDeckOf) the viewer may return the card to (mayPutInDeck).
 * Undefined when the card is another player's, or the table lacks that deck.
 */
function homeDeckFor(
  card: CardView,
  seats: readonly number[],
  piles: readonly PileView[],
): PileView | undefined {
  if (!mayPutInDeck(card, seats)) {
    return undefined;
  }
  const home = homeDeckOf(card);
  return piles.find((pile) => pile.id === home);
}

/** The kinds of pile a card can be put into: on top, at the bottom or shuffled in. */
const DECK_KINDS: readonly PileKind[] = ['deck', 'sideDeck', 'encounter', 'scenarioDeck'];

/**
 * The decks on the table that take the card, as the server has it: those of the card's owner, so a
 * player's deck and side decks for that player's card, the encounter and scenario decks for a card
 * of nobody's. Its home deck (homeDeckOf) comes first.
 */
export function decksOf(card: CardView, piles: readonly PileView[]): PileView[] {
  const decks = piles.filter((pile) => DECK_KINDS.includes(pile.kind) && pile.owner === card.owner);
  const home = homeDeckOf(card);
  const homeDeck = decks.filter((deck) => deck.id === home);
  const others = decks.filter((deck) => deck.id !== home);
  return [...homeDeck, ...others];
}

/**
 * The decks (decksOf) the viewer may put the card into (mayPutInDeck): none for another player's
 * card.
 */
export function decksFor(
  card: CardView,
  seats: readonly number[],
  piles: readonly PileView[],
): PileView[] {
  if (!mayPutInDeck(card, seats)) {
    return [];
  }
  return decksOf(card, piles);
}

/**
 * The discard pile a card goes to, as discardPileID has it: a side or scenario deck's card to
 * the pile that deck names, or nowhere (null) when it names none; an encounter card without a
 * home to the encounter discard pile, when the table has one.
 */
export function discardPileOf(card: CardView, piles: readonly PileView[]): string | null {
  const home = homeDeckOf(card);
  if (isSideDeckId(home) || isScenarioDeckId(home)) {
    const deck = piles.find((pile) => pile.id === home);
    return deck ? deckDiscardOf(deck, piles) : null;
  }
  const discard = card.owner === -1 ? PILE_ENCOUNTER_DISCARD : discardId(card.owner);
  return card.owner === -1 && !piles.some((pile) => pile.id === discard) ? null : discard;
}

/**
 * The discard pile the top cards of a deck go to, as discardOf has it on the server: the pile a
 * side or scenario deck names (`discard`), the encounter discard pile for the encounter deck, its
 * owner's discard pile for a player's deck. Null when there is none on the table: a side or
 * scenario deck may never discard its cards.
 */
export function deckDiscardOf(deck: PileView, piles: readonly PileView[]): string | null {
  let discard: string | undefined;
  if (isSideDeckId(deck.id) || isScenarioDeckId(deck.id)) {
    discard = deck.discard;
  } else if (deck.id === PILE_ENCOUNTER) {
    discard = PILE_ENCOUNTER_DISCARD;
  } else if (deck.kind === 'deck') {
    discard = discardId(deck.owner);
  }
  return discard !== undefined && piles.some((pile) => pile.id === discard) ? discard : null;
}

/** The name of a side deck and of its discard pile: "Invocation", as in "Invocation deck". */
export function sideLabel(pile: PileView): string {
  return pile.label ?? 'side';
}

/**
 * A pile's name without its owner: "Deck", "Encounter discard", a side pile after its side deck
 * ("Invocation deck"), a scenario pile after its deck ("Wrecker discard").
 */
export function pileName(pile: PileView): string {
  switch (pile.kind) {
    case 'deck':
      return 'Deck';
    case 'discard':
      return 'Discard';
    case 'encounter':
      return pile.label ? `${pile.label} deck` : 'Encounter deck';
    case 'encounterDiscard':
      return pile.label ? `${pile.label} discard` : 'Encounter discard';
    case 'scenarioDeck':
      return `${pile.label} deck`;
    case 'scenarioDiscard':
      return `${pile.label} discard`;
    case 'sideDeck':
      return `${sideLabel(pile)} deck`;
    case 'sideDiscard':
      return `${sideLabel(pile)} discard`;
    case 'victory':
      return 'Victory display';
    case 'scenarioArea':
      return pile.label ?? 'Scenario area';
    case 'aside':
      return 'Set-aside cards';
  }
}

/** The set-aside pile for a card: its deck's own for the viewer's cards, the scenario's for any other. */
function asidePileOf(card: CardView, seats: readonly number[]): string {
  return seats.includes(card.owner) ? asideId(card.owner) : PILE_SCENARIO_ASIDE;
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

// ---- Hand cards ----

// Groups of a hand card, in the order of the dock's hand sheet: Play, then Discard.
const GROUP_PLAY = 0;
const GROUP_DISCARD = 1;

/**
 * The actions on a card of one of the viewer's own hands, as its keys run
 * them (keys.ts) and the dock's hand sheet lists them: Play, to the first free
 * slot of its deck's row (freeSlot), and Discard, disabled for a side deck's
 * card without a discard pile. Nothing for any other card, nor for a
 * spectator. The desktop has no hand card menu: actionsFor gives them none.
 */
export function handActions(
  id: string,
  view: View,
  sizeOf: (card: CardView) => Size,
): ActionItem[] {
  const table = view.table;
  const card = table?.cards.find((c) => c.id === id);
  const seat = ownSeats(view).find((s) => table?.hands?.[areaOf(s)]?.includes(id));
  if (!table || !card || seat === undefined) {
    return [];
  }

  const play: ActionItem = {
    id: 'play',
    label: 'Play',
    key: KEYS.play,
    default: true,
    group: GROUP_PLAY,
    run: () => {
      const { x, y } = freeSlot(card, table, seat, sizeOf);
      return { kind: 'play', card: id, x, y };
    },
  };
  const discard: ActionItem = {
    id: 'discard',
    label: 'Discard',
    key: KEYS.discard,
    altKeys: ['Backspace'],
    group: GROUP_DISCARD,
    run: () => ({ kind: 'discard', card: id }),
  };
  if (discardPileOf(card, table.piles) === null) {
    return [play, { ...discard, disabled: true, reason: 'This card has no discard pile' }];
  }
  return [play, discard];
}

// ---- Piles ----

/**
 * Every pile's actions have the same order, a separator between the groups:
 * the main action, the ways to look at the cards, the rarer actions, then a
 * deck's Shuffle.
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
      // Only a side deck whose cards are discarded somewhere discards from the top.
      if (deckDiscardOf(pile, context.table.piles) !== null) {
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
      // A scenario deck may never discard its cards.
      if (deckDiscardOf(pile, context.table.piles) !== null) {
        items.push(discardOneItem(pile), discardTopItem(pile, pileName, context.table));
      }
      items.push(shuffleItem(pile));
      return items;
    }
    case 'discard':
    case 'encounterDiscard':
    case 'scenarioDiscard':
    case 'sideDiscard':
      return discardPileActions(pile, own, context);
    case 'victory':
    case 'scenarioArea':
    case 'aside':
      // Not drawn on the table: the chips on their owner's frame open their box.
      return [];
  }
}

/**
 * A discard pile's actions. Anyone may search it; only its owner shuffles it into its deck. A
 * discard pile of one of the viewer's seats, a side one too, takes its top card to the hand by
 * default, as their deck draws one: Search is then one of the ways to look at its cards. Any
 * other discard pile, the shared encounter and scenario ones included, is searched by default.
 */
function discardPileActions(pile: PileView, own: boolean, context: Context): ActionItem[] {
  const playerPile = pile.kind === 'discard' || pile.kind === 'sideDiscard';
  if (playerPile && context.seats.includes(pile.owner)) {
    const takeTop = takeTopItem(pile, context);
    const items = takeTop ? [takeTop] : [];
    items.push(searchItem(pile), shuffleBackItem(pile));
    return items;
  }
  const search: ActionItem = { ...searchItem(pile), default: true };
  return own ? [search, shuffleBackItem(pile)] : [search];
}

/**
 * Take top card to hand: H, as a card in play goes back to hand. The server puts the card into
 * the hand of its owner's seat, so the action names the card alone. It mirrors resolveToHand:
 * an encounter card goes to no hand, another player's card to none of the viewer's. Undefined
 * when the view lacks the top card.
 */
function takeTopItem(pile: PileView, context: Context): ActionItem | undefined {
  // A public pile lists its cards bottom to top.
  const topId = pile.cards?.at(-1);
  if (topId === undefined) {
    return undefined;
  }
  const top = context.table.cards.find((c) => c.id === topId);
  if (top === undefined) {
    return undefined;
  }
  const takeTop: ActionItem = {
    id: 'takeTop',
    label: 'Take top card to hand',
    key: KEYS.hand,
    default: true,
    group: GROUP_MAIN,
    run: () => ({ kind: 'toHand', card: top.id }),
  };
  if (top.owner === -1) {
    return { ...takeTop, disabled: true, reason: 'Encounter cards go to no hand' };
  }
  if (!context.seats.includes(top.owner)) {
    return { ...takeTop, disabled: true, reason: 'This card belongs to another player' };
  }
  return takeTop;
}

/**
 * Draw 1, from a side deck when one is given. For a deck the server draws from
 * the deck of the credited seat, the deck's owner (creditedSeat): no pile is sent.
 */
function drawOneItem(sideDeck?: PileView): ActionItem {
  return {
    id: 'draw1',
    label: 'Draw 1',
    key: KEYS.draw,
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
    key: KEYS.draw,
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
    key: KEYS.reveal,
    group: GROUP_MAIN,
    run: () =>
      pile.id === PILE_ENCOUNTER ? { kind: 'reveal' } : { kind: 'reveal', pile: pile.id },
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
    key: KEYS.look,
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
    key: KEYS.discard,
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
    key: KEYS.discard,
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
    key: KEYS.shuffle,
    group: GROUP_SHUFFLE,
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
    key: KEYS.search,
    group: GROUP_LOOK,
    run: () => ({ kind: 'search', pile: pile.id }),
  };
}

/** The only rarer action of a discard pile: Shuffle into deck. */
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
