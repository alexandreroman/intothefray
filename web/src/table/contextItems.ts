// The context menu of a table card or pile, or of a card box's tile: every
// action of the element, from the items its keys share (actions.ts, boxes.ts),
// so that both have the same permissions, reasons and outcomes. Pure:
// ContextMenu.svelte draws it.

import type { CardView, PackFace, PileView, View } from '../lib/types';
import { arrowItem, deckCount, sideLabel, type ActionItem, type TableElement } from './actions';
import { pileLabel, stageLabel, type TileAction } from './boxes';
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
  /** Why it is disabled, shown with it. */
  reason?: string;
  entries: (ContextAction | ContextSeparator)[];
}

export type ContextEntry = ContextAction | ContextSeparator | ContextSubmenu;

const SEPARATOR: ContextSeparator = { kind: 'separator' };

/**
 * The entries of an element's context menu, from its actions (actionsFor):
 * their order, a separator between their groups. An item with a list of its
 * own becomes a submenu. A card in play gets a last group, Draw an arrow.
 * Nothing for an element without actions, or one that belongs to someone else.
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
  return grouped(all);
}

// The groups of a tile's menu: what takes the card (Draw, Play), then what sends it away.
const TILE_TAKE = 0;
const TILE_AWAY = 1;

/**
 * The entries of a box tile's context menu, from its actions (tileActions),
 * in their order: Draw and Play, then a separator before the ones that send
 * the card away (Discard, Put at the bottom of the deck, Shuffle into
 * deck). Play is the default: what a tile is most often taken out for.
 */
export function tileEntries(actions: readonly TileAction[]): ContextEntry[] {
  const items = actions.map((action): ActionItem => {
    const takes = action.id === 'draw' || action.id === 'play';
    const item: ActionItem = {
      id: action.id,
      label: action.label,
      group: takes ? TILE_TAKE : TILE_AWAY,
      run: action.run,
    };
    return action.id === 'play' ? { ...item, default: true } : item;
  });
  return grouped(items);
}

/** The entries of the items, in their order, a separator where their group changes. */
function grouped(items: readonly ActionItem[]): ContextEntry[] {
  const groups: ContextEntry[][] = [];
  let lastGroup: number | null = null;
  for (const item of items) {
    const entry = entryOf(item);
    const current = groups.at(-1);
    if (current && item.group === lastGroup) {
      current.push(entry);
    } else {
      groups.push([entry]);
    }
    lastGroup = item.group;
  }
  return groups.flatMap((group, i) => (i === 0 ? group : [SEPARATOR, ...group]));
}

/** What one action item becomes in the menu: an entry, or a submenu for an item with a list. */
function entryOf(item: ActionItem): ContextEntry {
  if (!item.menu) {
    return action(item);
  }
  return {
    kind: 'submenu',
    id: item.id,
    label: item.label,
    disabled: item.disabled ?? false,
    reason: item.disabled ? item.reason : undefined,
    entries: item.menu.map((choice) => (choice.id === 'sep' ? SEPARATOR : action(choice))),
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
 * A card revealed on a deck counts as its top card, as the menu's limits have it (deckCount).
 */
export function pileHeader(pile: PileView, view: View): ContextHeader {
  const owner = ownerLook(view, pile.owner);
  const count = view.table ? deckCount(pile, view.table) : pile.count;
  const cards = count === 1 ? 'card' : 'cards';
  return {
    eyebrow: owner.name,
    name: pileName(pile),
    count,
    color: owner.color,
    label: `${pileLabel(pile, view)}, ${count} ${cards}`,
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
