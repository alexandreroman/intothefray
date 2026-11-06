// The compact, wrapped phone layout (spec 3.7): dock mode draws the table through one projection,
// from table units to drawn units, and back for drops. Everything is drawn at DOCK_SCALE. Each row
// keeps its owner frames and piles at their scaled place on its first line; past them, its units (a
// card with everything that travels with it, or a frame with its piles) flow in their order on the
// table, top-aligned, on the half columns of a grid every row shares: from the left of the frames
// and piles, half a drawn card slot apart, each unit's box on a half column (an exhausted card
// turns in place), a unit taking as many half columns as its drawn width needs, two at least (a
// portrait card, a small stack or an exhausted card a slot, a landscape card three).
// The first line starts at the first half column past the frames and piles, the others at the
// first one, under them, so that cards line up down the lines and across the rows; a unit that does
// not fit the wrap width starts the next line. An empty card slot follows the last unit, and a row
// whose units all fit its first line keeps an empty second line under it, room to drop a card after
// them. Rows are as tall as their content and stack one under the other. A row no seat has, below
// a seat's (a card dropped under the last player's band), is drawn in the block of the last seat
// row above it: its units flow after that row's own. Shared positions never change: only where
// they are drawn does, and a drop on a row is an insertion among its units (insertAt), placed on
// the table so that it sorts there, in the band of the row it is shown in.
// A frame takes, in its row, the wider of its drawn width and its owner line's (lineWidths): the line
// above it starts at its left edge, and what follows it starts past both, on a half column, so that
// no owner line runs over the next frame or a card.
// During a drag the rows show the drop before it is let go (spec 3.8): laid out with the dragged
// card where the drop would put it, as if it lay there already, the units after it pushed along
// and the slot it left closed up.

import { DOCK_SCALE, type Placement } from './dockPiles';
import { GRID, PORTRAIT_CARD, SLOT_GAP, visualBox } from './layout';
import { ROW_LABEL_ROOM, rowHeight, rowOf, rowTop } from './rows';

/** The room above a row's lines for its owner names, in drawn units. */
export const DOCK_NAME_ROOM = 12;

/** The gap under each line of a row, in drawn units: room for an exhausted card's corners. */
export const DOCK_LINE_GAP = 16;

/** The gap under each row, in drawn units. */
export const DOCK_ROW_GAP = 20;

/** Something drawn on the table, in table units. */
export interface DockItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A frame is an owner frame, the box around its piles. */
  kind: 'card' | 'pile' | 'frame' | 'marker';
  /**
   * The id of the item this one travels with: a tucked card's main card, a
   * marker's card, a pile's frame. It is drawn with that item, at the same
   * offset from it.
   */
  anchor?: string;
  /** An exhausted card is drawn turned (visualBox): its slot is as wide as it shows. */
  exhausted?: boolean;
}

/**
 * A drag the layout shows as if dropped (spec 3.8): the dragged card where the drop would put it on
 * the table, with everything that travels with it, out of the unit it was part of.
 */
export interface DockPreview {
  /** The dragged card: a table card, or a card not on the table yet (from a hand or a pile). */
  unitId: string;
  /** Where the drop puts its corner on the table (insertAt), in table units. */
  insertAt: Point;
  /** The size of a card not on the table yet, in table units: it needs one to be drawn. */
  size?: { w: number; h: number };
}

export interface DockLayoutInput {
  items: readonly DockItem[];
  /** A drag shown as if dropped; none unless given. */
  preview?: DockPreview;
  /** The rows of the table shown, top to bottom: blocks (blockRowOf), never a folded row. */
  rows: readonly number[];
  /** The rows the seats' decks lie in (rowOfSeat); none unless given, so that no row is folded. */
  seatRows?: readonly number[];
  /** The width a row wraps at, in drawn units. */
  wrapWidth: number;
  /** Drawn units per table unit: DOCK_SCALE unless given. */
  scale?: number;
  rowGap?: number;
  lineGap?: number;
  nameRoom?: number;
  /**
   * The drawn width of each frame's owner line, by frame id, from the frame's left edge; a frame
   * without one has a line no wider than itself.
   */
  lineWidths?: ReadonlyMap<string, number>;
}

export interface Point {
  x: number;
  y: number;
}

