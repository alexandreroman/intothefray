// Small cards and small piles in dock mode: every table card and pile is drawn
// scaled from its top-left corner, which the table's projection places (dockLayout.ts). Only the
// drawing changes: the positions the server holds stay as they are.

/** How much smaller dock mode draws the table: its cards, piles, owner frames and the room between them. */
export const DOCK_SCALE = 0.6;

/**
 * How far apart the table's dots lie in dock mode, in table units: four times the 10-unit GRID
 * (layout.ts), so that the dots stay apart on the smaller table. Drops do not snap to it: a drop
 * on a row is an insertion among its cards (dockLayout.ts).
 */
export const DOCK_DOT_PITCH = 40;

/** A box on the table, in table units. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A table card's or pile's box as dock mode draws it, from its own top-left corner: its size scaled. */
export function dockCardBox<T extends { w: number; h: number }>(box: T): T {
  return { ...box, w: box.w * DOCK_SCALE, h: box.h * DOCK_SCALE };
}
