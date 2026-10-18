// The actions of a table element, as the floating action bar, its menus and
// the keys offer them. The client mirrors the server's permissions only to
// hide what would be refused (internal/game/action.go, resolve); the server
// still checks everything.

import { knownCard } from '../lib/catalog';
import type { IconName } from './Icons.svelte';
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
  max: number;
  ok: string;
  make: (n: number) => Action;
}

/** Something the client does by itself, without sending an action. */
export type LocalAction = 'arrow' | 'stageBox' | 'lookBox' | 'searchBox' | 'browseBox';

export interface ActionItem {
  /** Stable id: 'exhaust', 'flip', 'stage', 'arrow', 'token', 'status', 'discard', 'moveTo', 'draw1', … */
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
  /** Drawn as a dashed "+" button, without the dropdown caret. */
  add?: boolean;
  /** Dropdown items; a separator is an item with the id 'sep'. */
  menu?: ActionItem[];
  run?: () => Action | { ask: CountQuestion } | { local: LocalAction };
}

/** Mirrors maxCount in internal/game/action.go: the most cards one action takes. */
const MAX_COUNT = 99;

// Groups of a card in play, in bar order.
const GROUP_EXHAUST = 0;
const GROUP_FACES = 1;
const GROUP_MARK = 2;
const GROUP_LEAVE = 3;

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
];

/** The lower-case name of a token or status, as the pill says it: "damage", "stunned". */
export function counterName(kind: 'token' | 'status', name: string): string {
  const counters = kind === 'token' ? TOKENS : STATUSES;
  return (counters.find((counter) => counter.name === name)?.label ?? name).toLowerCase();
}

/** What every builder needs to know: the table and the viewer's seat. */
interface Context {
  view: View;
  table: TableView;
  seat: number;
}

/**
 * Returns the actions the viewer may take on el, or the text to show instead
 * when the element belongs to someone else. Spectators, hand cards (their
 * keys are handled by keys.ts), empty piles and elements no longer on the
 * table get nothing.
 */
export function actionsFor(
  el: TableElement,
  view: View,
  you: { area: Area; role: Role },
): ActionItem[] | { text: string } {
  const seat = seatOf(you.area);
  if (you.role !== 'player' || seat === null || !view.table) {
    return [];
  }
  const context: Context = { view, table: view.table, seat };

  switch (el.kind) {
    case 'card': {
      const card = context.table.cards.find((c) => c.id === el.id);
      return card?.zone === 'table' ? cardActions(card, context) : [];
    }
    case 'pile': {
      const pile = context.table.piles.find((p) => p.id === el.id);
      return pile && pile.count > 0 ? pileActions(pile, context) : [];
    }
    case 'hand':
      return [];
  }
}

/** The seat of a player area ("p1" is seat 1), or null for the villain side. */
export function seatOf(area: Area): number | null {
  if (!area.startsWith('p')) {
    return null;
  }
  return Number(area.slice(1));
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
  items.push(
    {
      id: 'arrow',
      label: 'Arrow',
      icon: 'arrow',
      key: 'A',
      tip: 'Arrow',
      group: GROUP_MARK,
      run: () => ({ local: 'arrow' }),
    },
    counterMenu(card, 'token', '+ Token', 'Add a token', TOKENS, card.tokens),
    counterMenu(card, 'status', '+ Status', 'Add a status', STATUSES, card.status),
  );
  items.push(...leaveItems(card, context));
  return items;
}

function exhaustItem(card: CardView): ActionItem {
  const label = card.exhausted ? 'Ready' : 'Exhaust';
  return {
    id: 'exhaust',
    label,
    icon: 'exhaust',
    key: 'E',
    tip: label,
    pressed: card.exhausted,
    group: GROUP_EXHAUST,
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
    group: GROUP_FACES,
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
    group: GROUP_FACES,
    // The server picks the face the card ends on (resolveFlip).
    run: () => ({ kind: 'flip', card: card.id }),
  };
}

/** "+ Token ▾" or "+ Status ▾": each counter adds one, its current count in brackets. */
function counterMenu(
  card: CardView,
  kind: 'token' | 'status',
  label: string,
  tip: string,
  counters: { name: string; label: string; key: string }[],
  counts: Record<string, number> | undefined,
): ActionItem {
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
  return { id: kind, label, tip, group: GROUP_MARK, add: true, menu };
}

