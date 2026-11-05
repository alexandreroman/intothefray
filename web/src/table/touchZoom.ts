// Zoom with the fingers on the table scroller (spec 3.3): two fingers pinch-zoom around their midpoint and pan
// with it, and a double tap on an empty spot toggles between the fit zoom and the readable zoom. The page itself
// never pinch-zooms: iOS's gesturestart is prevented.

import type { Attachment } from 'svelte/attachments';
import { doubleTapZoom, HOLD_SLOP, isDoubleTap, pinchZoom, type Tap } from './gestures';

/** What the touch zoom needs from the table. */
export type TouchZoomOptions = {
  /** Whether the gestures apply now (touch mode); when false the attachment does nothing. */
  enabled: () => boolean;
  /** The current zoom. */
  zoom: () => number;
  /** The zoom that fits the table's width. */
  fit: () => number;
  /** Zooms to `zoom` (clamped), keeping what lies under the screen point (x, y) in place. */
  setZoom: (zoom: number, x: number, y: number) => void;
  /** Whether a touch on `target` is on an empty spot of the table, where a double tap zooms. */
  isEmptySpot: (target: EventTarget | null) => boolean;
};

type Point = { x: number; y: number };

/** A pinch under way: the zoom and finger distance it started from, and the last midpoint of the fingers. */
type Pinch = { startZoom: number; startDistance: number; mid: Point };

// Every listener may prevent the default (the scroll of a pinch, the click of a double tap, iOS's page zoom),
// which a passive listener cannot.
const LISTENER_OPTIONS: AddEventListenerOptions = { passive: false };

/** Where the touch at `index` of `list` is, or null when fewer fingers are down. */
function pointAt(list: TouchList, index: number): Point | null {
  const touch = list[index];
  return touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
}

/** Where the two fingers of `list` are, or null unless exactly two are down. */
function twoFingers(list: TouchList): [Point, Point] | null {
  const a = pointAt(list, 0);
  const b = pointAt(list, 1);
  if (list.length !== 2 || a === null || b === null) {
    return null;
  }
  return [a, b];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The touch zoom of the table scroller, as an attachment: `<div {@attach touchZoom(options)}>`. */
export function touchZoom(options: TouchZoomOptions): Attachment<HTMLElement> {
  return (scroller) => {
    let pinch: Pinch | null = null;
    // Where the current one-finger touch went down, or null when the touch cannot be a tap (a pinch is or was
    // under way).
    let press: Point | null = null;
    // The last tap on an empty spot, which a second tap can make a double tap.
    let lastTap: Tap | null = null;

    function reset(): void {
      pinch = null;
      press = null;
      lastTap = null;
    }

    function onTouchStart(event: TouchEvent): void {
      if (!options.enabled()) {
        reset();
        return;
      }
      if (event.touches.length === 1) {
        press = pointAt(event.touches, 0);
        return;
      }
      // A second finger: a pinch, and none of these touches is a tap.
      press = null;
      lastTap = null;
      const fingers = twoFingers(event.touches);
      if (fingers !== null) {
        const [a, b] = fingers;
        pinch = { startZoom: options.zoom(), startDistance: distance(a, b), mid: midpoint(a, b) };
      }
    }

    function onTouchMove(event: TouchEvent): void {
      const fingers = twoFingers(event.touches);
      if (pinch === null || fingers === null || !options.enabled()) {
        return;
      }
      event.preventDefault();
      const [a, b] = fingers;
      const mid = midpoint(a, b);

      // The table follows the fingers: it moves as far as their midpoint did.
      scroller.scrollLeft -= mid.x - pinch.mid.x;
      scroller.scrollTop -= mid.y - pinch.mid.y;
      pinch.mid = mid;

      options.setZoom(
        pinchZoom(pinch.startZoom, pinch.startDistance, distance(a, b)),
        mid.x,
        mid.y,
      );
    }

    function onTouchEnd(event: TouchEvent): void {
      if (event.touches.length < 2) {
        pinch = null;
      }
      const end = pointAt(event.changedTouches, 0);
      if (event.touches.length > 0 || press === null || end === null || !options.enabled()) {
        return;
      }
      const start = press;
      press = null;

      // A finger that moved farther than a hold allows scrolled the table: that was no tap.
      if (distance(start, end) > HOLD_SLOP || !options.isEmptySpot(event.target)) {
        lastTap = null;
        return;
      }
      const next: Tap = { t: event.timeStamp, x: end.x, y: end.y };
      if (!isDoubleTap(lastTap, next)) {
        lastTap = next;
        return;
      }
      // No click follows the double tap: it zoomed, and does nothing else.
      event.preventDefault();
      lastTap = null;
      options.setZoom(doubleTapZoom(options.zoom(), options.fit()), next.x, next.y);
    }

    function onGestureStart(event: Event): void {
      if (options.enabled()) {
        event.preventDefault();
      }
    }

    scroller.addEventListener('touchstart', onTouchStart, LISTENER_OPTIONS);
    scroller.addEventListener('touchmove', onTouchMove, LISTENER_OPTIONS);
    scroller.addEventListener('touchend', onTouchEnd, LISTENER_OPTIONS);
    scroller.addEventListener('touchcancel', reset, LISTENER_OPTIONS);
    scroller.addEventListener('gesturestart', onGestureStart, LISTENER_OPTIONS);

    return () => {
      scroller.removeEventListener('touchstart', onTouchStart, LISTENER_OPTIONS);
      scroller.removeEventListener('touchmove', onTouchMove, LISTENER_OPTIONS);
      scroller.removeEventListener('touchend', onTouchEnd, LISTENER_OPTIONS);
      scroller.removeEventListener('touchcancel', reset, LISTENER_OPTIONS);
      scroller.removeEventListener('gesturestart', onGestureStart, LISTENER_OPTIONS);
    };
  };
}
