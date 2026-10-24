import { modal } from '../components/modal.svelte';
import type { CardView, MarkerName } from '../lib/types';
import type { CounterKind, TableElement } from './actions';
import type { Rect } from './drag';
import { isFree } from './selection';

/** How long the hover and the preview stay after the pointer leaves their element. */
export const LINGER_MS = 100;

/** How long a drop waits for the server's answer before its cards go back. */
export const LANDING_MS = 2000;

/** A token, status or modifier of a table card, found again by its names after every redraw. */
export interface CounterTarget {
  card: string;
  kind: CounterKind;
  name: string;
}

/** A card of the viewer's hand: the only element a tap selects. */
export type HandCard = Extract<TableElement, { kind: 'hand' }>;

/** What a press can drag: a table element, or a marker (the first player token, the active counter). */
export type Pressable = TableElement | { kind: 'marker'; name: MarkerName };

/**
 * A card, a pile, a hand card or a marker pressed: it becomes
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

/** A table card or pile whose context menu is open, and the point of the screen it opens at. */
export interface ContextMenuAt {
  element: TableElement;
  at: { x: number; y: number };
}

/** What hovering an element does to the side preview. */
export type PreviewChange = 'show' | 'clear';

/**
 * Whether a contextmenu event comes from a touch: a long touch fires one on
 * Android, and only a tap opens a context menu on touch. The event's own
 * pointerType tells where the browser sets it (a PointerEvent, in Chrome);
 * elsewhere, the kind of pointer of the press that began it does.
 */
export function isTouchContextMenu(event: MouseEvent, pressType: string): boolean {
  const eventType = event instanceof PointerEvent ? event.pointerType : '';
  return (eventType || pressType) === 'touch';
}

/** A touch held longer than this, in ms, is a long press, which opens nothing. */
export const LONG_PRESS_MS = 500;

/**
 * Whether a click ends a long touch press: iOS fires no contextmenu event,
 * but may fire a click once the finger lifts after a long hold, which must
 * open nothing either. pressedAt is the timeStamp of the press it ends.
 */
export function isLongTouchClick(click: MouseEvent, pressType: string, pressedAt: number): boolean {
  return pressType === 'touch' && click.timeStamp - pressedAt > LONG_PRESS_MS;
}

/**
 * What the viewer points at on the table, shared by the table, the hand, the
 * context menu and the side panel. Ids rather than faces, so the preview and
 * the menu follow their element through redraws (a flip, a pile's new top
 * card).
 */
class TableInteraction {
  /** What the keys act on: the element under the pointer, or the one whose context menu is open. */
  hovered = $state.raw<TableElement | null>(null);
  /** The element previewed: the preview shows its face, and nothing for a card back. */
  previewed = $state.raw<TableElement | null>(null);
  /** Touch mode (touch.ts): nothing is ever previewed. The table keeps it in step with the screen. */
  touchMode = $state(false);
  /** The cards of the hovered history line, ringed on the table. */
  highlighted = $state.raw<ReadonlySet<string>>(new Set());
  /**
   * The table cards other players drag: hidden in place while their ghosts
   * follow those players' pointers (Presence.svelte).
   */
  liftedByOthers = $state.raw<ReadonlySet<string>>(new Set());
  /** The markers other players drag: hidden in place meanwhile (Presence.svelte). */
  markersLiftedByOthers = $state.raw<ReadonlySet<MarkerName>>(new Set());
  /**
   * The cards and piles other players preview, with the colour of the player
   * who does: each draws that player's ring itself, so that the ring follows
   * it through every move, turn and tilt (Presence.svelte).
   */
  previewedByOthers = $state.raw<ReadonlyMap<string, number>>(new Map());
  /** A tap selected the hovered hand card (touch): it stays until released. */
  locked = $state(false);
  /** The card an arrow starts from, while the viewer picks its target. */
  arrowFrom = $state<string | null>(null);
  /** The arrow is drawn with Shift + drag: releasing the button picks its target. */
  arrowDrag = $state(false);
  /**
   * The context menu open, if any. Its element is the hovered one, and stays
   * so while it is open: neither hovers nor redraws change what it is for.
   */
  contextMenu = $state.raw<ContextMenuAt | null>(null);

