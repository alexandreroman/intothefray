// Where dock mode draws a table card's tokens, statuses and modifiers. The card is small there
// (DOCK_SCALE) while its numbers keep 11 screen px, so the desktop corner pile and edge
// tabs would cover one another: each group gets a region of its own instead, inside the card.
//
// - The tokens stand in a column along the right edge, discs touching: bottom-up from the corner,
//   damage first; on a scheme top-down from the corner, the threat first.
// - The statuses lie in a row along the top edge from the left, under the title band, each a chip
//   with its initial: "S", "T×2", "R2".
// - The modifiers stand in a column along the left edge from the bottom, each badge as wide as its
//   whole text ("+1 ATK"), all of it at 11 px. A badge wider than the room left of the tokens
//   stands out of the card's left edge, as on the desktop table, up to the neighbouring card slot.
//
// The statuses take the top-left corner, the modifiers the bottom-left one. A group with more than
// its region holds shows what fits but one, then a "+N": the inspector shows them all. A text is
// never cut: a modifier badge too wide for its room goes into the "+N" too.
//
// Everything is in screen px, in the card's own frame (upright, from its top-left corner): an
// exhausted card turns its layout with it.

import type { CardView } from '../lib/types';
import { MODIFIER_BADGES, statusCount, STATUSES, withSign, type TokenName } from './actions';

/** The font size of every number, status initial and modifier: the readable floor on a phone. */
const NUMBER_PX = 11;

/** A token's diameter: its number with a rim around it. */
const DISC = 16.5;

/** How far every region keeps from the card's edges. */
const INSET = 1.5;

/** The room between two chips, and between the token column and the regions on its left. */
const GAP = 1;

/** A status or modifier chip's height. */
const CHIP_HEIGHT = 14;

/** The room on either side of a chip's text, its border included. */
const CHIP_PADDING = 2;

/** The card's title band, which the status row stays under, as a share of its height. */
const TITLE_BAND = 0.1;

/** The tokens in the order they leave the corner: damage in it on any card, the threat on a scheme. */
const TOKEN_ORDER: readonly TokenName[] = ['dmg', 'thr', 'acc', 'gen'];
const SCHEME_TOKEN_ORDER: readonly TokenName[] = ['thr', 'acc', 'dmg', 'gen'];

/** A box in screen px, from the card's top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How wide a text shows at a font size, in px. */
type MeasureText = (text: string, px: number) => number;

interface PlacedToken {
  name: TokenName;
  count: number;
  box: Box;
}

interface PlacedStatus {
  name: string;
  /** Its initial, with its value or count: "S", "R2", "T×2". */
  text: string;
  box: Box;
}

interface PlacedModifier {
  name: string;
  /** Its signed value: "+1", "−2". The badge reads it, a space, then its stat: "+1 ATK". */
  value: string;
  /** Its stat: "ATK". */
  stat: string;
  box: Box;
}

/** The "+N" ending a group that does not fit its region: N items left out. */
export interface More {
  hidden: number;
  box: Box;
}

interface Group<T> {
  items: T[];
  more: More | null;
}

export interface DockCounterLayout {
  tokens: Group<PlacedToken>;
  statuses: Group<PlacedStatus>;
  modifiers: Group<PlacedModifier>;
}

interface DockCounterInput {
  /** The card's drawn size, in screen px. */
  width: number;
  height: number;
  /** The room left of the card up to the neighbouring slot, in screen px: the modifiers' reach. */
  leftRoom: number;
  /** A scheme carries its threat in the top right corner. */
  scheme: boolean;
  counters: Pick<CardView, 'tokens' | 'status' | 'mods'>;
  measure: MeasureText;
}

/** The text of the "+N" that stands for N items left out. */
export function moreText(hidden: number): string {
  return `+${hidden}`;
}

/** Places a card's tokens, statuses and modifiers in their three regions. */
export function dockCounterLayout(input: DockCounterInput): DockCounterLayout {
  const { width, height, leftRoom, scheme, counters, measure } = input;
  const column = { x: width - INSET - DISC, top: INSET, bottom: height - INSET };
  // The statuses and the modifiers share the room left of the token column.
  const left = { x: INSET, right: column.x - GAP };
  const statusTop = height * TITLE_BAND;
  const modifierTop = statusTop + CHIP_HEIGHT + GAP;

  return {
    tokens: placeTokens(counters.tokens ?? {}, scheme, column),
    statuses: placeStatuses(counters.status ?? {}, statusTop, left, measure),
    // The modifiers may stand out of the left edge, as far as INSET short of the neighbouring slot.
    modifiers: placeModifiers(
      counters.mods ?? {},
      {
        x: INSET,
        minX: INSET - leftRoom,
        right: left.right,
        top: modifierTop,
        bottom: column.bottom,
      },
      measure,
    ),
  };
}

function placeTokens(
  tokens: Record<string, number>,
  scheme: boolean,
  column: { x: number; top: number; bottom: number },
): Group<PlacedToken> {
  const order = scheme ? SCHEME_TOKEN_ORDER : TOKEN_ORDER;
  const shown = order.filter((name) => (tokens[name] ?? 0) > 0);
  const fit = fitCount(
    shown.map(() => DISC),
    () => DISC,
    column.bottom - column.top,
    0,
  );
  // The n-th disc from the corner: down from the top on a scheme, up from the bottom otherwise.
  const discAt = (n: number): Box => {
    const offset = n * DISC;
    const y = scheme ? column.top + offset : column.bottom - offset - DISC;
    return { x: column.x, y, w: DISC, h: DISC };
  };
  return {
    items: shown
      .slice(0, fit.shown)
      .map((name, n) => ({ name, count: tokens[name] ?? 0, box: discAt(n) })),
    more: fit.more ? { hidden: shown.length - fit.shown, box: discAt(fit.shown) } : null,
  };
}

