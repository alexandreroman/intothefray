// Where an action bar dropdown opens: above its button, or below it when
// there is no room above, always whole inside the room it is given (the
// visible table, within the window), scrolling inside when it fits neither
// way. The context menu opens at the pointer, and its submenus beside their
// row, under the same rule. Pure: ActionBar.svelte and ContextMenu.svelte
// measure and call it.

import type { Rect } from './drag';

/** The room between the dropdown and its button, and between the dropdown and the room's edges, in px. */
export const MENU_GAP = 6;
export const MENU_EDGE = 8;

/**
 * From a menu's outer edge to its first item: its padding and its border. A
 * submenu opens this much above its row, so that its first item lines up with it.
 */
export const MENU_INSET = 6;

export interface DropdownPlace {
  left: number;
  top: number;
  /** The height it is cut to, scrolling inside, or null when it shows whole. */
  maxHeight: number | null;
}

/**
 * Where a dropdown of that size opens for its button, inside the room.
 * Above by default, below when only that side has room; when neither side
 * has room, on the roomier side, cut to its height. It starts at its
 * button's left edge, moved left or right to stay inside the room.
 */
export function placeDropdown(
  button: Rect,
  size: { w: number; h: number },
  room: Rect,
): DropdownPlace {
  const roomAbove = button.top - MENU_GAP - (room.top + MENU_EDGE);
  const roomBelow = room.bottom - MENU_EDGE - (button.bottom + MENU_GAP);

  let top: number;
  let maxHeight: number | null = null;
  if (size.h <= roomAbove) {
    top = button.top - MENU_GAP - size.h;
  } else if (size.h <= roomBelow) {
    top = button.bottom + MENU_GAP;
  } else if (roomAbove >= roomBelow) {
    maxHeight = Math.max(0, roomAbove);
    top = button.top - MENU_GAP - maxHeight;
  } else {
    maxHeight = Math.max(0, roomBelow);
    top = button.bottom + MENU_GAP;
  }

  // Off the right edge first, then off the left one: a dropdown wider than the room keeps its left side in.
  const rightmost = room.right - MENU_EDGE - size.w;
  const left = Math.max(room.left + MENU_EDGE, Math.min(button.left, rightmost));
  return { left, top, maxHeight };
}

/**
 * Where the context menu opens: its top left corner at the pointer, flipped
 * left or up when there is no room on that side. When it fits neither below
 * nor above, it goes to the roomier side, cut to its height; when it fits on
 * neither side, it is moved inside the room.
 */
export function placeAtPoint(
  point: { x: number; y: number },
  size: { w: number; h: number },
  room: Rect,
): DropdownPlace {
  const left = flip(point.x, point.x - size.w, size.w, room.left, room.right);

  const roomBelow = room.bottom - MENU_EDGE - point.y;
  const roomAbove = point.y - (room.top + MENU_EDGE);
  if (size.h <= roomBelow) {
    return { left, top: point.y, maxHeight: null };
  }
  if (size.h <= roomAbove) {
    return { left, top: point.y - size.h, maxHeight: null };
  }
  if (roomBelow >= roomAbove) {
    return { left, top: point.y, maxHeight: Math.max(0, roomBelow) };
  }
  return { left, top: room.top + MENU_EDGE, maxHeight: Math.max(0, roomAbove) };
}

/**
 * Where a submenu opens: right of its menu, its first item level with its
 * row, or left of the menu when there is no room on the right. It is moved up
 * to stay inside the room, and cut to the room's height when taller.
 */
export function placeSubmenu(
  menu: Rect,
  row: Rect,
  size: { w: number; h: number },
  room: Rect,
): DropdownPlace {
  const left = flip(menu.right, menu.left - size.w, size.w, room.left, room.right);

  const highest = room.top + MENU_EDGE;
  const tallest = room.bottom - MENU_EDGE - highest;
  if (size.h > tallest) {
    return { left, top: highest, maxHeight: Math.max(0, tallest) };
  }
  const lowest = room.bottom - MENU_EDGE - size.h;
  const top = Math.max(highest, Math.min(row.top - MENU_INSET, lowest));
  return { left, top, maxHeight: null };
}

/**
 * The left edge of a box of that width: at `wanted` when it fits there, else
 * at `flipped` (the other side of its anchor) when that fits, else as far
 * right as fits, its left side kept in when it is wider than the room.
 */
function flip(wanted: number, flipped: number, width: number, min: number, max: number): number {
  const leftmost = min + MENU_EDGE;
  const rightmost = max - MENU_EDGE - width;
  if (wanted <= rightmost) {
    return wanted;
  }
  if (flipped >= leftmost) {
    return flipped;
  }
  return Math.max(leftmost, rightmost);
}
