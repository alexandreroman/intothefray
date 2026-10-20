// The top bar of a small screen (SMALL_SCREEN_QUERY, lib/screen) slides out
// of view while the page scrolls down, and comes back as soon as it scrolls
// up, nears the top or is used. The decision is plain logic (AutoHide), fed by
// a scroll listener that keeps its result reactive (ScrollAutoHide).

import { untrack } from 'svelte';
import { on } from 'svelte/events';

/** The top bar's height, in px (TopBar.svelte). */
export const TOP_BAR_HEIGHT = 56;

/** The travel, in px, a scroll in one direction needs to hide or show the bar: less is jitter. */
export const SCROLL_THRESHOLD = 10;

/** Where a scroller is, as its scroll events report it. */
export interface ScrollMetrics {
  /** The vertical scroll offset, in px: negative or past the end during an overscroll bounce. */
  offset: number;
  /** The height of the whole content, in px. */
  scrollHeight: number;
  /** The height that shows, in px. */
  clientHeight: number;
}

/**
 * Whether the bar is hidden, from the vertical scroll offsets it is given one
 * after the other. It shows near the top, when the content cannot scroll,
 * after an upward scroll of the threshold, and all the while it is pinned (in
 * use). It hides after a downward scroll of the threshold past its own height.
 * The travel is counted from the last change of direction, so that jitter
 * never toggles it.
 */
export class AutoHide {
  #hidden = false;
  #pinned = false;
  // The last offset, clamped, and the one where the scroll last changed direction.
  #last = 0;
  #turn = 0;
  // 1 down, -1 up, 0 before the first move, or after an unpin.
  #direction = 0;

  get hidden(): boolean {
    return this.#hidden;
  }

  /** The last offset taken into account, within the scroller's range. */
  get offset(): number {
    return this.#last;
  }

  /**
   * Starts from the scroller's current position, deciding nothing: the next
   * scroll counts from there, rather than from the top.
   */
  startAt(metrics: ScrollMetrics): void {
    this.#last = clampedOffset(metrics);
    this.#turn = this.#last;
    this.#direction = 0;
  }

  /**
   * Pins the bar in view, or lets it go. Let go, it stays in view until the
   * next downward scroll of the threshold.
   */
  pin(pinned: boolean): void {
    this.#pinned = pinned;
    this.#direction = 0;
    if (pinned) {
      this.#hidden = false;
    }
  }

  /** Takes the scroller's new position into account. */
  scrolled(metrics: ScrollMetrics): void {
    const end = metrics.scrollHeight - metrics.clientHeight;
    if (end <= 0) {
      this.#hidden = false;
      this.#last = 0;
      this.#turn = 0;
      this.#direction = 0;
      return;
    }

    const offset = clampedOffset(metrics);
    const delta = offset - this.#last;
    if (delta === 0) {
      return;
    }

    const direction = Math.sign(delta);
    if (direction !== this.#direction) {
      this.#direction = direction;
      this.#turn = this.#last;
    }
    this.#last = offset;

    if (this.#pinned || offset <= TOP_BAR_HEIGHT) {
      this.#hidden = false;
      return;
    }
    const travel = Math.abs(offset - this.#turn);
    if (travel >= SCROLL_THRESHOLD) {
      this.#hidden = direction > 0;
    }
  }
}

/** The vertical offset that counts: an overscroll bounce (iOS, Safari) at either end does not move it. */
function clampedOffset(metrics: ScrollMetrics): number {
  const end = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  return Math.min(Math.max(metrics.offset, 0), end);
}

/** What scrolls under the bar: the window, or an element of its own. */
export type ScrollSource = Window | HTMLElement;

function metricsOf(source: ScrollSource): ScrollMetrics {
  if (source instanceof HTMLElement) {
    return {
      offset: source.scrollTop,
      scrollHeight: source.scrollHeight,
      clientHeight: source.clientHeight,
    };
  }
  return {
    offset: source.scrollY,
    scrollHeight: source.document.documentElement.scrollHeight,
    // The window's own height: the end of the page is reached when its bottom shows.
    clientHeight: source.innerHeight,
  };
}

export interface ScrollAutoHideOptions {
  /** What scrolls under the bar. */
  source: () => ScrollSource;
  /** Whether the bar may hide at all (a small screen): when not, nothing is listened to. */
  enabled: () => boolean;
  /** Whether the bar is in use and stays in view. */
  pinned: () => boolean;
}

/**
 * Whether the bar is hidden, reactively, from the scroll events of its source.
 * Created while a component is initialised: it listens for as long as the
 * component lives and the bar may hide.
 */
export class ScrollAutoHide {
  #hidden = $state(false);
  // The source listened to and its decision, none while the bar may not hide.
  #source: ScrollSource | null = null;
  #logic: AutoHide | null = null;

  constructor(options: ScrollAutoHideOptions) {
    $effect(() => {
      if (!options.enabled()) {
        return;
      }
      const source = options.source();
      const logic = new AutoHide();
      logic.startAt(metricsOf(source));
      // A pin alone does not set the listener up again: the second effect hands it over.
      logic.pin(untrack(options.pinned));
      this.#source = source;
      this.#logic = logic;
      const off = on(
        source,
        'scroll',
        () => {
          logic.scrolled(metricsOf(source));
          this.#hidden = logic.hidden;
        },
        { passive: true },
      );
      return () => {
        off();
        this.#source = null;
        this.#logic = null;
        this.#hidden = false;
      };
    });

    $effect(() => {
      const pinned = options.pinned();
      this.#logic?.pin(pinned);
      this.#hidden = this.#logic?.hidden ?? false;
    });
  }

  get hidden(): boolean {
    return this.#hidden;
  }

  /**
   * Keeps the reader's place as focus enters the hidden bar: the browser
   * scrolls the page to bring the focused control into view, which the bar,
   * shown again, makes needless. The scroll is undone before the next paint,
   * once the browser has made it, back to the last offset the bar knew.
   */
  keepPlace(): void {
    const source = this.#source;
    const logic = this.#logic;
    if (!this.#hidden || !source || !logic) {
      return;
    }
    const offset = logic.offset;
    requestAnimationFrame(() => {
      if (metricsOf(source).offset !== offset) {
        source.scrollTo({ top: offset, behavior: 'instant' });
      }
    });
  }
}
