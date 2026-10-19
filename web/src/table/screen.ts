// The table's surface on the screen. A spot of the table is told in table
// units of the surface, so that it lands on the same card whatever the zoom,
// the scroll position or the window size of each viewer.

import type { Point, Rect } from './drag';

/** The surface, where the cards and piles lie, measured on the screen. */
export function surfaceRect(root: ParentNode | undefined): DOMRect | undefined {
  return root?.querySelector('.tablewrap .surface')?.getBoundingClientRect();
}

/** The table's scroller: what shows of the surface. */
export function scrollerRect(root: ParentNode | undefined): DOMRect | undefined {
  return root?.querySelector('.tablewrap')?.getBoundingClientRect();
}

/** A point of the screen, in table units of the surface. */
export function toTable(at: Point, surface: Rect, zoom: number): Point {
  return { x: (at.x - surface.left) / zoom, y: (at.y - surface.top) / zoom };
}

/** A point of the surface, in table units, on the screen. */
export function toScreen(point: Point, surface: Rect, zoom: number): Point {
  return { x: surface.left + point.x * zoom, y: surface.top + point.y * zoom };
}
