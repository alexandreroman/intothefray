// The compact, wrapped phone layout (spec 3.7): dock mode draws the table through one projection,
// from table units to drawn units, and back for drops. It is the desktop layout scaled by
// DOCK_SCALE, each row then wrapped: past the row's indent (the drawn x of its first item that is
// neither a pile nor an owner frame), items whose drawn left edge passes the wrap width continue on
// a new line of the same row, drawn from the indent. Rows stack by their drawn height. Shared
// positions never change: only where they are drawn does.

import { DOCK_SCALE, type Placement } from './dockPiles';
import { PORTRAIT_CARD } from './layout';
import { ROW_HEIGHT, rowOf, VILLAIN_ROW_HEIGHT } from './rows';

/** The room above a row's lines for its owner names, in drawn units. */
export const DOCK_NAME_ROOM = 12;

/** The gap under each line of a row, in drawn units. */
export const DOCK_LINE_GAP = 10;

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
   * marker's card, a pile's frame. It takes that item's line and keeps its
   * offset from it.
   */
  anchor?: string;
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
   * A point of an item, named by its id, follows that item's line; any other
   * point the line its x falls in.
   */
  toDisplay(p: Point, itemId?: string): Point | null;
  /**
   * The point of the table drawn at a point: toDisplay inverted. On a wrapped
   * line, a point left of the indent counts at the indent; a point below the
   * last line counts in it. The point stays within its row's band of the table.
   */
  toTable(p: Point): Point;
  /** The drawn box of an item, or null when its row is not shown. */
  itemBox(id: string): Placement | null;
  /** The drawn top of a row, or null when it is not shown. */
  rowTop(row: number): number | null;
  /** The drawn height of a row: its name room, its lines and its gap; null when it is not shown. */
  rowHeight(row: number): number | null;
  /** The drawn x wrapped lines of a row start at, or null when it is not shown. */
  indent(row: number): number | null;
  /** The drawn height of every shown row. */
  readonly height: number;
}

/** A line of a row, in drawn units. */
interface Line {
  top: number;
  height: number;
}

/** A shown row of the table and where it is drawn. */
interface Row {
  tableTop: number;
  tableHeight: number;
  top: number;
  height: number;
  indent: number;
  lineWidth: number;
  /** Whether the row has an item past its piles and frames: without one, nothing wraps. */
  wraps: boolean;
  lines: Line[];
}

/** An item of a shown row and the line it is drawn on. */
interface Placed {
  item: DockItem;
  row: Row;
  line: number;
}

// A point toTable puts at the indent of a wrapped line comes back from the table a hair short of
// that line's start in floating point; this slack, in lines, keeps it on the line it was dropped on.
const LINE_SLACK = 1e-9;

