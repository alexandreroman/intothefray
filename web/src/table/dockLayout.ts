// The compact, wrapped phone layout (spec 3.7): dock mode draws the table through one projection,
// from table units to drawn units, and back for drops. Everything is drawn at DOCK_SCALE. Each row
// keeps its owner frames and piles at their scaled place on its first line; past them, from the
// row's indent, its units (a card with everything that travels with it, or a frame with its piles)
// flow in their order on the table, one drawn gap apart, top-aligned, a unit that does not fit
// the wrap width starting the next line. The lines under the first start at the row's left edge
// (where its frames and piles start), so that they use the room under them too. An empty card
// slot follows the last unit, and a row whose units all fit its first line keeps an empty second
// line under it, room to drop a card after them. Rows are as tall as their content and stack one
// under the other. Shared positions never change: only where they are drawn does, and a drop on a
// row is an insertion among its units (insertAt), placed on the table so that it sorts there.

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

export interface DockLayoutInput {
  items: readonly DockItem[];
  /** The rows of the table shown, top to bottom. */
  rows: readonly number[];
  /** The width a row wraps at, in drawn units. */
  wrapWidth: number;
  /** Drawn units per table unit: DOCK_SCALE unless given. */
  scale?: number;
  rowGap?: number;
  lineGap?: number;
  nameRoom?: number;
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
   * unit whose slot's middle lies right of it (else after the line's last
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
  /** The line it is drawn on, its slot's drawn left edge and width. */
  line: number;
  slotX: number;
  slotW: number;
  /** How far right of its scaled table x it is drawn. */
  dx: number;
}

/** A line of a row, in drawn units: the units on it lie `inset` under its top. */
interface Line {
  top: number;
  height: number;
  inset: number;
}

/** A shown row of the table and where it is drawn. */
interface Row {
  tableTop: number;
  tableHeight: number;
  /** Where its cards lie on the table, as the setup puts them (ROW_LABEL_ROOM under its top). */
  cardY: number;
  top: number;
  height: number;
  indent: number;
  /** The drawn x its other lines start at: the left of its frames and piles. */
  leftEdge: number;
  lines: Line[];
  /** The frames and piles left of its units, drawn at their scaled place on its first line. */
  fixed: DockItem[];
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

/** The items of each shown row, grouped by the item they travel with: each in that item's row. */
function groupsByRow(
  items: readonly DockItem[],
  rows: readonly number[],
): Map<number, Map<DockItem, DockItem[]>> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groupsOf = new Map<number, Map<DockItem, DockItem[]>>(rows.map((row) => [row, new Map()]));
  for (const item of items) {
    const root = rootOf(item, byId);
    const groups = groupsOf.get(rowOf(root.y));
    if (groups === undefined) {
      continue;
    }
    const group = groups.get(root) ?? [];
    group.push(item);
    groups.set(root, group);
  }
  return groupsOf;
}

/** A row's units, in their order, and the frames and piles left of them. */
interface Split {
  units: Unit[];
  fixed: DockItem[];
  fixedRight: number | null;
}

/**
 * Splits a row's groups: past the first item that is neither a pile nor a
 * frame, every group is a unit, frames with their piles too; the frames and
 * piles left of it stay where they lie.
 */
function splitRow(groups: ReadonlyMap<DockItem, DockItem[]>): Split {
  const leading = [...groups.keys()].filter(isLeading);
  const firstX = leading.length > 0 ? Math.min(...leading.map((root) => root.x)) : Infinity;
  const units: Unit[] = [];
  const fixed: DockItem[] = [];
  for (const [root, members] of groups) {
    if (isLeading(root) || root.x >= firstX) {
      units.push(unitOf(root, members));
    } else {
      fixed.push(...members);
    }
  }
  units.sort((a, b) => byPlace(a.root, b.root));
  const fixedRight =
    fixed.length > 0 ? Math.max(...fixed.map((item) => visualBox(item).right)) : null;
  return { units, fixed, fixedRight };
}

function unitOf(root: DockItem, members: DockItem[]): Unit {
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
    dx: 0,
  };
}

/**
 * The drawn x a row's lines start their units at: where its first unit's box
 * lies, scaled, but never over the frames and piles left of it (a gap past
 * them); 0 for a row without units.
 */
function indentOf({ units, fixedRight }: Split, scale: number): number {
  const first = units[0];
  if (first === undefined) {
    return 0;
  }
  const own = (first.left + first.lead) * scale;
  return fixedRight === null ? own : Math.max(own, (fixedRight + SLOT_GAP) * scale);
}

/**
 * The drawn x the lines under a row's first one start at: the left edge of
 * its frames and piles, as they show; the indent for a row without them.
 */