/** Where the table is drawn, in drawn units. */
export interface DockLayout {
  /**
   * Where a point of the table is drawn, or null when its row is not shown.
   * A point of an item, named by its id, is drawn with that item; any other
   * point with the unit of its row it lies past, or with the frames and piles
   * when it lies left of every unit.
   */
  toDisplay(p: Point, itemId?: string): Point | null;
  /**
   * The point of the table drawn at a point: toDisplay inverted, with the
   * unit of its line the point lies past (the first one when it lies left of
   * them all, the row's last one on a line that holds only the empty slot).
   * A point below the last line counts in it, and the point stays within its
   * row's band of the table.
   */
  toTable(p: Point): Point;
  /**
   * Where a card `width` table units wide, dropped with its middle drawn at
   * `p`, goes on the table: in the row and the line of `p`, before the first
   * unit whose half columns' middle lies right of it (else after the line's last
   * unit), placed so that it sorts exactly there. The units of `exclude`
   * (what is dragged) are left out, and its cards from the units they are
   * part of; a card dropped back between the units around it keeps its spot.
   */
  insertAt(p: Point, width: number, exclude?: ReadonlySet<string>): Point;
  /** The drawn box of an item, or null when its row is not shown. */
  itemBox(id: string): Placement | null;
  /** The drawn top of a row, or null when it is not shown. */
  rowTop(row: number): number | null;
  /** The drawn height of a row: its name room, its lines and its gap; null when it is not shown. */
  rowHeight(row: number): number | null;
  /** The drawn x a row's first line starts its units at, or null when it is not shown. */
  indent(row: number): number | null;
  /** The drawn height of every shown row. */
  readonly height: number;
  /** How far right the drawn items and the empty slot after each row reach. */
  readonly width: number;
}

/**
 * What flows in a row: an item that travels with no other, and every item
 * that travels with it. Its extent is in table units: across as it shows (an
 * exhausted card turned), down as it lies.
 */
interface Unit {
  root: DockItem;
  members: DockItem[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** How far left of its boxes its turned cards reach, in table units. */
  lead: number;
  /** The line it is drawn on, its slot's drawn left edge and width: as far across as it shows. */
  line: number;
  slotX: number;
  slotW: number;
  /** The drawn x of the half column its box starts on, and the width of its half columns less the gap after them. */
  cellX: number;
  cellW: number;
  /** How far right of its scaled table x it is drawn. */
  dx: number;
  /** The row of the table it lies in, and whether that row is folded into the block it is drawn in. */
  tableRow: number;
  folded: boolean;
}

/** A line of a row, in drawn units: the units on it lie `inset` under its top. */
interface Line {
  top: number;
  height: number;
  inset: number;
}

/** A shown row of the table and where it is drawn. */
interface Row {
  /** The row of the table, the block's own. */
  number: number;
  tableTop: number;
  tableHeight: number;
  /** Where its cards lie on the table, as the setup puts them (ROW_LABEL_ROOM under its top). */
  cardY: number;
  top: number;
  height: number;
  indent: number;
  lines: Line[];
  /** The frames and piles left of its units, drawn on its first line at their scaled place, or pushed right. */
  fixed: DockItem[];
  /** Where its groups of frames and piles are drawn: by their left edge on the table, ascending. */
  fixedPlaces: FixedPlace[];
  /** How far right they reach on the table; null without them. */
  fixedRight: number | null;
  units: Unit[];
}

/** An item of a shown row, and its unit unless it is one of the row's fixed frames and piles. */
interface Placed {
  item: DockItem;
  row: Row;
  unit: Unit | null;
}

function isLeading(item: DockItem): boolean {
  return item.kind !== 'pile' && item.kind !== 'frame';
}

/** The item an item travels with in the end: its anchor's anchor, and so on; itself when it has none. */
function rootOf(item: DockItem, byId: ReadonlyMap<string, DockItem>): DockItem {
  const seen = new Set<string>([item.id]);
  let root = item;
  while (root.anchor !== undefined) {
    const anchor = byId.get(root.anchor);
    if (anchor === undefined || seen.has(anchor.id)) {
      break;
    }
    seen.add(anchor.id);
    root = anchor;
  }
  return root;
}

/** Whether an item travels with another, named by its id: it is the item's anchor, or its anchor's, and so on. */
function travelsWith(item: DockItem, id: string, byId: ReadonlyMap<string, DockItem>): boolean {
  const seen = new Set<string>([item.id]);
  let current = item;
  while (current.anchor !== undefined && !seen.has(current.anchor)) {
    if (current.anchor === id) {
      return true;
    }
    const anchor = byId.get(current.anchor);
    if (anchor === undefined) {
      return false;
    }
    seen.add(anchor.id);
    current = anchor;
  }
  return false;
}

// A marker lies by a card when its box comes at most this close to the card's, in table units: the
// first player token starts 40 right of its identity, the active counter 23 under its villain.
const MARKER_REACH = 60;

/** How far apart two boxes lie: the widest gap between them along either axis, 0 when they overlap. */
function gapBetween(a: DockItem, b: DockItem): number {
  return Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
}

/**
 * The card a marker lies by, which it travels with: the closest one within reach, the leftmost of
 * those as close; none else.
 */
export function markerAnchor(marker: DockItem, cards: readonly DockItem[]): string | undefined {
  let found: DockItem | undefined;
  let foundGap = Infinity;
  for (const card of cards) {
    const gap = gapBetween(marker, card);
    if (gap > MARKER_REACH) {
      continue;
    }
    if (gap < foundGap || (gap === foundGap && card.x < (found?.x ?? Infinity))) {
      found = card;
      foundGap = gap;
    }
  }
  return found?.id;
}

/**
 * The items as they would lie once the previewed drag is dropped: the dragged card at its new
 * corner, on its own (its anchor dropped), and the cards that travel with it moved by as much; a
 * card not on the table yet added there. A marker stays where it lies, since a drop never moves
 * one, and lies by the card closest to it then.
 */
function previewItems(items: readonly DockItem[], preview: DockPreview): DockItem[] {
  const moved = movedItems(items, preview);
  const cards = moved.filter((item) => item.kind === 'card');
  return moved.map((item) => {
    if (item.kind !== 'marker') {
      return item;
    }
    return { ...item, anchor: markerAnchor(item, cards) };
  });
}

/** The items with the previewed card and the cards that travel with it moved; the markers left where they lie. */
function movedItems(items: readonly DockItem[], preview: DockPreview): DockItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const dragged = byId.get(preview.unitId);
  const { x, y } = preview.insertAt;
  if (dragged === undefined) {
    if (preview.size === undefined) {
      throw new Error(
        `dockLayout cannot preview ${preview.unitId}: it is not on the table, and has no size`,
      );
    }
    return [...items, { id: preview.unitId, x, y, ...preview.size, kind: 'card' }];
  }
  const dx = x - dragged.x;
  const dy = y - dragged.y;
  return items.map((item) => {
    if (item === dragged) {
      return { ...item, x, y, anchor: undefined };
    }
    if (item.kind !== 'marker' && travelsWith(item, dragged.id, byId)) {
      return { ...item, x: item.x + dx, y: item.y + dy };
    }
    return item;
  });
}

