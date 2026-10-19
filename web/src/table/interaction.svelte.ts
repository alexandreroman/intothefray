import { modal } from '../components/modal.svelte';
import type { CardView } from '../lib/types';
import type { TableElement } from './actions';
import type { Rect } from './drag';
import { isFree } from './selection';

/** How long the bar and the preview stay after the pointer leaves their element. */
export const LINGER_MS = 100;

/** How long a drop waits for the server's answer before its cards go back. */
export const LANDING_MS = 2000;

/** A token or status of a table card, found again by its names after every redraw. */
export interface CounterTarget {
  card: string;
  kind: 'token' | 'status';
  name: string;
}

/** What a press can drag: a table element, or the first player token. */
export type Pressable = TableElement | { kind: 'firstPlayer' };

/**
 * A card, a pile, a hand card or the first player token pressed: it becomes
 * a drag once the pointer moves (drag.ts). Ids only, so the drag outlives new
 * views.
 */
export interface Held {
  element: Pressable;
  pointerId: number;
  /** Where it was pressed, on the screen. */
  start: { x: number; y: number };
  /** Past the threshold: it is being dragged. */
  moved: boolean;
  /** The card it moves, as the drag started; null for the encounter deck's hidden top card. */
  card: string | null;
  /** The table and hand cards that move with it, hidden while their ghost follows the pointer. */
  lifted: readonly string[];
}

/**
 * A drop sent to the server: its cards stay where they were dropped until the
 * next view shows where they went, or the server refuses the action, or no
 * answer comes in time.
 */
export interface Landing {
  /** The id the session gave the action, which the server echoes in an error. */
  action: number;
  /** What was dragged, as in Held. */
  element: Pressable;
  card: string | null;
  /** The table and hand cards still hidden in their old places. */
  lifted: readonly string[];
  /** The order a reordered hand is drawn in meanwhile. */
  handOrder: readonly string[] | null;
}

/** What a drop would go onto, outlined during a drag: a card, a pile, or the viewer's hand. */
export interface DropOn {
  kind: 'card' | 'pile' | 'hand';
  /** The card, the pile, or the area whose hand it is. */
  id: string;
}

/** What hovering an element does to the side preview. */
export type PreviewChange = 'show' | 'clear';

/** A rectangle on the screen, in CSS pixels. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What the viewer points at on the table, shared by the table, the hand, the
 * action bar and the side panel. Ids rather than faces, so the preview and
 * the bar follow their element through redraws (a flip, a pile's new top
 * card).
 */
class TableInteraction {
  /** What the action bar and the keys act on. */
  hovered = $state.raw<TableElement | null>(null);
  /** The element previewed: the preview shows its face, and nothing for a card back. */
  previewed = $state.raw<TableElement | null>(null);
  /** The cards of the hovered history line, ringed on the table. */
  highlighted = $state.raw<ReadonlySet<string>>(new Set());
  /**
   * The table cards other players drag: hidden in place while their ghosts
   * follow those players' pointers (Presence.svelte).
   */
  liftedByOthers = $state.raw<ReadonlySet<string>>(new Set());
  /** Another player drags the first player token: it is hidden in place meanwhile (Presence.svelte). */
  tokenLiftedByOthers = $state(false);
  /**
   * The cards and piles other players preview, with the colour of the player
   * who does: each draws that player's ring itself, so that the ring follows
   * it through every move, turn and tilt (Presence.svelte).
   */
  previewedByOthers = $state.raw<ReadonlyMap<string, number>>(new Map());
  /** A tap selected the hovered element (touch): it stays until released. */
  locked = $state(false);
  /** The card an arrow starts from, while the viewer picks its target. */
  arrowFrom = $state<string | null>(null);
  /** The arrow is drawn with Shift + drag: releasing the button picks its target. */
  arrowDrag = $state(false);
  /** The id of the bar item whose dropdown is open. */
  menu = $state<string | null>(null);
  /** The pointer is on the bar or its dropdown. */
  onBar = $state(false);
  /**
   * The way from the hovered element to its bar, set by the bar as it is
   * placed: the gap between them, and the part of the element's box next to
   * the bar, which a tilted (exhausted) card leaves partly bare. The linger
   * does not run out while the pointer is there.
   */
  barWay: ScreenBox | null = null;

  /** The token or status the viewer points at: its − / + pill shows above it. */
  counter = $state.raw<CounterTarget | null>(null);
  /** The pointer is on the pill. */
  onPill = $state(false);

  /** The element pressed or dragged, if any. */
  held = $state.raw<Held | null>(null);
  /** What the dragged element would be dropped on, outlined. */
  dropOn = $state.raw<DropOn | null>(null);
  /** Where the dragged hand card would slot back in, while it is over the hand. */
  handGap = $state<number | null>(null);
  /** The last drop, while it waits for the server. */
  landing = $state.raw<Landing | null>(null);

  /** The table cards the rubber band selected: pressing one of them drags them all. */
  group = $state.raw<ReadonlySet<string>>(new Set());
  /** The rubber band being drawn, on the screen in CSS pixels. */
  band = $state.raw<Rect | null>(null);

