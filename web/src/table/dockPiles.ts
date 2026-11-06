// Small cards and small piles in dock mode (spec 3.6, 3.7): every table card and pile is drawn
// scaled from its top-left corner, which the table's projection places (dockLayout.ts). Only the
// drawing changes: the positions the server holds stay as they are.

/** How much smaller dock mode draws the table: its cards, piles, owner frames and the room between them. */
export const DOCK_SCALE = 0.6;

/**
 * The grid a drop on the table snaps to in dock mode, in table units: coarser than the 10-unit
 * GRID (layout.ts), so that a finger places cards in line with less care.
 */
export const DOCK_GRID = 40;

/** A box on the table, in table units. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A table card's or pile's box as dock mode draws it, from its own top-left corner: its size scaled. */
export function dockCardBox<T extends { w: number; h: number }>(box: T, scale = DOCK_SCALE): T {
  return { ...box, w: box.w * scale, h: box.h * scale };
}
