// The grid a card dropped on the table snaps to (drag.ts), which the table's
// dots follow (Surface.svelte) and the rows are drawn a pitch apart on
// (rows.ts, rowPitch). Dock mode keeps the fine grid: its drops on a row are
// insertions among the row's cards (dockLayout.ts).

/** Table units are multiples of this. */
export const GRID = 10;

/**
 * The lines a card's top-left corner snaps to, in table units: across, every
 * `step` from 0; down, every `step` from `offsetY`.
 */
export interface SnapGrid {
  step: number;
  offsetY: number;
}

/** The table's 10-unit grid, for a mouse or a pen. */
export const FINE_GRID: SnapGrid = { step: GRID, offsetY: 0 };

/**
 * A tablet's grid, coarser, as a finger is less precise than a mouse. Its
 * lines meet the setup's layout: across, the decks (0), the identity (300) and
 * the classic main scheme (460); down, the cards of each row, 30 under its top
 * (30, 470, 690, 910), the active counter (210) and the first player token
 * (510). A 40-unit step would miss the identity and player 1's cards.
 */
export const TABLET_GRID: SnapGrid = { step: 20, offsetY: 10 };

/** The grid line nearest to `v`, lines lying every `step` from `offset`. */
export function snapTo(v: number, step: number, offset = 0): number {
  return Math.round((v - offset) / step) * step + offset;
}

/** The grid line at or above `v`, lines lying every `step` from `offset`. */
export function floorTo(v: number, step: number, offset = 0): number {
  return Math.floor((v - offset) / step) * step + offset;
}

/** The grid line at or past `v`, lines lying every `step` from `offset`. */
export function ceilTo(v: number, step: number, offset = 0): number {
  return Math.ceil((v - offset) / step) * step + offset;
}
