// What the inspector (CardSheet.svelte) shows of a card or a pile on a touch
// screen, beside the entries of its context menu (contextItems.ts): the
// counters a card carries, with steppers, the entries it shows, in their
// groups, and the stack the card belongs to, shown as a carousel in place of
// it. Pure.

import type { CardView } from '../lib/types';
import {
  ARROW_ID,
  counterLabel,
  countersOf,
  MODIFIERS,
  STATUSES,
  TOKENS,
  type ActionItem,
  type CounterKind,
} from './actions';
import type { ContextAction, ContextEntry, ContextSeparator, ContextSubmenu } from './contextItems';
import { mainCardOf, stackOf } from './drag';

/** A token, status or modifier a card carries, as the inspector shows it with its steppers. */
export interface SheetCounter {
  kind: CounterKind;
  /** Its name in the card's counters and in the actions: 'dmg', 'stunned', 'def'. */
  name: string;
  /** What the row says: "Damage", "Stunned", "DEF". */
  label: string;
  value: number;
  /** A modifier: shown with its sign, "+1", "−2". */
  signed: boolean;
}

/** A card of the inspected card's stack, as the inspector's carousel draws it. */
export interface StackCard {
  id: string;
  /** What the inspector's header names it: a face-down card's name stays hidden. */
  name: string;
  /** Its face, or its back when it lies face down. */
  images: string[];
  landscape: boolean;
  /** The tokens, statuses and modifiers it carries (countersFor), drawn on it in the carousel. */
  counters?: SheetCounter[];
  /** It is a scheme, its tokens in a scheme's places (ContextHeader.scheme). */
  scheme?: boolean;
  /** It is exhausted: the carousel draws it tilted. */
  exhausted?: boolean;
  /** It can tilt (actions.canExhaust): its place in the carousel keeps the room of its tilted bounds. */
  tilts?: boolean;
}

const TOKEN_NAMES = TOKENS.map((token) => token.name);
const STATUS_NAMES = STATUSES.map((status) => status.name);

/**
 * The counters the card carries, in the order of its menus: the tokens, the
 * statuses, then the modifiers. A counter at zero is left out.
 */
export function countersFor(card: CardView): SheetCounter[] {
  return [
    ...carried(card, 'token', TOKEN_NAMES),
    ...carried(card, 'status', STATUS_NAMES),
    ...carried(card, 'modifier', MODIFIERS),
  ];
}

/** The counters of one kind the card carries, in the order of the names. */
function carried(card: CardView, kind: CounterKind, names: readonly string[]): SheetCounter[] {
  const values = countersOf(card, kind) ?? {};
  const counters: SheetCounter[] = [];
  for (const name of names) {
    const value = values[name] ?? 0;
    if (value !== 0) {
      counters.push({
        kind,
        name,
        label: counterLabel(kind, name),
        value,
        signed: kind === 'modifier',
      });
    }
  }
  return counters;
}

/**
 * The entries the inspector shows: a refused (disabled) entry takes room for
 * nothing on a small screen, so it is left out, rather than greyed with its
 * reason as the floating menu has it. Draw an arrow is left out too: arrows
 * are not offered on touch. A submenu goes when it is refused or none of its
 * entries is left. No separator leads, trails or follows another.
 */
export function visibleEntries(entries: ContextEntry[]): ContextEntry[] {
  const shown: ContextEntry[] = [];
  for (const entry of entries) {
    const visible = visibleEntry(entry);
    if (visible !== undefined) {
      shown.push(visible);
    }
  }
  return withTidySeparators(shown);
}

/** The entry as the inspector shows it, or nothing: a submenu keeps only its allowed entries. */
function visibleEntry(entry: ContextEntry): ContextEntry | undefined {
  switch (entry.kind) {
    case 'separator':
      return entry;
    case 'action':
      return isOffered(entry.item) ? entry : undefined;
    case 'submenu': {
      if (entry.disabled) {
        return undefined;
      }
      const allowed = entry.entries.filter(
        (sub) => sub.kind === 'separator' || isOffered(sub.item),
      );
      const subEntries = withTidySeparators(allowed);
      return subEntries.length === 0 ? undefined : { ...entry, entries: subEntries };
    }
  }
}

/** Whether the inspector offers the item: it is allowed, and not Draw an arrow. */
function isOffered(item: ActionItem): boolean {
  return !item.disabled && item.id !== ARROW_ID;
}

/** The entries without a separator at either end or right after another one. */
function withTidySeparators<T extends ContextEntry>(entries: T[]): T[] {
  const tidy: T[] = [];
  for (const entry of entries) {
    const previous = tidy.at(-1);
    if (isSeparator(entry) && (previous === undefined || isSeparator(previous))) {
      continue;
    }
    tidy.push(entry);
  }
  const last = tidy.at(-1);
  if (last !== undefined && isSeparator(last)) {
    tidy.pop();
  }
  return tidy;
}

function isSeparator(entry: ContextEntry): entry is ContextSeparator {
  return entry.kind === 'separator';
}

/** An entry of a group: an action or a submenu, anything but the separator between groups. */
export type GroupEntry = ContextAction | ContextSubmenu;

/**
 * The entries in their groups, in their order: each group the entries between
 * two separators, which the inspector lays out as a grid of its own. No group
 * is empty.
 */
export function entryGroups(entries: readonly ContextEntry[]): GroupEntry[][] {
  const groups: GroupEntry[][] = [];
  let current: GroupEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'separator') {
      if (current.length > 0) {
        groups.push(current);
      }
      current = [];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/**
 * The cards of the stack the table card belongs to, the main card first, then
 * its chain in order (drag.ts stackOf), whichever card of it is given; none
 * for a card on its own or one not in the cards.
 */
export function stackCardsOf(id: string, cards: readonly CardView[]): string[] {
  const card = cards.find((c) => c.id === id);
  if (card === undefined) {
    return [];
  }
  const stack = stackOf(mainCardOf(card, cards).id, cards);
  return stack.length > 1 ? stack : [];
}