  #pointer = { x: NaN, y: NaN };
  // Where the pointer was when the table was last redrawn.
  #drawnAt = { x: NaN, y: NaN };
  #pointerType = 'mouse';
  // The click that ends a drag, or that picks an arrow's target, is not a tap on what lies there.
  #swallowClick = false;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #counterTimer: ReturnType<typeof setTimeout> | undefined;
  #landingTimer: ReturnType<typeof setTimeout> | undefined;

  /** Follows the pointer, to tell real hovers from the ones a redraw fires. */
  pointerMoved(event: PointerEvent): void {
    this.#pointer = { x: event.clientX, y: event.clientY };
  }

  /** Where the pointer was last seen on the screen; not a number before it moved. */
  get pointer(): { x: number; y: number } {
    return { ...this.#pointer };
  }

  /**
   * A new view redrew what lies under a pointer at rest, whoever acted: a
   * card dropped, moved, turned over or taken away. What is there now is
   * hovered, as if entered, so that the ring, the bar, the preview and the
   * keys follow it at once; null when no card is there any more, which drops
   * a hovered card (a hovered pile keeps its hover). Not while a dialog is
   * open, nor during a drag, nor while a selection, a dropdown, the bar or
   * the pill holds the hover: the bar must not jump from under the pointer
   * (spec 5.8).
   */
  rehover(element: TableElement | null): void {
    if (
      modal.open ||
      this.dragging ||
      this.locked ||
      this.menu !== null ||
      this.onBar ||
      this.onPill
    ) {
      return;
    }
    if (element === null) {
      if (this.hovered !== null && this.hovered.kind !== 'pile') {
        this.#cancelHide();
        this.hovered = null;
        this.previewed = null;
      }
      return;
    }
    this.#cancelHide();
    this.hovered = element;
    this.#changePreview(element, 'show');
  }

  /** Remembers the kind of the last pointer pressed: only a touch tap selects. */
  pointerPressed(event: PointerEvent): void {
    this.#pointerType = event.pointerType || 'mouse';
    this.#swallowClick = false;
  }

  /** The click that follows the current press selects nothing. */
  swallowNextClick(): void {
    this.#swallowClick = true;
  }

  /** To call on every click, in the capture phase: stops the one to swallow. */
  clicked(event: MouseEvent): void {
    if (this.#swallowClick) {
      this.#swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  /** The element being dragged, once the pointer has moved: a press alone is not a drag. */
  get dragging(): Held | null {
    return this.held?.moved ? this.held : null;
  }

  /** A press on a card, a pile, a hand card or the token, with the main button or a finger. */
  press(element: Pressable, event: PointerEvent): void {
    // A second finger does not take over a drag; a dialog freezes the table.
    if (event.button !== 0 || this.dragging !== null || modal.open) {
      return;
    }
    // No text selection or native image drag: the press may become our drag.
    event.preventDefault();
    this.held = {
      element,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
      card: null,
      lifted: [],
    };
  }

  /** The press turned into a drag: the bar's dropdown and the token pill go. */
  lift(card: string | null, lifted: readonly string[]): void {
    if (this.held === null) {
      return;
    }
    this.held = { ...this.held, moved: true, card, lifted };
    this.menu = null;
    this.hideCounter();
  }

  /** The drag under way and the drop waiting for the server, if any. */
  #moving(): (Held | Landing)[] {
    const moving: (Held | Landing)[] = [];
    if (this.dragging) {
      moving.push(this.dragging);
    }
    if (this.landing) {
      moving.push(this.landing);
    }
    return moving;
  }

  /**
   * Whether the card is dragged or just dropped, by the viewer or by another
   * player: its ghost is drawn elsewhere instead.
   */
  isLifted(id: string): boolean {
    return (
      this.liftedByOthers.has(id) || this.#moving().some((moving) => moving.lifted.includes(id))
    );
  }

  /** The table cards other players drag now; a set equal to the current one changes nothing. */
  liftByOthers(ids: ReadonlySet<string>): void {
    const same =
      ids.size === this.liftedByOthers.size && [...ids].every((id) => this.liftedByOthers.has(id));
    if (!same) {
      this.liftedByOthers = ids;
    }
  }

  /** The cards and piles other players preview now; a map equal to the current one changes nothing. */
  previewByOthers(previews: ReadonlyMap<string, number>): void {
    const current = this.previewedByOthers;
    const same =
      previews.size === current.size &&
      [...previews].every(([id, color]) => current.get(id) === color);
    if (!same) {
      this.previewedByOthers = previews;
    }
  }

  /** The colour of the other player who previews the card or pile, if any. */
  previewerOf(id: string): number | undefined {
    return this.previewedByOthers.get(id);
  }

  /** Whether the first player token is dragged or just dropped, drawn in the drag layer instead. */
  get tokenMoving(): boolean {
    return this.#moving().some((moving) => moving.element.kind === 'firstPlayer');
  }

  /**
   * The cards that the drag, or the drop waiting for the server, took from
   * that pile: the pile is drawn without them. Null stands for the encounter
   * deck's hidden top card.
   */
  takenFrom(pile: string): (string | null)[] {
    return this.#moving()
      .filter((moving) => moving.element.kind === 'pile' && moving.element.id === pile)
      .map((moving) => moving.card);
  }

  /** A drop was sent to the server: its cards stay where they landed meanwhile. */
  land(landing: Landing): void {
    this.endLanding();
    this.landing = landing;
    this.#landingTimer = setTimeout(() => this.endLanding(), LANDING_MS);
  }

  /** The drop is over: a new view shows it, or it was refused, or no answer came in time. */
  endLanding(): void {
    clearTimeout(this.#landingTimer);
    this.#landingTimer = undefined;
    this.landing = null;
  }

  /** The server refused the action of that id. */
  refused(action: number): void {
    if (this.landing?.action === action) {
      this.endLanding();
    }
  }

  /** The press or the drag is over: dropped, or cancelled. */
  letGo(): void {
    this.held = null;
    this.dropOn = null;
    this.handGap = null;
  }

  /** To call when the table is redrawn by a view or a zoom. */
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
    // The pointer passes over what lies under a drag: that is not hovering it. A dialog freezes the table.
    if (!this.#isReal(event) || this.dragging || modal.open) {
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
    if (!this.#isReal(event) || this.dragging) {
      return;
    }
    this.#cancelHide();
    if (this.locked || this.menu !== null) {
      return;
    }
    this.hovered = null;
    this.previewed = null;
  }

  /**
   * The pointer left an element or the bar: they go after the linger, unless
   * still in use. A pointer on its way to the bar gets as long as it takes,
   * however slowly it moves.
   */
  leave(): void {
    this.#cancelHide();
    this.#hideTimer = setTimeout(() => {
      if (this.locked || this.menu !== null || this.onBar || this.onPill) {
        return;
      }
      if (this.#onBarWay()) {
        this.leave();
        return;
      }
      this.hovered = null;
      this.previewed = null;
    }, LINGER_MS);
  }

  #onBarWay(): boolean {
    const way = this.barWay;
    const { x, y } = this.#pointer;
    return way !== null && x >= way.left && x < way.right && y >= way.top && y < way.bottom;
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
    if (!this.#isReal(event) || modal.open) {
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
    if (this.#pointerType !== 'touch' || modal.open) {
      return;
    }
    this.#cancelHide();
    this.hovered = element;
    this.#changePreview(element, preview);
    this.locked = true;
  }

  /** Whether the pointer rests on this element, which a tap did not select: it gets the bar. */
  isHovered(element: TableElement): boolean {
    const hovered = this.hovered;
    return !this.locked && hovered?.kind === element.kind && hovered.id === element.id;
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

  /** Starts an arrow from that card: picked with a click, or, with `drag`, where the button is let go. */
  startArrow(from: string, drag = false): void {
    this.menu = null;
    this.arrowFrom = from;
    this.arrowDrag = drag;
  }

  endArrow(): void {
    this.arrowFrom = null;
    this.arrowDrag = false;
  }

  /** The table cards the rubber band selected, replacing the previous ones. */
  setGroup(ids: ReadonlySet<string>): void {
    this.group = ids;
  }

  /** No table card is selected any more. */
  clearGroup(): void {
    this.group = new Set();
  }

  /**
   * A new view or another row shown: the selected cards that left the table,
   * went onto a pile, or are no longer drawn drop out of the group. The same
   * set stays when none did, so that nothing redraws.
   */
  pruneGroup(cards: readonly CardView[]): void {
    const free = new Set(cards.filter(isFree).map((card) => card.id));
    const kept = [...this.group].filter((id) => free.has(id));
    if (kept.length !== this.group.size) {
      this.group = new Set(kept);
    }
  }

  /**
   * Escape clears the group and the band, and closes the open dropdown, or
   * cancels the arrow, or releases the selection.
   */
  escape(): void {
    this.clearGroup();
    this.band = null;
    if (this.menu !== null) {
      this.menu = null;
    } else if (this.arrowFrom !== null) {
      this.endArrow();
    } else {
      this.release();
    }
  }

  /** Forgets everything: a previous game's state must not show in the next one. */
  reset(): void {
    this.release();
    this.letGo();
    this.endLanding();
    this.clearGroup();
    this.band = null;
    this.#swallowClick = false;
    this.highlighted = new Set();
    this.liftedByOthers = new Set();
    this.tokenLiftedByOthers = false;
    this.previewedByOthers = new Map();
    this.endArrow();
    this.onBar = false;
    this.barWay = null;
    this.onPill = false;
    this.#pointer = { x: NaN, y: NaN };
    this.#drawnAt = { x: NaN, y: NaN };
    this.#pointerType = 'mouse';
  }

  /** A hand card is never previewed: the raised hand shows it large enough. */
  #changePreview(element: TableElement, preview: PreviewChange): void {
    if (preview === 'clear' || element.kind === 'hand') {
      this.previewed = null;
    } else if (preview === 'show') {
      this.previewed = element;
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