/** A status chip's text: its initial, then its value (Retaliate) or its count when above one. */
function statusText(name: string, label: string, count: number): string {
  return label.charAt(0) + (statusCount(name, count) ?? '');
}

function placeStatuses(
  status: Record<string, number>,
  top: number,
  row: { x: number; right: number },
  measure: MeasureText,
): Group<PlacedStatus> {
  const shown = STATUSES.filter(({ name }) => (status[name] ?? 0) > 0).map(({ name, label }) => ({
    name,
    text: statusText(name, label, status[name] ?? 0),
  }));
  const chipWidth = (text: string) => chipWidthOf(text, measure);
  const widths = shown.map(({ text }) => chipWidth(text));
  const fit = fitCount(widths, (hidden) => chipWidth(moreText(hidden)), row.right - row.x, GAP);

  const items: PlacedStatus[] = [];
  let x = row.x;
  for (const [n, status] of shown.slice(0, fit.shown).entries()) {
    const w = widths[n] ?? 0;
    items.push({ ...status, box: { x, y: top, w, h: CHIP_HEIGHT } });
    x += w + GAP;
  }
  const hidden = shown.length - fit.shown;
  const more = fit.more
    ? { hidden, box: { x, y: top, w: chipWidth(moreText(hidden)), h: CHIP_HEIGHT } }
    : null;
  return { items, more };
}

/** The width of a status or modifier chip around its text, at NUMBER_PX. */
function chipWidthOf(text: string, measure: MeasureText): number {
  return measure(text, NUMBER_PX) + 2 * CHIP_PADDING;
}

/**
 * Places the modifier badges in a column up from the bottom-left corner. The column starts at the
 * region's x, or further left when its widest badge needs it, never left of minX; a badge wider
 * than the room from minX to the right edge does not show, it is counted in the "+N".
 */
function placeModifiers(
  mods: Record<string, number>,
  region: { x: number; minX: number; right: number; top: number; bottom: number },
  measure: MeasureText,
): Group<PlacedModifier> {
  const room = region.right - region.minX;
  const badges = MODIFIER_BADGES.filter((name) => (mods[name] ?? 0) !== 0).map((name) => {
    const value = withSign(mods[name] ?? 0);
    const stat = name.toUpperCase();
    return { name, value, stat, w: chipWidthOf(`${value} ${stat}`, measure) };
  });
  const fitting = badges.filter(({ w }) => w <= room);

  // All the chips have the same height: count how many the column holds, the "+N" included.
  const capacity = Math.max(
    0,
    Math.floor((region.bottom - region.top + GAP) / (CHIP_HEIGHT + GAP)),
  );
  const allShow = fitting.length === badges.length && badges.length <= capacity;
  const shown = allShow ? fitting : fitting.slice(0, Math.max(0, capacity - 1));
  const hidden = badges.length - shown.length;
  const moreWidth = chipWidthOf(moreText(hidden), measure);
  // A column with no room holds nothing, not even the "+N".
  if (badges.length === 0 || capacity === 0 || moreWidth > room) {
    return { items: [], more: null };
  }

  const columnWidth = Math.max(...shown.map(({ w }) => w), hidden > 0 ? moreWidth : 0);
  const x = Math.max(region.minX, Math.min(region.x, region.right - columnWidth));
  // The n-th chip from the bottom-left corner, upwards.
  const yAt = (n: number) => region.bottom - CHIP_HEIGHT - n * (CHIP_HEIGHT + GAP);

  const items = shown.map(({ name, value, stat, w }, n): PlacedModifier => ({
    name,
    value,
    stat,
    box: { x, y: yAt(n), w, h: CHIP_HEIGHT },
  }));
  const more =
    hidden > 0 ? { hidden, box: { x, y: yAt(shown.length), w: moreWidth, h: CHIP_HEIGHT } } : null;
  return { items, more };
}

/**
 * How many items of a line show in a room: all of them when they fit, else as many as fit with a
 * "+N" after them (more), else none at all.
 */
function fitCount(
  lengths: readonly number[],
  moreLength: (hidden: number) => number,
  room: number,
  gap: number,
): { shown: number; more: boolean } {
  const lineLength = (parts: readonly number[]) =>
    parts.reduce((sum, length) => sum + length, 0) + gap * Math.max(0, parts.length - 1);

  if (lineLength(lengths) <= room) {
    return { shown: lengths.length, more: false };
  }
  for (let shown = lengths.length - 1; shown >= 0; shown--) {
    const parts = [...lengths.slice(0, shown), moreLength(lengths.length - shown)];
    if (lineLength(parts) <= room) {
      return { shown, more: true };
    }
  }
  return { shown: 0, more: false };
}

const measureCache = new Map<string, number>();
let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * How wide a chip's text shows, in its font (CardView's dock chips: system-ui, weight 800, 75 %
 * wide), measured on a canvas and remembered. Without a canvas (tests), an estimate on the wide
 * side: a chip then only gets roomier.
 */
export function measureChipText(text: string, px: number): number {
  const key = `${px} ${text}`;
  const known = measureCache.get(key);
  if (known !== undefined) {
    return known;
  }
  if (measureContext === undefined) {
    measureContext =
      typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  }
  let width = text.length * px * 0.7;
  if (measureContext) {
    measureContext.font = `800 ${px}px system-ui, sans-serif`;
    measureContext.fontStretch = 'condensed';
    width = measureContext.measureText(text).width;
  }
  measureCache.set(key, width);
  return width;
}
