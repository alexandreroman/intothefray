// A long press on a touch screen: a finger held still on a table card or pile
// opens its context menu, as a right click does with a mouse. A finger that
// moves as far as a drag starts (DRAG_THRESHOLD), or lifts first, presses as
// before: it drags, scrolls or taps.

import { DRAG_THRESHOLD, type Point } from './drag';

/** How long a finger stays still before its press opens the context menu. */
export const LONG_PRESS_MS = 500;

/** Watches one touch press at a time, and fires once it has been held still long enough. */
export class LongPress {
  #pointerId: number | null = null;
  #start: Point = { x: 0, y: 0 };
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Starts watching a press, forgetting the previous one: onfire gets where it was pressed. */
  start(event: PointerEvent, onfire: (at: Point) => void): void {
    this.cancel();
    const at = { x: event.clientX, y: event.clientY };
    this.#pointerId = event.pointerId;
    this.#start = at;
    this.#timer = setTimeout(() => {
      this.cancel();
      onfire(at);
    }, LONG_PRESS_MS);
  }

  /** The pointer moved: past the drag threshold, the finger drags or scrolls rather than holds. */
  moved(event: PointerEvent): void {
    if (event.pointerId !== this.#pointerId) {
      return;
    }
    const distance = Math.hypot(event.clientX - this.#start.x, event.clientY - this.#start.y);
    if (distance >= DRAG_THRESHOLD) {
      this.cancel();
    }
  }

  /** The pointer lifted, or the browser took it over: the press was too short. */
  ended(event: PointerEvent): void {
    if (event.pointerId === this.#pointerId) {
      this.cancel();
    }
  }

  cancel(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pointerId = null;
  }
}
