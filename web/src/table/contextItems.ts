// The context menu of a table card or pile: every action of the element, in
// the order of its action bar and from the same items (actions.ts), so that
// both share their permissions, their reasons and what they run. The bar
// stays the main path; the menu is the complete, labelled list. Pure:
// ContextMenu.svelte draws it.

import type { CardView, PackFace, PileView, View } from '../lib/types';
import { arrowItem, sideLabel, type ActionItem, type TableElement } from './actions';
import { pileLabel, stageLabel } from './boxes';
import { isHidden } from './face';
import { ownerLook } from './seats';

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
 * The header of a menu: an eyebrow saying what the element is (a card's type
 * and stage) or whose it is (a pile's owner), in its owner's colour, over its
 * name; a pile's card count beside it.
 */
export interface ContextHeader {
  /** "Villain · Stage I", "Ally", "Face down"; a pile's owner: "Villain", "Alex · Black Panther". */
  eyebrow: string;
  /** The card's name without its stage, or the pile's kind: "Rhino", "Deck", "Encounter discard". */
  name: string;
  /** A pile's number of cards. */
  count?: number;
  /** CSS colour of the eyebrow: the owner's seat colour, the villain's for the encounter. */
  color: string;
  /** The menu's accessible name, the header in one line: "Rhino, Villain, stage I", "Your deck, 34 cards". */
  label: string;
}

/** How the eyebrow names the card types; any other type is spelt from its code (typeLabel). */
const TYPE_LABELS: Record<string, string> = {
  villain: 'Villain',
  main_scheme: 'Main scheme',
  side_scheme: 'Side scheme',
  minion: 'Minion',
  hero: 'Hero',
  alter_ego: 'Alter ego',
  ally: 'Ally',
  upgrade: 'Upgrade',
  support: 'Support',
  event: 'Event',
  resource: 'Resource',
  treachery: 'Treachery',
  attachment: 'Attachment',
  environment: 'Environment',
  obligation: 'Obligation',
};

/** How the header names a pile's kind: the pile's owner is in the eyebrow. */
const PILE_NAMES: Record<Exclude<PileView['kind'], 'sideDeck' | 'sideDiscard'>, string> = {
  deck: 'Deck',
  discard: 'Discard',
  encounter: 'Encounter deck',
  encounterDiscard: 'Encounter discard',
  victory: 'Victory display',
  aside: 'Set-aside cards',
};

/** How the header names a pile: a side pile after its side deck, "Invocation deck". */
function pileName(pile: PileView): string {
  switch (pile.kind) {
    case 'sideDeck':
      return `${sideLabel(pile)} deck`;
    case 'sideDiscard':
      return `${sideLabel(pile)} discard`;
    default:
      return PILE_NAMES[pile.kind];
  }
}

/**
 * The header of a card's menu, in its owner's colour: its type and stage over
 * its name in the viewer's language ("Villain · Stage I" over "Rhino"), as the
 * stage choice words the stage. `face` is the face it shows, as the table
 * draws it; null while it is unknown, or hidden.
 */
export function cardHeader(card: CardView, face: PackFace | null, view: View): ContextHeader {
  const color = ownerLook(view, card.owner).color;
  if (isHidden(card)) {
    return { eyebrow: 'Face down', name: 'Face-down card', color, label: 'Face-down card' };
  }
  if (!face) {
    return { eyebrow: 'Card', name: 'Unknown card', color, label: 'Unknown card' };
  }
  const type = typeLabel(face.type);
  const stage = stageLabel(face);
  if (!stage) {
    return { eyebrow: type, name: face.name, color, label: `${face.name}, ${type}` };
  }
  return {
    eyebrow: `${type} · ${capitalize(stage)}`,
    name: face.name,
    color,
    label: `${face.name}, ${type}, ${stage}`,
  };
}

/**
 * The header of a pile's menu, in its owner's colour: its owner as their
 * frame names them over its kind and its count ("Villain" over "Encounter
 * deck (29)"); named from the viewer's side for screen readers ("Your deck, 34 cards").
 */
export function pileHeader(pile: PileView, view: View): ContextHeader {
  const owner = ownerLook(view, pile.owner);
  const cards = pile.count === 1 ? 'card' : 'cards';
  return {
    eyebrow: owner.name,
    name: pileName(pile),
    count: pile.count,
    color: owner.color,
    label: `${pileLabel(pile, view)}, ${pile.count} ${cards}`,
  };
}

/** A card type as the eyebrow says it: "Main scheme"; an unknown one from its code, "Player side scheme". */
function typeLabel(type: string): string {
  const known = TYPE_LABELS[type];
  if (known) {
    return known;
  }
  const spelt = capitalize(type.replaceAll('_', ' '));
  return spelt === '' ? 'Card' : spelt;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