/** Discard and Move to ▾, disabled while the card holds what a stage shows. */
function leaveItems(card: CardView, context: Context): ActionItem[] {
  const discard: ActionItem = {
    id: 'discard',
    label: 'Discard',
    icon: 'discard',
    key: 'X',
    tip: 'Discard',
    group: GROUP_LEAVE,
    run: () => ({ kind: 'discard', card: card.id }),
  };
  const moveTo: ActionItem = {
    id: 'moveTo',
    label: 'Move to',
    tip: 'Move to',
    group: GROUP_LEAVE,
    menu: moveMenu(card, context),
  };

  const held = stageHeldBy(card, context.table);
  if (held) {
    // Mirrors checkNotStageCurrent: the server refuses to take that card away.
    const tip = `The ${held.label.toLowerCase()} card stays on the table — choose another card to show`;
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
  const own = card.owner === context.seat;
  const menu: ActionItem[] = [];

  // Encounter cards go to no hand; other players' cards only to theirs.
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
  if ((own || encounter) && hasPile(context.table, encounter ? 'enc' : `deck:p${card.owner}`)) {
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
  // Own cards go to the player's set-aside pile, any other to the scenario's.
  const aside = own ? `aside:p${context.seat}` : 'saside';
  if (hasPile(context.table, aside)) {
    outOfPlay.push({ id: 'aside', label: 'Set aside', group: 0, run: () => toPile(card, aside) });
  }

  if (menu.length > 0 && outOfPlay.length > 0) {
    menu.push(SEPARATOR);
  }
  return [...menu, ...outOfPlay];
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
  const own = pile.owner === -1 || pile.owner === context.seat;
  switch (pile.kind) {
    case 'deck':
      if (!own) {
        const name = context.view.players[pile.owner]?.name ?? 'another player';
        return { text: `Belongs to ${name} — only they can use it.` };
      }
      return [drawOneItem(), lookMenu(pile, 'your deck'), deckMenu(pile, 'your deck', true)];
    case 'encounter':
      return [
        revealItem(pile, context.table),
        lookMenu(pile, 'the encounter deck'),
        deckMenu(pile, 'the encounter deck', false),
      ];
    case 'discard':
    case 'encounterDiscard':
      // Anyone may search a discard pile; only its owner shuffles it back.
      return own ? [searchItem(pile), shuffleBackItem(pile)] : [searchItem(pile)];
    case 'victory':
      return [browseItem()];
    case 'aside':
      // Anyone may browse a set-aside pile; only its owner shuffles it in.
      return own ? [browseItem(), shuffleInItem(pile)] : [browseItem()];
  }
}

function drawOneItem(): ActionItem {
  // The server draws from the acting player's own deck: no pile is sent.
  return {
    id: 'draw1',
    label: 'Draw 1',
    key: 'W',
    tip: 'Draw 1',
    group: 0,
    run: () => ({ kind: 'draw', n: 1 }),
  };
}

function revealItem(pile: PileView, table: TableView): ActionItem {
  const reveal: ActionItem = {
    id: 'reveal',
    label: 'Reveal',
    key: 'R',
    tip: 'Reveal',
    group: 0,
    run: () => ({ kind: 'reveal' }),
  };
  const shown = table.cards.find((c) => c.zone === 'table' && c.onPile === pile.id);
  if (!shown) {
    return reveal;
  }
  return {
    ...reveal,
    disabled: true,
    tip: `${cardName(shown)} is already revealed on this deck — move it first`,
  };
}

function cardName(card: CardView): string {
  const face = card.code ? knownCard(card.code)?.card.faces[card.face] : undefined;
  return face?.name ?? 'A card';
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

/** Search… opens a private view: the server sends the cards (5c shows the box). */
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

/** Browse… needs no server: victory and set-aside piles are face up, their cards listed. */
function browseItem(): ActionItem {
  return {
    id: 'browse',
    label: 'Browse…',
    key: 'K',
    tip: 'Browse…',
    group: 0,
    run: () => ({ local: 'browseBox' }),
  };
}

function shuffleInItem(pile: PileView): ActionItem {
  return {
    id: 'shuffleIn',
    label: 'Shuffle in',
    tip: 'Shuffle all these cards into the encounter deck',
    group: 0,
    run: () => ({ kind: 'shuffleIn', pile: pile.id }),
  };
}
