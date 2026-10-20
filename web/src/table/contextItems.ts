// The context menu of a table card or pile: every action of the element, in
// the order of its action bar and from the same items (actions.ts), so that
// both share their permissions, their reasons and what they run. The bar
// stays the main path; the menu is the complete, labelled list. Pure:
// ContextMenu.svelte draws it.

import type { CardView, PackFace, PileView, View } from '../lib/types';
import { arrowItem, type ActionItem, type TableElement } from './actions';
import { pileLabel, stageFaceName } from './boxes';
import { isHidden } from './face';

/** An entry that runs its item when chosen. */
export interface ContextAction {
  kind: 'action';
  item: ActionItem;
}

/** A line between two groups of entries. */
export interface ContextSeparator {
  kind: 'separator';
}

/** A row that opens a list of its own: one level deep, its entries run their items. */
export interface ContextSubmenu {
  kind: 'submenu';
  id: string;
  label: string;
  disabled: boolean;
  /** Why it is disabled, as the bar's tooltip says it. */
  tip?: string;
  entries: (ContextAction | ContextSeparator)[];
}

export type ContextEntry = ContextAction | ContextSeparator | ContextSubmenu;

/**
 * The bar dropdown whose items the menu shows inline: "More actions" (⋯), the
 * last group of a deck's bar. A submenu would hide them again.
 */
const FLATTENED_MENU = 'more';

/** The submenu each section of a bar dropdown becomes: the token menu splits in two. */
const SECTION_SUBMENUS: Record<string, string> = {
  Tokens: 'Add a token',
  Status: 'Add a status',
};

const SEPARATOR: ContextSeparator = { kind: 'separator' };

/**
 * The entries of an element's context menu, from the items its bar offers:
 * the bar's order, a separator between its groups. A dropdown becomes a
 * submenu, the token menu one per section; the ⋯ dropdown shows its items
 * inline. A card in play gets a last group, Draw an arrow. Nothing for an
 * element without actions, or one that belongs to someone else.
 */
export function contextItems(
  element: TableElement,
  items: ActionItem[] | { text: string },
): ContextEntry[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  // Only a player gets a card's actions (actionsFor): they may draw arrows from it, too.
  const all = element.kind === 'card' ? [...items, arrowItem(element.id)] : items;

  const groups: ContextEntry[][] = [];
  let lastGroup: number | null = null;
  for (const item of all) {
    const entries = entriesOf(item);
    const current = groups.at(-1);
    if (current && item.group === lastGroup) {
      current.push(...entries);
    } else {
      groups.push(entries);
    }
    lastGroup = item.group;
  }
  return groups.flatMap((group, i) => (i === 0 ? group : [SEPARATOR, ...group]));
}

/** What one bar item becomes in the menu. */
function entriesOf(item: ActionItem): ContextEntry[] {
  if (!item.menu) {
    return [{ kind: 'action', item }];
  }
  if (item.id === FLATTENED_MENU) {
    // Its separator only parted two rare actions: inline, the group reads better without it.
    return item.menu.filter((choice) => choice.id !== 'sep').map((choice) => action(choice));
  }
  if (item.menu.some((choice) => choice.section !== undefined)) {
    return sectionsOf(item.menu).map((section) => {
      const name = section.name ?? item.label;
      return submenu(item, `${item.id}:${name}`, SECTION_SUBMENUS[name] ?? name, section.choices);
    });
  }
  return [submenu(item, item.id, item.label, item.menu)];
}

/** A dropdown's items, cut where their section changes, as the bar's dropdown heads them. */
function sectionsOf(menu: ActionItem[]): { name?: string; choices: ActionItem[] }[] {
  const sections: { name?: string; choices: ActionItem[] }[] = [];
  for (const choice of menu) {
    const last = sections.at(-1);
    if (last && last.name === choice.section) {
      last.choices.push(choice);
    } else {
      sections.push({ name: choice.section, choices: [choice] });
    }
  }
  return sections;
}

function submenu(
  parent: ActionItem,
  id: string,
  label: string,
  choices: ActionItem[],
): ContextSubmenu {
  return {
    kind: 'submenu',
    id,
    label,
    disabled: parent.disabled ?? false,
    tip: parent.disabled ? parent.tip : undefined,
    entries: choices.map((choice) => (choice.id === 'sep' ? SEPARATOR : action(choice))),
  };
}

function action(item: ActionItem): ContextAction {
  return { kind: 'action', item };
}

// ---- The header ----

/**
 * The header of a card's menu: its name in the viewer's language, a stage
 * card's with its stage ("Rhino (stage I)", "The Break-In! (1A)"), as the
 * stage choice and the history name it. `face` is the face it shows, as the
 * table draws it; null while it is unknown.
 */
export function cardTitle(card: CardView, face: PackFace | null): string {
  if (isHidden(card)) {
    return 'Face-down card';
  }
  return face ? stageFaceName(face, card.face) : 'Card';
}

/** The header of a pile's menu: its name from the viewer's side and its count, "Your deck (34)". */
export function pileTitle(pile: PileView, view: View): string {
  return `${pileLabel(pile, view)} (${pile.count})`;
}