  /** The token or status the viewer points at: its − / + pill shows above it. */
  counter = $state.raw<CounterTarget | null>(null);
  /**
   * The pointer is within reach of the pill: on it, on its token, or in the
   * room between them (TokenPill.svelte).
   */
  onPill = $state(false);
  /**
   * A tap showed the pill: touch has no hover, so it stays, and so does the
   * hover of its card, until a press elsewhere, Escape, or its token goes.
   */
  counterPinned = $state(false);

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
  // When the current press began: the timeStamp of its event.
  #pressedAt = 0;
  // The click that ends a drag, or that picks an arrow's target, is not a click on what lies there.
  #swallowClick = false;
  // The element whose context menu was open as the current press began: the press closes it
  // (ContextMenu.svelte), and the click it ends must not open it again.
  #menuAtPress: TableElement | null = null;
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
   * hovered, as if entered, so that the ring, the preview and the keys
   * follow it at once; null when no card is there any more, which drops a
   * hovered card (a hovered pile keeps its hover). Not while a dialog is
   * open, nor during a drag, nor while a selection, the context menu or the
   * pill holds the hover: what they are for must not change under them
   * (spec 5.8).
   */
  rehover(element: TableElement | null, preview: PreviewChange = 'show'): void {
    if (
      modal.open ||
      this.dragging ||
      this.locked ||
      this.contextMenu !== null ||
      this.#pillHolds()
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
    this.#changePreview(element, preview);
  }

  /**
   * To call on every press, in the capture phase of the window, before the
   * open context menu sees it: remembers the kind of pointer (only a touch tap
   * selects a hand card) and the menu the press closes.
   */
  pointerPressed(event: PointerEvent): void {
    this.#pointerType = event.pointerType || 'mouse';
    this.#pressedAt = event.timeStamp;
    this.#swallowClick = false;
    this.#menuAtPress = this.contextMenu?.element ?? null;
  }

  /** Whether a touch fired that contextmenu event, which then opens no context menu. */
  isTouchContextMenu(event: MouseEvent): boolean {
    return isTouchContextMenu(event, this.#pointerType);
  }

  /** Whether that click ends a long touch press, which opens nothing. */
  isLongTouchClick(event: MouseEvent): boolean {
    return isLongTouchClick(event, this.#pointerType, this.#pressedAt);
  }

  /**
   * Whether the current press closed that element's context menu: its click
   * leaves the menu closed rather than opening it again.
   */
  closedByPress(element: TableElement): boolean {
    const closed = this.#menuAtPress;
    return closed?.kind === element.kind && closed.id === element.id;
  }

  /** The click that follows the current press opens nothing and selects nothing. */
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

  /** The press turned into a drag: the token pill goes. */
  lift(card: string | null, lifted: readonly string[]): void {
    if (this.held === null) {
      return;
    }
    this.held = { ...this.held, moved: true, card, lifted };
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

  /** Whether the marker is dragged or just dropped, drawn in the drag layer instead. */
  markerMoving(name: MarkerName): boolean {
    return this.#moving().some(
      (moving) => moving.element.kind === 'marker' && moving.element.name === name,
    );
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
    // A tap selection, or the context menu, holds its element and the preview.
    if (this.locked || this.contextMenu !== null) {
      return;
    }
    this.hovered = element;
    this.#changePreview(element, preview);
  }

  /** The pointer entered something without actions: the previous element is dropped at once. */
  enterNothing(event: PointerEvent): void {
    if (!this.#isReal(event) || this.dragging) {
      return;
    }
    this.#cancelHide();
    if (this.locked || this.contextMenu !== null) {
      return;
    }
    this.hovered = null;
    this.previewed = null;
  }

  /**
   * The pointer left an element: it goes after the linger, unless still in
   * use, as the card of a pill within reach. The linger spares the preview a
   * flicker between two cards.
   */
  leave(): void {
    this.#cancelHide();
    this.#hideTimer = setTimeout(() => {
      if (this.locked || this.contextMenu !== null || this.#pillHolds()) {
        return;
      }
      this.hovered = null;
      this.previewed = null;
    }, LINGER_MS);
  }

  /**
   * The pointer entered a token or a status: its pill shows. A finger
   * entering it is a tap, which pins the pill; another token's tap moves it
   * there.
   */
  enterCounter(target: CounterTarget, event: PointerEvent): void {
    if (!this.#isReal(event) || modal.open) {
      return;
    }
    this.#cancelCounterHide();
    this.counter = target;
    this.counterPinned = event.pointerType === 'touch';
  }

  /**
   * The pointer left a token, a status or the pill's reach: the pill goes
   * after the linger, unless the pointer is within its reach or a tap pinned
   * it.
   */
  leaveCounter(): void {
    this.#cancelCounterHide();
    this.#counterTimer = setTimeout(() => {
      if (!this.#pillHolds()) {
        this.counter = null;
      }
    }, LINGER_MS);
  }

  /** The pointer came within reach of the pill: the pill stays, and so does its card's hover. */
  enterPill(): void {
    this.#cancelCounterHide();
    this.onPill = true;
  }

  /**
   * The pointer left the pill's reach: the pill goes after the linger, and
   * the card it belongs to lingers out with it. Not when the pointer is back
   * on that card, which keeps its hover, nor when it hovers another element
   * already.
   */
  leavePill(onItsCard: boolean): void {
    const card = this.counter?.card;
    this.onPill = false;
    this.leaveCounter();
    const hovered = this.hovered;
    if (!onItsCard && hovered?.kind === 'card' && hovered.id === card) {
      this.leave();
    }
  }

  /** Drops the pill at once, pinned or not. */
  hideCounter(): void {
    this.#cancelCounterHide();
    this.counter = null;
    this.counterPinned = false;
  }

  /**
   * Drops the pill a tap pinned, on a press elsewhere or Escape. Its card's
   * hover lingers out with it, unless that press hovered another element.
   */
  unpinCounter(): void {
    const card = this.counter?.card;
    this.hideCounter();
    const hovered = this.hovered;
    if (hovered?.kind === 'card' && hovered.id === card) {
      this.leave();
    }
  }

  isCounter(target: CounterTarget): boolean {
    const current = this.counter;
    return (
      current?.card === target.card && current.kind === target.kind && current.name === target.name
    );
  }

  /**
   * A tap on a hand card. Only touch selects: with a mouse, hovering is
   * enough. A table card or pile opens its context menu instead (Table.svelte).
   */
  select(element: HandCard): void {
    if (this.#pointerType !== 'touch' || modal.open) {
      return;
    }
    this.#cancelHide();
    this.hovered = element;
    this.#changePreview(element, 'show');
    this.locked = true;
  }

  /** Whether the pointer rests on this element, which a tap did not select: it is ringed. */
  isHovered(element: TableElement): boolean {
    const hovered = this.hovered;
    return !this.locked && hovered?.kind === element.kind && hovered.id === element.id;
  }

  /** Whether a tap selected this hand card. */
  isLocked(element: HandCard): boolean {
    const hovered = this.hovered;
    return this.locked && hovered?.kind === element.kind && hovered.id === element.id;
  }

  /** Lets go of the selection, the context menu and the preview. */
  release(): void {
    this.#cancelHide();
    this.hideCounter();
    this.hovered = null;
    this.previewed = null;
    this.locked = false;
    this.contextMenu = null;
  }

  /**
   * Opens the context menu of a table card or pile at that point of the
   * screen: the element becomes the hovered and the previewed one, without a
   * tap selection, and the token pill goes. Previewed too, since the click
   * may come while another element's menu held the hover and the preview;
   * touch mode previews nothing. The press that opened it (a right click, or
   * Ctrl + click on macOS) does not become a drag.
   */
  openContextMenu(
    element: TableElement,
    at: { x: number; y: number },
    preview: PreviewChange = 'show',
  ): void {
    if (modal.open || this.dragging !== null) {
      return;
    }
    this.#cancelHide();
    this.hideCounter();
    this.locked = false;
    this.hovered = element;
    this.#changePreview(element, preview);
    this.letGo();
    this.contextMenu = { element, at };
  }

  /**
   * Closes the context menu. The pointer may be anywhere by then: its element
   * goes after the linger, unless the pointer enters it again.
   */
  closeContextMenu(): void {
    if (this.contextMenu === null) {
      return;
    }
    this.contextMenu = null;
    this.leave();
  }

  /** Starts an arrow from that card: picked with a click, or, with `drag`, where the button is let go. */
  startArrow(from: string, drag = false): void {
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
   * Escape closes the pill a tap pinned, and only that: the group stays.
   * Otherwise it clears the group and the band, and cancels the arrow, or
   * releases the selection. An open context menu takes Escape before it gets
   * here (ContextMenu.svelte), and closes alone.
   *
   * Returns whether it dropped something the viewer set up (the pinned pill, a
   * group, the band, an arrow, or a tap selection): the key then belongs to
   * the table, rather than to fullscreen (lib/fullscreen). A mere hover it
   * releases is no such thing.
   */
  escape(): boolean {
    if (this.counterPinned) {
      this.unpinCounter();
      return true;
    }
    const dropped =
      this.group.size > 0 || this.band !== null || this.arrowFrom !== null || this.locked;
    this.clearGroup();
    this.band = null;
    if (this.arrowFrom !== null) {
      this.endArrow();
    } else {
      this.release();
    }
    return dropped;
  }

  /** Enters or leaves touch mode; entering it drops the preview shown, if any. */
  setTouchMode(on: boolean): void {
    this.touchMode = on;
    if (on) {
      this.previewed = null;
    }
  }

  /** Forgets everything: a previous game's state must not show in the next one. */
  reset(): void {
    this.release();
    this.touchMode = false;
    this.letGo();
    this.endLanding();
    this.clearGroup();
    this.band = null;
    this.#swallowClick = false;
    this.#menuAtPress = null;
    this.highlighted = new Set();
    this.liftedByOthers = new Set();
    this.markersLiftedByOthers = new Set();
    this.previewedByOthers = new Map();
    this.endArrow();
    this.onPill = false;
    this.#pointer = { x: NaN, y: NaN };
    this.#drawnAt = { x: NaN, y: NaN };
    this.#pointerType = 'mouse';
    this.#pressedAt = 0;
  }

  /** A hand card is never previewed: the raised hand shows it large enough. Nothing is, in touch mode. */
  #changePreview(element: TableElement, preview: PreviewChange): void {
    if (preview === 'clear' || element.kind === 'hand' || this.touchMode) {
      this.previewed = null;
    } else if (preview === 'show') {
      this.previewed = element;
    }
  }

  /** The pill keeps itself and its card's hover: the pointer is within its reach, or a tap pinned it. */
  #pillHolds(): boolean {
    return this.onPill || this.counterPinned;
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