/** The order of units on the table, which they flow in: by x, then y, then id. */
function byPlace(a: DockItem, b: DockItem): number {
  if (a.x !== b.x) {
    return a.x - b.x;
  }
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The block a row of the table is drawn in, in dock mode: the row itself
 * when it is the villain's or a seat's, else the last seat row above it; a
 * row under no seat row keeps its own.
 */
export function blockRowOf(row: number, seatRows: readonly number[]): number {
  if (row === 0 || seatRows.includes(row)) {
    return row;
  }
  const above = seatRows.filter((seatRow) => seatRow < row);
  return above.length > 0 ? Math.max(...above) : row;
}

/** A block's groups, each by the item they travel with: those of its own row, and those folded into it. */
interface BlockGroups {
  own: Map<DockItem, DockItem[]>;
  folded: Map<DockItem, DockItem[]>;
}

/** The items of each shown block, grouped by the item they travel with: each in that item's row's block. */
function groupsByRow(
  items: readonly DockItem[],
  rows: readonly number[],
  seatRows: readonly number[],
): Map<number, BlockGroups> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groupsOf = new Map<number, BlockGroups>(
    rows.map((row) => [row, { own: new Map(), folded: new Map() }]),
  );
  for (const item of items) {
    const root = rootOf(item, byId);
    const row = rowOf(root.y);
    const blockRow = blockRowOf(row, seatRows);
    const block = groupsOf.get(blockRow);
    if (block === undefined) {
      continue;
    }
    const groups = blockRow === row ? block.own : block.folded;
    const group = groups.get(root) ?? [];
    group.push(item);
    groups.set(root, group);
  }
  return groupsOf;
}

/** A frame with its piles, or a pile alone, among the frames and piles left of a row's units. */
interface FixedGroup {
  root: DockItem;
  members: DockItem[];
}

/** A row's units, in their order, and the frames and piles left of them. */
interface Split {
  units: Unit[];
  fixed: DockItem[];
  fixedGroups: FixedGroup[];
  fixedRight: number | null;
}

