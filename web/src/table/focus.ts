// Where the Focus panel (the preview of the hovered card) floats over the
// table: in a corner of the play area that covers neither the pointer nor the
// hovered element, nor the controls kept in some corners.

import { contains, type Point, type Rect } from './drag';

export type Corner = 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right';

/** The corners in the order they are tried. */
export const CORNERS: readonly Corner[] = ['top-right', 'top-left', 'bottom-left', 'bottom-right'];

/** The room between the panel and the play area's edges, in px. */
export const FOCUS_MARGINS = { top: 12, side: 14, bottom: 16 } as const;

/** Where the panel lies on the screen in that corner of the play area. */
export function cornerRect(corner: Corner, area: Rect, size: { w: number; h: number }): Rect {
  const left = corner.endsWith('left')
    ? area.left + FOCUS_MARGINS.side
    : area.right - FOCUS_MARGINS.side - size.w;
  const top = corner.startsWith('top')
    ? area.top + FOCUS_MARGINS.top
    : area.bottom - FOCUS_MARGINS.bottom - size.h;
  return { left, top, right: left + size.w, bottom: top + size.h };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export interface CornerChoice {
  /** The corner the panel is in now: it stays there while it is clear, so that it never flickers. */
  current: Corner;
  /** The play area, on the screen. */
  area: Rect;
  /** The panel's size, in px. */
  size: { w: number; h: number };
  /** The hovered card or pile, on the screen. */
  hovered: Rect | null;
  pointer: Point | null;
  /** The corners other controls take: the zoom control, the player selector. */
  taken: readonly Corner[];
}

/**
 * The corner the panel goes to. Clear is neither taken by a control nor over
 * the pointer or the hovered element. Top right is its home: it goes back
 * there whenever that is clear, and nothing hovered clears every corner.
 * Otherwise it keeps the corner it fell back to while that one is clear, so
 * that it does not flicker between two, or else takes the first clear one.
 * With no clear corner, it stays where it is.
 */
export function chooseCorner(choice: CornerChoice): Corner {
  const clear = (corner: Corner) => {
    if (choice.taken.includes(corner)) {
      return false;
    }
    const rect = cornerRect(corner, choice.area, choice.size);
    const overHovered = choice.hovered !== null && overlaps(rect, choice.hovered);
    const overPointer = choice.pointer !== null && contains(rect, choice.pointer);
    return !overHovered && !overPointer;
  };
  const home = CORNERS[0] ?? 'top-right';
  if (clear(home)) {
    return home;
  }
  if (clear(choice.current)) {
    return choice.current;
  }
  return CORNERS.find(clear) ?? choice.current;
}
