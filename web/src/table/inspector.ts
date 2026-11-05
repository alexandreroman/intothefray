// What the inspector (CardSheet.svelte) shows of a card or a pile on a touch
// screen, beside the entries of its context menu (contextItems.ts): the
// counters a card carries, with steppers, and the split of the entries into the
// large buttons of the first group and the rows of the others. Pure.

import type { CardView } from '../lib/types';
import { counterName, countersOf, MODIFIERS, STATUSES, TOKENS, type CounterKind } from './actions';
import type { ContextAction, ContextEntry } from './contextItems';

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

/** The most large buttons in a row, from the first group of entries. */
const MAX_MAIN = 4;

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
      counters.push({ kind, name, label: labelOf(kind, name), value, signed: kind === 'modifier' });
    }
  }
  return counters;
}

/** A modifier by its stat alone, beside its signed value ("DEF"); a token or status as the pill names it. */
function labelOf(kind: CounterKind, name: string): string {
  if (kind === 'modifier') {
    return name.toUpperCase();
  }
  const spelt = counterName(kind, name);
  return spelt.charAt(0).toUpperCase() + spelt.slice(1);
}

/**
 * Splits the entries into the main actions, the large buttons, and the rest,
 * the rows below them. The main actions are the first group's actions, at
 * most four, up to its first submenu; the rest starts where they end, without
 * the separator that closed their group.
 */
export function splitEntries(entries: ContextEntry[]): {
  main: ContextAction[];
  rest: ContextEntry[];
} {
  const main: ContextAction[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'action' || main.length === MAX_MAIN) {
      break;
    }
    main.push(entry);
  }
  const rest = entries.slice(main.length);
  if (main.length > 0 && rest[0]?.kind === 'separator') {
    rest.shift();
  }
  return { main, rest };
}