/** A group of a row's frames and piles: its left edge on the table, and how far right of its scaled place it is drawn. */
interface FixedPlace {
  left: number;
  dx: number;
}

/**
 * Splits a block's groups: past the first item of its own row that is
 * neither a pile nor a frame, every group is a unit, frames with their piles
 * too; the frames and piles left of it stay where they lie. The groups folded
 * into the block are units after its own, row by row.
 */
function splitRow({ own, folded }: BlockGroups): Split {
  const leading = [...own.keys()].filter(isLeading);
  const firstX = leading.length > 0 ? Math.min(...leading.map((root) => root.x)) : Infinity;
  const units: Unit[] = [];
  const fixed: DockItem[] = [];
  const fixedGroups: FixedGroup[] = [];
  for (const [root, members] of own) {
    if (isLeading(root) || root.x >= firstX) {
      units.push(unitOf(root, members, false));
    } else {
      fixed.push(...members);
      fixedGroups.push({ root, members });
    }
  }
  units.sort((a, b) => byPlace(a.root, b.root));
  const foldedUnits = [...folded].map(([root, members]) => unitOf(root, members, true));
  foldedUnits.sort((a, b) => a.tableRow - b.tableRow || byPlace(a.root, b.root));
  units.push(...foldedUnits);
  const fixedRight =
    fixed.length > 0 ? Math.max(...fixed.map((item) => visualBox(item).right)) : null;
  return { units, fixed, fixedGroups, fixedRight };
}

function unitOf(root: DockItem, members: DockItem[], folded: boolean): Unit {
  const shown = members.map((item) => visualBox(item));
  const left = Math.min(...shown.map((box) => box.left));
  return {
    root,
    members,
    left,
    right: Math.max(...shown.map((box) => box.right)),
    top: Math.min(...members.map((item) => item.y)),
    bottom: Math.max(...members.map((item) => item.y + item.h)),
    lead: Math.min(...members.map((item) => item.x)) - left,
    line: 0,
    slotX: 0,
    slotW: 0,
    cellX: 0,
    cellW: 0,
    dx: 0,
    tableRow: rowOf(root.y),
    folded,
  };
}

// Absorbs the rounding of drawn widths that are a whole number of half columns.
const EPSILON = 1e-6;

/**
 * The half columns every shown row lays its units on, in drawn units: from
 * the left of the frames and piles (0 when no row has any), half a slot
 * apart. A slot (the pitch) is a drawn portrait card and the drawn gap after it.
 */
interface Grid {
  origin: number;
  pitch: number;
  step: number;
}

function gridOf(splits: readonly Split[], scale: number): Grid {
  const lefts = splits.flatMap(({ fixed }) => fixed.map((item) => visualBox(item).left));
  const pitch = (PORTRAIT_CARD.w + SLOT_GAP) * scale;
  return {
    origin: lefts.length > 0 ? Math.min(...lefts) * scale : 0,
    pitch,
    step: pitch / 2,
  };
}

/** The drawn x of a half column of the grid. */
function columnX(grid: Grid, column: number): number {
  return grid.origin + column * grid.step;
}

/** The first half column at or right of a drawn x. */
function columnAtOrPast(grid: Grid, x: number): number {
  return Math.ceil((x - grid.origin) / grid.step - EPSILON);
}

/** Where a row's frames and piles are drawn, and the drawn x they and their owner lines reach. */
interface FixedLayout {
  places: FixedPlace[];
  /** Null without frames and piles. */
  end: number | null;
}

/**
 * Lays a row's frames and piles out, group by group from the left: each at its scaled place, moved
 * as far right as the groups before it were. A group whose owner line is wider than itself takes
 * the line's width, and pushes the next one to the first half column past the line and a gap.
 */
function layOutFixed(
  { fixedGroups }: Split,
  grid: Grid,
  scale: number,
  lineWidths: ReadonlyMap<string, number>,
): FixedLayout {
  const groups = fixedGroups.map(({ root, members }) => {
    const boxes = members.map((item) => visualBox(item));
    return {
      root,
      left: Math.min(...boxes.map((box) => box.left)),
      right: Math.max(...boxes.map((box) => box.right)),
    };
  });
  groups.sort((a, b) => a.left - b.left);
  const places: FixedPlace[] = [];
  let end: number | null = null;
  let dx = 0;
  // Where the next group starts at the earliest, past the line before it: nowhere unless pushed.
  let pushedTo = Number.NEGATIVE_INFINITY;
  for (const group of groups) {
    const scaledLeft = group.left * scale;
    if (scaledLeft + dx < pushedTo) {
      dx = columnX(grid, columnAtOrPast(grid, pushedTo)) - scaledLeft;
    }
    places.push({ left: group.left, dx });
    const drawnLeft = scaledLeft + dx;
    const boxWidth = (group.right - group.left) * scale;
    const lineWidth = lineWidths.get(group.root.id) ?? 0;
    const takes = Math.max(boxWidth, lineWidth);
    end = Math.max(end ?? Number.NEGATIVE_INFINITY, drawnLeft + takes);
    pushedTo =
      lineWidth > boxWidth ? drawnLeft + takes + SLOT_GAP * scale : Number.NEGATIVE_INFINITY;
  }
  return { places, end };
}

