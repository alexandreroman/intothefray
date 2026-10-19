// Where the Focus panel (the preview of the hovered card) floats over the
// table: in a corner of the play area that covers neither the pointer nor the
// hovered element, nor the controls in the corners. At home, bottom right, it
// sits right above the zoom control (and the narrow screen's Undo).

import { contains, type Point, type Rect } from './drag';

export type Corner = 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right';

/** The panel's own corner, where it goes whenever it can. */
export const HOME: Corner = 'bottom-right';

/**
 * The corners in the order they are tried: home first, then the facing corner
 * on the same edge, then the top left and the top right.
 */
export const CORNERS: readonly Corner[] = [HOME, 'bottom-left', 'top-left', 'top-right'];

/**
 * The room between the play area's right and bottom edges and what floats in
 * its corners, in px: the panel, the zoom control (and the narrow screen's
 * Undo), the keyboard shortcuts sheet and the player selector all keep it, so
 * that their edges line up. The table sets it as --edge.
 */
export const TABLE_EDGE = 16;

/** The room between the panel and the play area's edges, and above the controls at home, in px. */
export const FOCUS_MARGINS = {
  top: 12,
  side: TABLE_EDGE,
  bottom: TABLE_EDGE,
  aboveControls: 8,
} as const;

/**
 * The room under the panel in that corner, in px: at home, it clears the
 * controls there, `controls` px high.
 */
export function bottomRoom(corner: Corner, controls: number): number {
  if (corner === HOME && controls > 0) {
    return FOCUS_MARGINS.bottom + controls + FOCUS_MARGINS.aboveControls;
  }
  return corner.startsWith('bottom') ? FOCUS_MARGINS.bottom : 0;
}

/** Where the panel lies on the screen in that corner of the play area, above `controls` px of controls at home. */
export function cornerRect(
  corner: Corner,
  area: Rect,
  size: { w: number; h: number },
  controls = 0,
): Rect {
  const left = corner.endsWith('left')
    ? area.left + FOCUS_MARGINS.side
    : area.right - FOCUS_MARGINS.side - size.w;
  const top = corner.startsWith('top')
    ? area.top + FOCUS_MARGINS.top
    : area.bottom - bottomRoom(corner, controls) - size.h;
  return { left, top, right: left + size.w, bottom: top + size.h };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export interface CornerChoice {
  /** The corner the panel is in now: it stays there when no corner is clear. */
  current: Corner;
  /** The play area, on the screen. */
  area: Rect;
  /** The panel's size, in px. */
  size: { w: number; h: number };
  /** The hovered card or pile, on the screen. */
  hovered: Rect | null;
  pointer: Point | null;
  /** The height of the controls at home, under the panel (the zoom control, the narrow Undo), in px. */
  controls: number;
  /** The corners other controls take: the player selector. */
  taken: readonly Corner[];
}

/**
 * The corner the panel goes to: the first clear one in the order of CORNERS.
 * Clear is neither taken by a control nor over the pointer or the hovered
 * element. Bottom right is its home: it goes back there whenever that is
 * clear, and nothing hovered clears every corner. Blocked there, it goes to
 * the bottom left, then the top left, then the top right. With no clear
 * corner, it stays where it is, unless a control took that corner meanwhile:
 * then it goes home.
 */
export function chooseCorner(choice: CornerChoice): Corner {
  const clear = (corner: Corner) => {
    if (choice.taken.includes(corner)) {
      return false;
    }
    const rect = cornerRect(corner, choice.area, choice.size, choice.controls);
    const overHovered = choice.hovered !== null && overlaps(rect, choice.hovered);
    const overPointer = choice.pointer !== null && contains(rect, choice.pointer);
    return !overHovered && !overPointer;
  };
  const next = CORNERS.find(clear);
  if (next) {
    return next;
  }
  return choice.taken.includes(choice.current) ? HOME : choice.current;
}
