// The zones of the table on the screen. A spot of the table is told in table
// units of its zone's surface, so that it lands on the same card whatever the
// zoom, the scroll positions or the window size of each viewer.

import type { Area } from '../lib/types';
import type { Point, Rect } from './drag';

/** The surface of a zone, where its cards lie, measured on the screen. */
export function surfaceRect(root: ParentNode | undefined, area: Area): DOMRect | undefined {
  return root?.querySelector(`.zsec[data-area="${area}"] .surface`)?.getBoundingClientRect();
}

/** The horizontal scroller of a zone: what shows of its surface. */
export function scrollerRect(root: ParentNode | undefined, area: Area): DOMRect | undefined {
  return root?.querySelector(`.zsec[data-area="${area}"] .zscroll`)?.getBoundingClientRect();
}

/** A point of the screen, in table units of the surface. */
export function toTable(at: Point, surface: Rect, zoom: number): Point {
  return { x: (at.x - surface.left) / zoom, y: (at.y - surface.top) / zoom };
}

/** A point of the surface, in table units, on the screen. */
export function toScreen(point: Point, surface: Rect, zoom: number): Point {
  return { x: surface.left + point.x * zoom, y: surface.top + point.y * zoom };
}
