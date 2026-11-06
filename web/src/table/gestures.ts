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

/** Below this zoom the cards are too small to read: the readable zoom is never under it. */
const READABLE_ZOOM = 1;

/** The readable zoom when the fit zoom is already readable, so a double tap still zooms in. */
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
 * The zoom a double tap toggles to: the fit zoom from the readable zoom, the readable zoom from anywhere
 * else. The readable zoom is the larger of 1 and `fit`, or 1.5 when `fit` is already about 1.
 */
export function doubleTapZoom(current: number, fit: number): number {
  let readable = Math.max(READABLE_ZOOM, fit);
  if (fit >= READABLE_ZOOM && Math.abs(fit - READABLE_ZOOM) < ZOOM_TOLERANCE * READABLE_ZOOM) {
    readable = CLOSE_UP_ZOOM;
  }
  return near(current, readable) ? fit : readable;
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