/** The half column a row's first line starts at: the first one past its frames and piles and a gap. */
function firstColumn({ end }: FixedLayout, grid: Grid, scale: number): number {
  if (end === null) {
    return 0;
  }
  return Math.max(0, columnAtOrPast(grid, end + SLOT_GAP * scale));
}

/** How many half columns a unit takes at least: a slot, so that a portrait card keeps its look. */
const MIN_SPAN = 2;

/**
 * How many half columns a slot `slotW` drawn units wide takes: as many as it
 * needs, two at least. A portrait card, a small stack or an exhausted card
 * (89.3 drawn) takes two, so that turning a card never reflows its row; a
 * landscape card (94.2) three, its gap to the next unit about 43.
 */
function spanOf(slotW: number, grid: Grid): number {
  return Math.max(MIN_SPAN, Math.ceil(slotW / grid.step - EPSILON));
}

/** The drawn x a row's first line starts its units at, on its first half column; 0 for a row without units. */
function indentOf(split: Split, fixed: FixedLayout, grid: Grid, scale: number): number {
  return split.units.length === 0 ? 0 : columnX(grid, firstColumn(fixed, grid, scale));
}

/** How many lines a row has at least: its first, and an empty one to drop on under it. */
const MIN_LINES = 2;

/** How many card slots the default zoom keeps in view past the widest indent. */
const FIT_SLOTS = 3;

/**
 * The drawn width the default zoom brings into view (spec 3.7): the widest
 * indent of the shown rows and three card slots past it, each a drawn
 * portrait card and the drawn gap between units. It does not depend on the
 * wrap width, which the zoom sets.
 */
export function dockFitWidth(
  items: readonly DockItem[],
  rows: readonly number[],
  seatRows: readonly number[] = [],
  scale = DOCK_SCALE,
): number {
  const splits = [...groupsByRow(items, rows, seatRows).values()].map((groups) => splitRow(groups));
  const grid = gridOf(splits, scale);
  const indents = splits.map((split) =>
    indentOf(split, layOutFixed(split, grid, scale, new Map()), grid, scale),
  );
  return Math.max(0, ...indents) + FIT_SLOTS * grid.pitch;
}

/** The left and right edges of a unit's cards that are not dragged, as they show on the table. */
function edgesOf(unit: Unit, exclude: ReadonlySet<string>): { left: number; right: number } {
  const kept = unit.members.filter((item) => item === unit.root || !exclude.has(item.id));
  const shown = kept.map((item) => visualBox(item));
  return {
    left: Math.min(...shown.map((box) => box.left)),
    right: Math.max(...shown.map((box) => box.right)),
  };
}

function onGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/** The last of a list whose top is at or above a height, else the first. */
function lastAbove<T extends { top: number }>(list: readonly T[], y: number): T {
  let found = list[0] as T;
  for (const entry of list) {
    if (entry.top <= y) {
      found = entry;
    }
  }
  return found;
}

/**
 * How far right of its scaled place a point of a row's frames and piles is drawn: as far as the
 * group it lies past (the first one when it lies left of them all).
 */
function fixedDx(row: Row, x: number): number {
  let dx = row.fixedPlaces[0]?.dx ?? 0;
  for (const place of row.fixedPlaces) {
    if (place.left <= x) {
      dx = place.dx;
    }
  }
  return dx;
}

/** fixedDx, for a drawn x: as far as the group drawn at or left of it. */
function drawnFixedDx(row: Row, x: number, scale: number): number {
  let dx = row.fixedPlaces[0]?.dx ?? 0;
  for (const place of row.fixedPlaces) {
    if (place.left * scale + place.dx <= x) {
      dx = place.dx;
    }
  }
  return dx;
}

