// Touch gestures on the table (spec 3.2 and 3.3): when a press becomes a hold, when two taps make a double tap,
// and the zoom a double tap or a pinch asks for. Pure helpers; interaction.svelte.ts and touchZoom.ts follow the
// fingers and call them.

/** A touch press arms (the card lifts and can be dragged) once it lasted this long, in milliseconds. */
export const HOLD_MS = 300;

/** A finger that moves farther than this before HOLD_MS, in screen pixels, scrolls instead of holding. */
export const HOLD_SLOP = 10;

/** A second tap within this many milliseconds of the first makes a double tap. */
export const DOUBLE_TAP_MS = 300;

/** A second tap within this distance of the first, in screen pixels, makes a double tap. */
export const DOUBLE_TAP_SLOP = 30;

/** The readable zoom: the cards at their own size. */
const READABLE_ZOOM = 1;

/** The close-up zoom, where a double tap zooms in to. */
const CLOSE_UP_ZOOM = 1.5;

/** Two zooms this close, as a share of the larger one, count as the same. */
const ZOOM_TOLERANCE = 0.05;

/** A tap: when it happened, in milliseconds, and where, in screen pixels. */
export type Tap = { t: number; x: number; y: number };

/** Where a touch press stands: still waiting for the hold, armed for a drag, or turned into a scroll. */
export type HoldPhase = 'waiting' | 'armed' | 'scroll';

/**
 * Where a touch press stands after `elapsedMs` with the finger `distancePx` away from where it went down:
 * still waiting, armed for a drag, or turned into a scroll. A press that lasted HOLD_MS is armed whatever
 * the distance: it only scrolls if the finger moved before then.
 */
export function holdPhase(elapsedMs: number, distancePx: number): HoldPhase {
  if (elapsedMs >= HOLD_MS) {
    return 'armed';
  }
  if (distancePx > HOLD_SLOP) {
    return 'scroll';
  }
  return 'waiting';
}

/** Whether the tap `next` follows `prev` soon enough and close enough to make a double tap. */
export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  if (prev === null) {
    return false;
  }
  const soon = next.t - prev.t <= DOUBLE_TAP_MS;
  const close = Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_SLOP;
  return soon && close;
}

/** Whether zoom `a` is within ZOOM_TOLERANCE of zoom `b`. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= ZOOM_TOLERANCE * b;
}

/**
 * The zoom a double tap goes to: it toggles between the readable zoom (100 %) and the close-up zoom (150 %);
 * from any other zoom it goes to 150 %.
 */
export function doubleTapZoom(current: number): number {
  return near(current, CLOSE_UP_ZOOM) ? READABLE_ZOOM : CLOSE_UP_ZOOM;
}

/**
 * The zoom of a pinch that started at `startZoom` with the fingers `startDistance` apart and now has them
 * `distance` apart. Fingers that started together give no ratio, so the zoom stays.
 */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) {
    return startZoom;
  }
  return (startZoom * distance) / startDistance;
}
