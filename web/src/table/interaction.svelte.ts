import type { TableElement } from './actions';

/** How long the bar and the preview stay after the pointer leaves their element. */
export const LINGER_MS = 250;

/** A token or status of a table card, found again by its names after every redraw. */
export interface CounterTarget {
  card: string;
  kind: 'token' | 'status';
  name: string;
}

/** What hovering an element does to the side preview. */
export type PreviewChange = 'show' | 'keep' | 'clear';

/**
 * What the viewer points at on the table, shared by the table, the hand, the
 * action bar and the side panel. Ids rather than faces, so the preview and
 * the bar follow their element through redraws (a flip, a pile's new top
 * card).
 */
class TableInteraction {
  /** What the action bar and the keys act on. */
  hovered = $state.raw<TableElement | null>(null);
  /** What the side preview shows: hovering a deck keeps the previous one. */
  previewed = $state.raw<TableElement | null>(null);
  /** The cards of the hovered history line, ringed on the table. */
  highlighted = $state.raw<ReadonlySet<string>>(new Set());
  /** A tap selected the hovered element (touch): it stays until released. */
  locked = $state(false);
  /** The card an arrow starts from, while the viewer picks its target. */
  arrowFrom = $state<string | null>(null);
  /** The id of the bar item whose dropdown is open. */
  menu = $state<string | null>(null);
  /** The pointer is on the bar or its dropdown. */
  onBar = $state(false);

  /** The token or status the viewer points at: its − / + pill shows above it. */
  counter = $state.raw<CounterTarget | null>(null);
  /** The pointer is on the pill. */
  onPill = $state(false);

  #pointer = { x: NaN, y: NaN };
  // Where the pointer was when the table was last redrawn.
  #drawnAt = { x: NaN, y: NaN };
  #pointerType = 'mouse';
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #counterTimer: ReturnType<typeof setTimeout> | undefined;

  /** Follows the pointer, to tell real hovers from the ones a redraw fires. */
  pointerMoved(event: PointerEvent): void {
    this.#pointer = { x: event.clientX, y: event.clientY };
  }

  /** Remembers the kind of the last pointer pressed: only a touch tap selects. */
  pointerPressed(event: PointerEvent): void {
    this.#pointerType = event.pointerType || 'mouse';
  }

  /** To call when the table is redrawn. */
  redrawn(): void {
    this.#drawnAt = { ...this.#pointer };
  }

  /**
   * When a redraw puts a new element under a pointer at rest, the browser
   * reports it as entered at the very spot the pointer was resting. That is
   * not the viewer hovering something new.
   */
  #isReal(event: PointerEvent): boolean {
    return !(event.clientX === this.#drawnAt.x && event.clientY === this.#drawnAt.y);
  }

  /** The pointer entered a card, a pile or a hand card. */
  enter(element: TableElement, event: PointerEvent, preview: PreviewChange = 'show'): void {
    if (!this.#isReal(event)) {
      return;
    }
    this.#cancelHide();
    if (this.locked) {
      return;
    }
    // An open dropdown belongs to the bar's element: it stays the bar's.
    if (this.menu === null) {
      this.hovered = element;
    }
    this.#changePreview(element, preview);
  }

  /** The pointer entered something without actions: the previous element is dropped at once. */
  enterNothing(event: PointerEvent): void {
    if (!this.#isReal(event)) {
      return;
    }
    this.#cancelHide();
    if (this.locked || this.menu !== null) {
      return;
    }
    this.hovered = null;
    this.previewed = null;
  }

  /** The pointer left an element or the bar: they go after the linger, unless still in use. */
  leave(): void {
    this.#cancelHide();
    this.#hideTimer = setTimeout(() => {
      if (this.locked || this.menu !== null || this.onBar || this.onPill) {
        return;
      }
      this.hovered = null;
      this.previewed = null;
    }, LINGER_MS);
  }

  enterBar(): void {
    this.#cancelHide();
    this.onBar = true;
  }

  leaveBar(): void {
    this.onBar = false;
    this.leave();
  }

  /** The pointer entered a token or a status. */
  enterCounter(target: CounterTarget, event: PointerEvent): void {
    if (!this.#isReal(event)) {
      return;
    }
    this.#cancelCounterHide();
    this.counter = target;
  }

  /** The pointer left a token, a status or the pill: the pill goes after the linger, unless it is on it. */
  leaveCounter(): void {
    this.#cancelCounterHide();
    this.#counterTimer = setTimeout(() => {
      if (!this.onPill) {
        this.counter = null;
      }
    }, LINGER_MS);
  }

  enterPill(): void {
    this.#cancelCounterHide();
    this.onPill = true;
  }

  leavePill(): void {
    this.onPill = false;
    this.leaveCounter();
    // The card the pill belongs to lingers out with it.
    this.leave();
  }

  /** Drops the pill at once. */
  hideCounter(): void {
    this.#cancelCounterHide();
    this.counter = null;
  }

  isCounter(target: CounterTarget): boolean {
    const current = this.counter;
    return (
      current?.card === target.card && current.kind === target.kind && current.name === target.name
    );
  }

  /** A tap on an element. Only touch selects: with a mouse, hovering is enough. */
  select(element: TableElement, preview: PreviewChange = 'show'): void {
    if (this.#pointerType !== 'touch') {
      return;
    }
    this.#cancelHide();
    this.hovered = element;
    this.#changePreview(element, preview);
    this.locked = true;
  }

  /** Whether a tap selected this element. */
  isLocked(element: TableElement): boolean {
    const hovered = this.hovered;
    return this.locked && hovered?.kind === element.kind && hovered.id === element.id;
  }

  /** Lets go of the selection, the bar and the preview. */
  release(): void {
    this.#cancelHide();
    this.hideCounter();
    this.hovered = null;
    this.previewed = null;
    this.locked = false;
    this.menu = null;
  }

  startArrow(from: string): void {
    this.menu = null;
    this.arrowFrom = from;
  }

  endArrow(): void {
    this.arrowFrom = null;
  }

  /** Escape closes the open dropdown, or cancels the arrow, or releases the selection. */
  escape(): void {
    if (this.menu !== null) {
      this.menu = null;
    } else if (this.arrowFrom !== null) {
      this.arrowFrom = null;
    } else {
      this.release();
    }
  }

  /** Forgets everything: a previous game's state must not show in the next one. */
  reset(): void {
    this.release();
    this.highlighted = new Set();
    this.arrowFrom = null;
    this.onBar = false;
    this.onPill = false;
    this.#pointer = { x: NaN, y: NaN };
    this.#drawnAt = { x: NaN, y: NaN };
    this.#pointerType = 'mouse';
  }

  #changePreview(element: TableElement, preview: PreviewChange): void {
    if (preview === 'show') {
      this.previewed = element;
    } else if (preview === 'clear') {
      this.previewed = null;
    }
  }

  #cancelCounterHide(): void {
    clearTimeout(this.#counterTimer);
    this.#counterTimer = undefined;
  }

  #cancelHide(): void {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }
}

export const interaction = new TableInteraction();