/** Lays the shown rows of the table out, each flowing its units in the wrap width. */
export function dockLayout(input: DockLayoutInput): DockLayout {
  if (input.rows.length === 0) {
    throw new Error('dockLayout needs at least one row to show');
  }
  const scale = input.scale ?? DOCK_SCALE;
  const nameRoom = input.nameRoom ?? DOCK_NAME_ROOM;
  const lineGap = input.lineGap ?? DOCK_LINE_GAP;
  const rowGap = input.rowGap ?? DOCK_ROW_GAP;
  const lineWidths = input.lineWidths ?? new Map<string, number>();
  const gap = SLOT_GAP * scale;
  // The empty slot after each row: a drawn portrait card.
  const slotW = PORTRAIT_CARD.w * scale;
  const slotH = PORTRAIT_CARD.h * scale;

  const items =
    input.preview === undefined ? input.items : previewItems(input.items, input.preview);
  const groupsOf = groupsByRow(items, input.rows, input.seatRows ?? []);
  const splits = input.rows.map((row) =>
    splitRow(groupsOf.get(row) ?? { own: new Map(), folded: new Map() }),
  );
  const grid = gridOf(splits, scale);
  const rows = new Map<number, Row>();
  const placed = new Map<string, Placed>();
  let top = 0;
  let width = 0;

  for (const [rowIndex, rowNumber] of input.rows.entries()) {
    const split = splits[rowIndex] as Split;
    const fixed = layOutFixed(split, grid, scale, lineWidths);
    const row: Row = {
      number: rowNumber,
      tableTop: rowTop(rowNumber),
      tableHeight: rowHeight(rowNumber),
      cardY: rowTop(rowNumber) + ROW_LABEL_ROOM,
      top,
      height: 0,
      indent: indentOf(split, fixed, grid, scale),
      lines: [],
      fixed: split.fixed,
      fixedPlaces: fixed.places,
      fixedRight: split.fixedRight,
      units: split.units,
    };

    // The units flow on the half columns, the first line from its first one, each unit's box on
    // the half column after the last one's (its turned cards may reach left of it); one that does
    // not fit starts the next line, on the first half column. A frame takes its owner line's width
    // when that is wider.
    let line = 0;
    let column = firstColumn(fixed, grid, scale);
    let lineIsEmpty = true;
    for (const unit of row.units) {
      unit.slotW = Math.max((unit.right - unit.left) * scale, lineWidths.get(unit.root.id) ?? 0);
      const lead = unit.lead * scale;
      if (!lineIsEmpty && columnX(grid, column) - lead + unit.slotW > input.wrapWidth) {
        line += 1;
        column = 0;
      }
      const span = spanOf(unit.slotW, grid);
      unit.line = line;
      unit.cellX = columnX(grid, column);
      unit.cellW = span * grid.step - gap;
      unit.slotX = unit.cellX - lead;
      unit.dx = unit.slotX - unit.left * scale;
      column += span;
      lineIsEmpty = false;
    }
    // The empty slot: on the half column after the last unit when it fits there, else on the first
    // one of a new line; in a row without units, on the first one past its frames and piles.
    let slotLine = line;
    if (!lineIsEmpty && columnX(grid, column) + slotW > input.wrapWidth) {
      slotLine += 1;
      column = 0;
    }
    width = Math.max(width, columnX(grid, column) + slotW);

    // Each line is as tall as its tallest unit (or the empty slot), under its inset: on the first
    // line, the units lie where the row's cards do, by its frames and piles, which it also holds.
    // Every row has two lines at least: an empty one, a card high, to drop a card after the last
    // unit (insertAt), when they all fit the first.
    const lineCount = Math.max(slotLine + 1, MIN_LINES);
    const insets = Array.from({ length: lineCount }, (_, i) =>
      i === 0 ? ROW_LABEL_ROOM * scale : 0,
    );
    const heights = insets.map((inset, i) => (i >= slotLine ? inset + slotH : 0));
    for (const item of row.fixed) {
      heights[0] = Math.max(heights[0] ?? 0, (item.y - row.tableTop + item.h) * scale);
    }
    for (const unit of row.units) {
      const inset = insets[unit.line] ?? 0;
      heights[unit.line] = Math.max(
        heights[unit.line] ?? 0,
        inset + (unit.bottom - unit.top) * scale,
      );
      width = Math.max(width, unit.slotX + unit.slotW);
    }
    let lineTop = top + nameRoom;
    for (let i = 0; i < heights.length; i++) {
      const height = heights[i] ?? 0;
      row.lines.push({ top: lineTop, height, inset: insets[i] ?? 0 });
      lineTop += height + lineGap;
    }
    row.height = lineTop + rowGap - top;
    rows.set(rowNumber, row);
    top += row.height;

    for (const item of row.fixed) {
      placed.set(item.id, { item, row, unit: null });
      width = Math.max(width, (item.x + item.w) * scale + fixedDx(row, item.x));
    }
    width = Math.max(width, fixed.end ?? 0);
    for (const unit of row.units) {
      for (const item of unit.members) {
        placed.set(item.id, { item, row, unit });
      }
    }
  }
  const shown = [...rows.values()];

  /** Where a point of the table is drawn with a unit of a row, or with its fixed frames and piles. */
  function drawnWith(row: Row, unit: Unit | null, p: Point): Point {
    const first = row.lines[0] as Line;
    if (unit === null) {
      return { x: p.x * scale + fixedDx(row, p.x), y: first.top + (p.y - row.tableTop) * scale };
    }
    const line = row.lines[unit.line] as Line;
    return { x: p.x * scale + unit.dx, y: line.top + line.inset + (p.y - unit.top) * scale };
  }

  /** The point of the table drawn at `p` with a unit of a row, or with its fixed frames and piles. */
  function tableWith(row: Row, unit: Unit | null, p: Point): Point {
    let y: number;
    let x: number;
    if (unit === null) {
      x = (p.x - drawnFixedDx(row, p.x, scale)) / scale;
      y = row.tableTop + (p.y - (row.lines[0] as Line).top) / scale;
    } else {
      const line = row.lines[unit.line] as Line;
      x = (p.x - unit.dx) / scale;
      y = unit.top + (p.y - line.top - line.inset) / scale;
    }
    // Within the band of the row it lies in: a folded unit's own row.
    let bandTop = row.tableTop;
    let bandHeight = row.tableHeight;
    if (unit?.folded) {
      bandTop = rowTop(unit.tableRow);
      bandHeight = rowHeight(unit.tableRow);
    }
    const inRow = Math.min(Math.max(y, bandTop), bandTop + bandHeight - 1);
    return { x, y: inRow };
  }

  /**
   * The unit a point of the table lies past in its block: the last one of its
   * row at or left of it. A point of a folded row left of all of its units goes
   * with the first of them (with the block's last unit when it has none), as
   * the frames and piles it would else go with lie in another row.
   */
  function unitPast(row: Row, p: Point): Unit | null {
    const tableRow = rowOf(p.y);
    const ofRow = row.units.filter((unit) => unit.tableRow === tableRow);
    let found: Unit | null = null;
    for (const unit of ofRow) {
      if (unit.root.x <= p.x) {
        found = unit;
      }
    }
    if (found === null && tableRow !== row.number) {
      return ofRow[0] ?? row.units.at(-1) ?? null;
    }
    return found;
  }

  /** The unit a drawn point lies past on a line of a row: see toTable. */
  function unitDrawnPast(row: Row, lineIndex: number, x: number): Unit | null {
    const onLine = row.units.filter((unit) => unit.line === lineIndex);
    if (onLine.length === 0) {
      return lineIndex === 0 ? null : (row.units.at(-1) ?? null);
    }
    const drawnX = (unit: Unit) => unit.root.x * scale + unit.dx;
    const first = onLine[0] as Unit;
    if (lineIndex === 0 && x < drawnX(first)) {
      return null;
    }
    let found = first;
    for (const unit of onLine) {
      if (drawnX(unit) <= x) {
        found = unit;
      }
    }
    return found;
  }

  /** Where a card goes on the table between two units of a row (either may be missing): see insertAt. */
  function between(
    row: Row,
    before: Unit | undefined,
    after: Unit | undefined,
    width: number,
    exclude: ReadonlySet<string>,
  ): Point {
    if (before !== undefined && after !== undefined) {
      const lo = Math.floor(before.root.x / GRID) * GRID + GRID;
      const hi = Math.ceil(after.root.x / GRID) * GRID - GRID;
      if (lo > hi) {
        // No grid line lies strictly between them: at the first one's x, a line lower, it still
        // sorts after it and before the next.
        return { x: before.root.x, y: before.root.y + GRID };
      }
      const middle = (edgesOf(before, exclude).right + edgesOf(after, exclude).left) / 2;
      const x = Math.min(hi, Math.max(lo, onGrid(middle - width / 2)));
      return { x, y: before.root.kind === 'card' ? before.root.y : row.cardY };
    }
    if (before !== undefined) {
      // As a played card lands: 40 past the last unit's right edge, up to the grid.
      const x = Math.ceil((edgesOf(before, exclude).right + SLOT_GAP) / GRID) * GRID;
      return { x, y: row.cardY };
    }
    if (after !== undefined) {
      // Before the first unit: in the middle of the room the frames and piles leave it, or a gap
      // before it in a row without them.
      const left = edgesOf(after, exclude).left;
      const x =
        row.fixedRight === null ? left - SLOT_GAP - width : (row.fixedRight + left) / 2 - width / 2;
      const hi = Math.ceil(after.root.x / GRID) * GRID - GRID;
      return { x: Math.max(0, Math.min(hi, onGrid(x))), y: row.cardY };
    }
    const x = row.fixedRight === null ? 0 : Math.ceil((row.fixedRight + SLOT_GAP) / GRID) * GRID;
    return { x, y: row.cardY };
  }

  return {
    toDisplay(p, itemId) {
      const own = itemId === undefined ? undefined : placed.get(itemId);
      if (own !== undefined) {
        return drawnWith(own.row, own.unit, p);
      }
      const row = rows.get(blockRowOf(rowOf(p.y), input.seatRows ?? []));
      return row === undefined ? null : drawnWith(row, unitPast(row, p), p);
    },
    toTable(p) {
      const row = lastAbove(shown, p.y);
      const lineIndex = row.lines.indexOf(lastAbove(row.lines, p.y));
      return tableWith(row, unitDrawnPast(row, lineIndex, p.x), p);
    },
    insertAt(p, width, exclude = new Set()) {
      const row = lastAbove(shown, p.y);
      const lineIndex = row.lines.indexOf(lastAbove(row.lines, p.y));
      const kept = row.units.filter((unit) => !exclude.has(unit.root.id));
      const onLine = kept.filter((unit) => unit.line === lineIndex);
      const next = onLine.find((unit) => unit.cellX + unit.cellW / 2 > p.x);
      let index: number;
      if (next !== undefined) {
        index = kept.indexOf(next);
      } else if (onLine.length > 0) {
        index = kept.indexOf(onLine.at(-1) as Unit) + 1;
      } else {
        // A line with nothing left on it: before the units of the lines below.
        const below = kept.findIndex((unit) => unit.line > lineIndex);
        index = below === -1 ? kept.length : below;
      }
      const before = kept[index - 1];
      const after = kept[index];
      // A dragged card dropped back between the units around it stays where it lies.
      const from = before === undefined ? 0 : row.units.indexOf(before) + 1;
      const to = after === undefined ? row.units.length : row.units.indexOf(after);
      const itself = row.units
        .slice(from, to)
        .find((unit) => exclude.has(unit.root.id) && unit.root.kind === 'card');
      if (itself !== undefined) {
        return { x: itself.root.x, y: itself.root.y };
      }
      // Among the folded units, or right before them: after the row's own units, in its band, as
      // they all come before the folded ones however they lie.
      if (before?.folded || after?.folded) {
        const lastOwn = kept.filter((unit) => !unit.folded).at(-1);
        return between(row, lastOwn, undefined, width, exclude);
      }
      return between(row, before, after, width, exclude);
    },
    itemBox(id) {
      const own = placed.get(id);
      if (own === undefined) {
        return null;
      }
      const { x, y } = drawnWith(own.row, own.unit, own.item);
      return { x, y, w: own.item.w * scale, h: own.item.h * scale };
    },
    rowTop: (row) => rows.get(row)?.top ?? null,
    rowHeight: (row) => rows.get(row)?.height ?? null,
    indent: (row) => rows.get(row)?.indent ?? null,
    height: top,
    width,
  };
}

// Below this, in drawn units, an item is drawn where it was: the rounding of the layout's sums.
const SHIFT_EPSILON = 1e-3;

/**
 * How far from where `base` draws them `preview` draws the items of `ids` (spec 3.8), in drawn
 * units: only those it draws elsewhere, and only those both draw.
 */
export function dockShifts(
  base: DockLayout,
  preview: DockLayout,
  ids: readonly string[],
): Map<string, Point> {
  const shifts = new Map<string, Point>();
  for (const id of ids) {
    const from = base.itemBox(id);
    const to = preview.itemBox(id);
    if (from === null || to === null) {
      continue;
    }
    const shift = { x: to.x - from.x, y: to.y - from.y };
    if (Math.abs(shift.x) > SHIFT_EPSILON || Math.abs(shift.y) > SHIFT_EPSILON) {
      shifts.set(id, shift);
    }
  }
  return shifts;
}