/** The top of a row of the table, in table units. */
function tableRowTop(row: number): number {
  return row === 0 ? 0 : VILLAIN_ROW_HEIGHT + ROW_HEIGHT * (row - 1);
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

/** The line of a row a scaled x falls in: line 0 left of the indent, and for a row that does not wrap. */
function lineOf(row: Row, scaledX: number): number {
  if (!row.wraps) {
    return 0;
  }
  return Math.max(0, Math.floor((scaledX - row.indent) / row.lineWidth + LINE_SLACK));
}

/** Lays the shown rows of the table out, each wrapped at the wrap width. */
export function dockLayout(input: DockLayoutInput): DockLayout {
  if (input.rows.length === 0) {
    throw new Error('dockLayout needs at least one row to show');
  }
  const scale = input.scale ?? DOCK_SCALE;
  const nameRoom = input.nameRoom ?? DOCK_NAME_ROOM;
  const lineGap = input.lineGap ?? DOCK_LINE_GAP;
  const rowGap = input.rowGap ?? DOCK_ROW_GAP;

  const byId = new Map(input.items.map((item) => [item.id, item]));
  // Each item goes in the row of the item it travels with.
  const itemsByRow = new Map<number, { item: DockItem; root: DockItem }[]>(
    input.rows.map((row) => [row, []]),
  );
  for (const item of input.items) {
    const root = rootOf(item, byId);
    itemsByRow.get(rowOf(root.y))?.push({ item, root });
  }

  const rows = new Map<number, Row>();
  const placed = new Map<string, Placed>();
  let top = 0;
  for (const rowNumber of input.rows) {
    const members = itemsByRow.get(rowNumber) ?? [];
    const leading = members.filter(({ item }) => isLeading(item));
    const cards = members.filter(({ item }) => item.kind === 'card');
    const indent = leading.length > 0 ? Math.min(...leading.map(({ item }) => item.x * scale)) : 0;
    // A card left on a line may run past its end by its width: the widest card's width is kept
    // free at the end of each line, which still holds at least one card.
    const widest =
      cards.length > 0
        ? Math.max(...cards.map(({ item }) => item.w * scale))
        : PORTRAIT_CARD.w * scale;
    const row: Row = {
      tableTop: tableRowTop(rowNumber),
      tableHeight: rowNumber === 0 ? VILLAIN_ROW_HEIGHT : ROW_HEIGHT,
      top,
      height: 0,
      indent,
      lineWidth: Math.max(widest, input.wrapWidth - indent - widest),
      wraps: leading.length > 0,
      lines: [],
    };

    // Each line is as high as what its items take below the row's top, scaled.
    const extents: number[] = [0];
    for (const { item, root } of members) {
      const line = lineOf(row, root.x * scale);
      placed.set(item.id, { item, row, line });
      const extent = (item.y - row.tableTop + item.h) * scale;
      extents[line] = Math.max(extents[line] ?? 0, extent);
    }
    let lineTop = top + nameRoom;
    for (let line = 0; line < extents.length; line++) {
      const height = (extents[line] ?? 0) + lineGap;
      row.lines.push({ top: lineTop, height });
      lineTop += height;
    }
    row.height = lineTop + rowGap - top;
    rows.set(rowNumber, row);
    top += row.height;
  }
  const shown = [...rows.values()];

  /** Where a point of the table is drawn on a line of a row. */
  function drawnOn(row: Row, line: number, p: Point): Point {
    const lineTop = (row.lines[line] as Line).top;
    return { x: p.x * scale - line * row.lineWidth, y: lineTop + (p.y - row.tableTop) * scale };
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

  return {
    toDisplay(p, itemId) {
      const own = itemId === undefined ? undefined : placed.get(itemId);
      if (own !== undefined) {
        return drawnOn(own.row, own.line, p);
      }
      const row = rows.get(rowOf(p.y));
      if (row === undefined) {
        return null;
      }
      // The last line runs on to the right, so that a drop past its end comes back where it was.
      const line = Math.min(lineOf(row, p.x * scale), row.lines.length - 1);
      return drawnOn(row, line, p);
    },
    toTable(p) {
      const row = lastAbove(shown, p.y);
      const line = lastAbove(row.lines, p.y);
      const lineIndex = row.lines.indexOf(line);
      const x = lineIndex === 0 ? p.x : Math.max(p.x, row.indent);
      const offset = (p.y - line.top) / scale;
      const inRow = Math.min(Math.max(offset, 0), row.tableHeight - 1);
      return { x: (x + lineIndex * row.lineWidth) / scale, y: row.tableTop + inRow };
    },
    itemBox(id) {
      const own = placed.get(id);
      if (own === undefined) {
        return null;
      }
      const { x, y } = drawnOn(own.row, own.line, own.item);
      return { x, y, w: own.item.w * scale, h: own.item.h * scale };
    },
    rowTop: (row) => rows.get(row)?.top ?? null,
    rowHeight: (row) => rows.get(row)?.height ?? null,
    indent: (row) => rows.get(row)?.indent ?? null,
    height: top,
  };
}
