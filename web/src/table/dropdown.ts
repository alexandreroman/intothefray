// Where an action bar dropdown opens: above its button, or below it when
// there is no room above, always whole inside the room it is given (the
// visible table, within the window), scrolling inside when it fits neither
// way. Pure: ActionBar.svelte measures and calls it.

import type { Rect } from './drag';

/** The room between the dropdown and its button, and between the dropdown and the room's edges, in px. */
export const MENU_GAP = 6;
export const MENU_EDGE = 8;

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