function leftEdgeOf({ fixed }: Split, indent: number, scale: number): number {
  if (fixed.length === 0) {
    return indent;
  }
  return Math.min(...fixed.map((item) => visualBox(item).left)) * scale;
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
  scale = DOCK_SCALE,
): number {
  const indents = [...groupsByRow(items, rows).values()].map((groups) =>
    indentOf(splitRow(groups), scale),
  );
  const slot = (PORTRAIT_CARD.w + SLOT_GAP) * scale;
  return Math.max(0, ...indents) + FIT_SLOTS * slot;
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

/** Lays the shown rows of the table out, each flowing its units in the wrap width. */
export function dockLayout(input: DockLayoutInput): DockLayout {
  if (input.rows.length === 0) {
    throw new Error('dockLayout needs at least one row to show');
  }
  const scale = input.scale ?? DOCK_SCALE;
  const nameRoom = input.nameRoom ?? DOCK_NAME_ROOM;
  const lineGap = input.lineGap ?? DOCK_LINE_GAP;
  const rowGap = input.rowGap ?? DOCK_ROW_GAP;
  const gap = SLOT_GAP * scale;
  // The empty slot after each row: a drawn portrait card.
  const slotW = PORTRAIT_CARD.w * scale;
  const slotH = PORTRAIT_CARD.h * scale;

  const groupsOf = groupsByRow(input.items, input.rows);
  const rows = new Map<number, Row>();
  const placed = new Map<string, Placed>();
  let top = 0;
  let width = 0;

  for (const rowNumber of input.rows) {
    const split = splitRow(groupsOf.get(rowNumber) ?? new Map());
    const indent = indentOf(split, scale);
    const leftEdge = leftEdgeOf(split, indent, scale);
    const row: Row = {
      tableTop: rowTop(rowNumber),
      tableHeight: rowHeight(rowNumber),
      cardY: rowTop(rowNumber) + ROW_LABEL_ROOM,
      top,
      height: 0,
      indent,
      leftEdge,
      lines: [],
      fixed: split.fixed,
      fixedRight: split.fixedRight,
      units: split.units,
    };

    // The units flow from the indent, the first one's box there (its turned cards may reach left
    // of it), one gap apart; one that does not fit starts the next line, its slot at the left edge.
    let line = 0;
    let cursor: number | null = null;
    for (const unit of row.units) {
      unit.slotW = (unit.right - unit.left) * scale;
      let x: number = cursor === null ? indent - unit.lead * scale : cursor + gap;
      if (cursor !== null && x + unit.slotW > input.wrapWidth) {
        line += 1;
        x = leftEdge;
      }
      unit.line = line;
      unit.slotX = x;
      unit.dx = x - unit.left * scale;
      cursor = x + unit.slotW;
    }
    // The empty slot: after the last unit when it fits there, else at the start of a new line;
    // in a row without units, past its frames and piles.
    let slotLine = line;
    let slotX = 0;
    if (cursor !== null) {
      slotX = cursor + gap;
      if (slotX + slotW > input.wrapWidth) {
        slotLine += 1;
        slotX = leftEdge;
      }
    } else if (row.fixedRight !== null) {
      slotX = (row.fixedRight + SLOT_GAP) * scale;
    }
    width = Math.max(width, slotX + slotW);

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
      width = Math.max(width, (item.x + item.w) * scale);
    }
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
      return { x: p.x * scale, y: first.top + (p.y - row.tableTop) * scale };
    }
    const line = row.lines[unit.line] as Line;
    return { x: p.x * scale + unit.dx, y: line.top + line.inset + (p.y - unit.top) * scale };
  }

  /** The point of the table drawn at `p` with a unit of a row, or with its fixed frames and piles. */
  function tableWith(row: Row, unit: Unit | null, p: Point): Point {
    let y: number;
    let x: number;
    if (unit === null) {
      x = p.x / scale;
      y = row.tableTop + (p.y - (row.lines[0] as Line).top) / scale;
    } else {
      const line = row.lines[unit.line] as Line;
      x = (p.x - unit.dx) / scale;
      y = unit.top + (p.y - line.top - line.inset) / scale;
    }
    const inRow = Math.min(Math.max(y, row.tableTop), row.tableTop + row.tableHeight - 1);
    return { x, y: inRow };
  }

  /** The unit a point of the table lies past in its row: the last one at or left of it. */
  function unitPast(row: Row, x: number): Unit | null {
    let found: Unit | null = null;
    for (const unit of row.units) {
      if (unit.root.x <= x) {
        found = unit;
      }
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
      const row = rows.get(rowOf(p.y));
      return row === undefined ? null : drawnWith(row, unitPast(row, p.x), p);
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
      const next = onLine.find((unit) => unit.slotX + unit.slotW / 2 > p.x);
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
