<!--
  Drag and drop (spec 5.4). A press on a table card, a pile, a hand card or
  a marker (first player token, active counter) becomes a drag after 4 px (a
  finger pushing a hand card down swipes the hand away instead): what is dragged is drawn here,
  over the whole page at the table's zoom, outside the table's surface, so
  that new views redrawing the table leave it alone. The drop targets are
  measured on the screen and drag.ts decides what the drop sends. Once
  dropped, it stays drawn where it landed until the server answers. A card
  revealed on a deck is dragged as the table draws it: a side scheme turns
  from the deck's portrait slot to lie landscape. In touch mode, a finger on
  a table card, a pile or a marker must hold still for HOLD_MS before it
  drags: a quick swipe scrolls the table instead. In dock mode,
  the rows show a drop on the table before it is let go: this layer
  feeds the table where the drop would put the card, once a frame at most,
  and the table lays its rows out with the card there, pushing the others
  aside.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { byId } from '../lib/byId';
  import type { Rect } from '../lib/rect';
  import type {
    Action,
    Area,
    CardView as TableCard,
    MarkerName,
    PackFace,
    Point,
    PresenceDrag,
    SessionError,
    Size,
    View,
  } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import CardView from './CardView.svelte';
  import MarkerToken from './MarkerToken.svelte';
  import {
    contains,
    dealRecipient,
    DECK_TOP_ID,
    DRAG_THRESHOLD,
    DROP_DWELL_MS,
    DROP_MARGIN,
    dropAction,
    dropKey,
    dropTarget,
    ENCOUNTER_TOP_ID,
    goesToHand,
    handAreaOf,
    handBand,
    insertIndex,
    isDownward,
    mainCardOf,
    pileTargets,
    sourceOf,
    stackOf,
    SteadyDrop,
    takesHandDrop,
    tucks,
    unshifted,
    type DragSource,
    type DropRect,
    type DropSpot,
    type PileDrop,
    type TableRect,
  } from './drag';
  import { dockMode } from './dockMode';
  import type { DockPreview } from './dockLayout';
  import { dockCardBox } from './dockPiles';
  import { backCaption, isHidden, pileBack } from './face';
  import { HOLD_MS } from './gestures';
  import { FINE_GRID, type SnapGrid } from './grid';
  import { interaction, type DropOn, type Held, type Pressable } from './interaction.svelte';
  import { cardBox, HAND_CARD, isLandscape, MARKER_BOXES, type Box } from './layout';
  import { LIFT_SCALE, LIFT_SHADE, motion } from './motion.svelte';
  import { ALL_TABLE, drawnDelta, type TableMap } from './rows';
  import { surfaceRect, tableCard, tablePile, toScreen, toTable } from './screen';
  import { areaOf, seatHero, seatOf } from './seats';
  import { dragUnits, groupAction, groupPileTargets } from './selection';
  import { Sway } from './sway';

  let {
    view,
    zoom,
    root,
    faceOf,
    sizeOf,
    tableMap = ALL_TABLE,
    grid = FINE_GRID,
    selected,
    act,
    onhand,
    ondrag,
    onpreview = () => {},
    lastError,
  }: {
    view: View;
    zoom: number;
    /** The page the table is drawn in: the surface, the piles and the hand are measured there. */
    root: HTMLElement | undefined;
    faceOf: (card: TableCard | undefined) => PackFace | null;
    sizeOf: (card: TableCard) => Size;
    /** Where the view mode draws the points of the table (rows.ts, dockLayout.ts). */
    tableMap?: TableMap;
    /** The grid a drop on the table snaps to (grid.ts): the fine one unless given. */
    grid?: SnapGrid;
    /** The viewer's selected deck (spec 5): an encounter card dealt above every row goes to it. */
    selected: number | null;
    /** Sends a drop's action, about what was pressed: its id, or null when it could not be sent. */
    act: (action: Action, element: Pressable) => number | null;
    /** A card went to the hand of one of the viewer's decks: that seat's hand is the one to show. */
    onhand: (seat: number) => void;
    /** Tells the other players where the drag is, and null once it is over (spec 5.8). */
    ondrag: (drag: PresenceDrag | null) => void;
    /**
     * Dock mode only: the drop on the table the rows show before it is let go, null once
     * there is none, the drag over or its drop answered.
     */
    onpreview?: (preview: DockPreview | null) => void;
    /** The session's last error, which names the action it refuses. */
    lastError: SessionError | null;
  } = $props();

  // The top card of a deck is not known: its ghost is a face-down card, until the server answers.
  const ENCOUNTER_TOP: TableCard = {
    id: ENCOUNTER_TOP_ID,
    face: 0,
    faceDown: true,
    back: 'encounter',
    owner: -1,
    zone: 'table',
    x: 0,
    y: 0,
    z: 0,
  };

  /** The layer the ghosts are drawn in. */
  let layer = $state<HTMLElement>();
  /** The pointer during a drag, on the screen. */
  let pointer = $state<Point | null>(null);
  /** The other players were told of the drag: they must be told of its end. */
  let told = false;
  /**
   * The selected cards a group drag moves, each with its stack (selection.ts),
   * 2 at least; empty when one card or stack is dragged.
   */
  let units: readonly string[] = [];
  /** Where the pointer holds the dragged card, as fractions of its width and height. */
  let grab: Point = { x: 0.5, y: 0.5 };
  /** The size of a hand card as it was grabbed, on the screen. */
  let handSize: { w: number; h: number } = { w: HAND_CARD.w, h: HAND_CARD.h };
  /** The sway of the ghosts: they lean with the pointer's horizontal speed (sway.ts). */
  const sway = new Sway();
  // In dock mode the table draws its cards smaller, and so this layer draws the ghosts
  // (CardView): the grab, the corner and the drop follow the drawn box.
  const dock = dockMode();
  /** The frame that steps the sway next, 0 when it rests. */
  let swayFrame = 0;
  /**
   * The drag has just started: its first ghost rises off the table or the hand (@starting-style
   * under .rising). A ghost drawn later, as a hand card crosses the hand's edge, shows held up.
   */
  let rising = $state(false);
  /** The frame that ends the rise, 0 when none is pending. */
  let riseFrame = 0;
  /** The preview the table was last fed (onpreview), and the one the next frame feeds it. */
  let fedPreview: DockPreview | null = null;
  let pendingPreview: DockPreview | null = null;
  /** The frame that feeds the pending preview, 0 when none is pending. */
  let previewFrame = 0;
  /** The drop the rows show in dock mode, kept while the pointer wavers on its edge. */
  const steady = new SteadyDrop<Located | null>((found) =>
    dropKey(found?.target ?? null, found?.action ?? null),
  );
  /** The timer that shows the drop under a still pointer once it has stayed there, 0 when none. */
  let dwellTimer = 0;
  /** A label above a drop target, its middle and its bottom on the screen. */
  interface Hint {
    glyph: string;
    text: string;
    tuck: boolean;
    x: number;
    y: number;
  }

  /** The label above the drop target. */
  let hint = $state.raw<Hint | null>(null);

  /** What a drop lands on, and the action it sends, null when nothing would change. */
  interface Located {
    target: DropRect;
    action: Action | null;
  }

  // The server relays no more cards in one drag: it mirrors maxDragCards in internal/server/presence.go.
  const MAX_DRAG_CARDS = 50;
  // What the other players are told of a card hidden from them (ruling P5c-R9): its real id
  // would let them follow it once it is played.
  const HIDDEN_CARD = 'hidden-0';

  // The prototype's arrows in front of the labels.
  const PILE_GLYPHS: Record<PileDrop, string> = { top: '↑', discard: '✕', pile: '→', return: '↑' };
  const TUCK_GLYPH = '↓';
  const HAND_GLYPH = '↓';

  const cards = $derived(view.table?.cards ?? []);
  const tablePiles = $derived(view.table?.piles ?? []);
  const cardsById = $derived(byId(cards));
  /**
   * The ghosts of the last drop, set down where it landed (the cards, or the
   * marker's corner, in table units of the layer), the action
   * they wait for, and the view they were dropped on.
   */
  let landed = $state.raw<{
    action: number;
    ghosts: TableCard[];
    token: (Point & { name: MarkerName }) | null;
    view: View;
  } | null>(null);

  const held = $derived(interaction.dragging);
  // Read from the current view at every redraw: the drag follows its card by id.
  const source = $derived(held ? sourceOf(held.element, view, held.card ?? undefined) : null);
  const overHand = $derived(interaction.handGap !== null);

  const DECK_TOP: TableCard = { ...ENCOUNTER_TOP, id: DECK_TOP_ID, back: 'player' };

  /** The card a source moves; null for a deck's hidden top card and a marker. */
  function movedCard(from: DragSource): string | null {
    switch (from.kind) {
      case 'encounter':
      case 'deck':
      case 'marker':
        return null;
      default:
        return from.card;
    }
  }

  /** Whether the dragged thing is still there in the view, the same card as when the drag started. */
  function isStillThere(drag: Held, from: DragSource | null): from is DragSource {
    return from !== null && movedCard(from) === drag.card;
  }

  // A new view keeps the drag going. When the dragged card left the table,
  // the hand or its pile meanwhile, it is cancelled and the drop will send
  // nothing.
  $effect(() => {
    if (held && !isStillThere(held, source)) {
      end();
    }
  });

  // The next view shows where the last drop went (or that it went nowhere):
  // its cards are drawn from the view again.
  $effect.pre(() => {
    const current = view;
    untrack(() => {
      if (landed && landed.view !== current) {
        landed = null;
        interaction.endLanding();
      }
    });
  });

  // With no drag and no drop waiting for the server, the rows show no drop: a cancelled drag, or one
  // let go anywhere else, lets the cards it pushed aside back; an answered drop shows in the view.
  $effect(() => {
    if (held === null && waiting === null) {
      untrack(() => feedPreview(null));
    }
  });

  // Pressing anything but a selected card lets go of the selection: what it
  // drags then is that alone.
  $effect(() => {
    const pressed = interaction.held;
    if (pressed && !pressed.moved) {
      untrack(() => {
        const element = pressed.element;
        const inGroup = element.kind === 'card' && interaction.group.has(element.id);
        if (!inGroup && interaction.group.size > 0) {
          interaction.clearGroup();
        }
      });
    }
  });

  // A touch press waiting for the hold arms once held for HOLD_MS, if what it holds can be dragged:
  // a spectator's press, or one on an empty pile, stays a tap or a scroll.
  $effect(() => {
    const pressed = interaction.held;
    if (!pressed || !interaction.awaitingHold) {
      return;
    }
    const timer = setTimeout(() => armIfDraggable(pressed), HOLD_MS);
    return () => clearTimeout(timer);
  });

  // Before any touch: a guard added only at a press could come too late for its touch.
  $effect(() => interaction.guardScroll());

  function armIfDraggable(pressed: Held): void {
    if (sourceOf(pressed.element, view) !== null) {
      interaction.arm();
    }
  }

  $effect(() => {
    const refused = lastError?.id;
    if (refused !== undefined) {
      untrack(() => interaction.refused(refused));
    }
  });

  function onMove(event: PointerEvent): void {
    const pressed = interaction.held;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    // No button down any more: it was let go outside the window, and its pointerup was missed.
    if (event.buttons === 0) {
      end();
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    if (!pressed.moved) {
      if (interaction.awaitingHold && !followHold(pressed, event)) {
        return;
      }
      if (Math.hypot(at.x - pressed.start.x, at.y - pressed.start.y) < DRAG_THRESHOLD) {
        return;
      }
      if (isHandSwipe(pressed, event, at)) {
        // Not a drag: the hand follows the finger down (Hand.svelte). The tap the release
        // would make on the card is no tap either.
        interaction.letGo();
        interaction.swallowNextClick();
        return;
      }
      if (isCarouselScroll(pressed, event, at)) {
        // Not a drag: the browser scrolls the carousel under the finger (its pointercancel follows).
        interaction.letGo();
        return;
      }
      const from = sourceOf(pressed.element, view);
      if (!from) {
        // Not draggable, or a spectator: the press stays a press.
        interaction.letGo();
        return;
      }
      start(from, pressed.start);
    }
    pointer = at;
    // A marker lies flat on the table: it does not sway.
    if (source?.kind !== 'marker') {
      swayWith(at.x);
    }
    aim();
    if (source) {
      tellOthers(source, at);
    }
  }

  /**
   * Follows a touch press waiting for the hold, and tells whether this move may drag it. Past the
   * slop before HOLD_MS, the finger scrolls the table: the press is let go, and the browser takes
   * the finger over (its pointercancel follows). Held long enough, it arms, should the timer be late.
   */
  function followHold(pressed: Held, event: PointerEvent): boolean {
    const phase = interaction.holdPhaseAt(event);
    if (phase === 'scroll') {
      interaction.letGo();
      return false;
    }
    if (phase === 'armed') {
      armIfDraggable(pressed);
    }
    return interaction.armed;
  }

  /** A finger pushing a hand card down: a swipe that lowers the hand, not a drag of the card. */
  function isHandSwipe(pressed: Held, event: PointerEvent, at: Point): boolean {
    return (
      pressed.element.kind === 'hand' &&
      event.pointerType === 'touch' &&
      isDownward(pressed.start, at)
    );
  }

  /**
   * A finger moving a card of the hand sheet's carousel other than mostly upwards: it scrolls the
   * carousel, as it may already have before the browser took the finger over. Only an upward move
   * drags the card out to the table; the fan has no carousel, and drags its cards sideways.
   */
  function isCarouselScroll(pressed: Held, event: PointerEvent, at: Point): boolean {
    return (
      pressed.element.kind === 'hand' &&
      event.pointerType === 'touch' &&
      interaction.inCarousel &&
      !isUpward(pressed.start, at)
    );
  }

  /** Whether the move from `from` to `to` goes mostly up. */
  function isUpward(from: Point, to: Point): boolean {
    return from.y - to.y > Math.abs(to.x - from.x);
  }

  /**
   * Picks up what was pressed, measured before anything is written: the move that starts the drag
   * goes on to measure the drop targets (aim) on the page as it is laid out already.
   */
  function start(from: DragSource, pressedAt: Point): void {
    grab = grabOf(from, pressedAt);
    stopSway();
    rise();
    units = from.kind === 'card' ? dragUnits(from.card, interaction.group, cards) : [];
    let lifted: string[] = [];
    if (from.kind === 'card') {
      lifted = units.length > 0 ? groupLifted(from.card, units) : stackOf(from.card, cards);
    } else if (from.kind === 'hand') {
      lifted = [from.card];
    }
    interaction.lift(movedCard(from), lifted);
    const card = from.kind === 'card' ? cardsById.get(from.card) : undefined;
    if (card && slotOf(card).rotated) {
      void turnOffPile(card.id, grab);
    }
  }

  /**
   * Feeds the sway the pointer's move, and steps it at each frame from then on. Per frame, it only
   * writes --sway on the layer, which the ghosts turn by (CardView.svelte, .hghost): nothing is
   * redrawn. The other players see the ghosts upright: nothing more is sent to them.
   */
  function swayWith(x: number): void {
    if (prefersReducedMotion.current) {
      return;
    }
    sway.moved(x, performance.now());
    if (swayFrame === 0) {
      swayFrame = requestAnimationFrame(stepSway);
    }
  }

  /**
   * One frame of the sway. It goes on until the ghosts are upright and still, the pointer at rest,
   * past the drag's end too: a drop's ghost, held up where it landed, comes upright meanwhile, and
   * the card settles on the table from the angle it shows then (motion.settle).
   */
  function stepSway(): void {
    const angle = sway.step(performance.now());
    layer?.style.setProperty('--sway', `${angle.toFixed(2)}deg`);
    swayFrame = sway.resting ? 0 : requestAnimationFrame(stepSway);
  }

  /**
   * Stops the sway, the ghosts upright: a new drag starts from there. At rest, the last frame left
   * them upright, and the layer is not written: the drag's first measures (start) would restyle the
   * page for it.
   */
  function stopSway(): void {
    if (swayFrame !== 0) {
      layer?.style.removeProperty('--sway');
    }
    cancelAnimationFrame(swayFrame);
    swayFrame = 0;
    sway.reset();
  }

  /**
   * Lets the first ghost of the drag rise. It is drawn and styled in the frame after the drag
   * starts: the rise ends one frame later, the ghost's transition then under way.
   */
  function rise(): void {
    cancelAnimationFrame(riseFrame);
    rising = true;
    riseFrame = requestAnimationFrame(() => {
      riseFrame = requestAnimationFrame(() => {
        riseFrame = 0;
        rising = false;
      });
    });
  }

  $effect(() => () => {
    stopSway();
    cancelAnimationFrame(riseFrame);
    cancelAnimationFrame(previewFrame);
    clearTimeout(dwellTimer);
  });

  /** Once drawn, the ghost of a card picked up off the deck's slot turns to lie landscape. */
  async function turnOffPile(id: string, held: Point): Promise<void> {
    await tick();
    const ghost = layer?.querySelector<HTMLElement>(
      `.card.ghost:not(.landed)[data-id="${CSS.escape(id)}"]`,
    );
    if (ghost) {
      motion.turnOffPile(ghost, held);
    }
  }

  /**
   * The cards a group drag lifts: the pressed card's stack first, whose
   * corner the other players are told, then the other units' stacks.
   */
  function groupLifted(lead: string, others: readonly string[]): string[] {
    const lifted = stackOf(lead, cards);
    for (const unit of others) {
      for (const id of stackOf(unit, cards)) {
        if (!lifted.includes(id)) {
          lifted.push(id);
        }
      }
    }
    return lifted;
  }

  /** Where the press holds the card, so that it stays under the pointer the same way. */
  function grabOf(from: DragSource, pressedAt: Point): Point {
    if (from.kind === 'card') {
      const card = cardsById.get(from.card);
      const surface = surfaceRect(root);
      const corner = card && surface ? drawnCorner(card, surface) : null;
      if (card && corner) {
        const slot = slotOf(card);
        const held = {
          x: (pressedAt.x - corner.x) / (slot.w * zoom),
          y: (pressedAt.y - corner.y) / (slot.h * zoom),
        };
        return slot.rotated ? unturned(held) : held;
      }
    }
    if (from.kind === 'marker') {
      const token = root
        ?.querySelector(`.surface .marker[data-marker="${from.name}"]`)
        ?.getBoundingClientRect();
      if (token && token.width > 0 && token.height > 0) {
        return {
          x: (pressedAt.x - token.left) / token.width,
          y: (pressedAt.y - token.top) / token.height,
        };
      }
    }
    if (from.kind === 'hand') {
      const card = root?.querySelector<HTMLElement>(`.hand .hcard[data-id="${from.card}"]`);
      const fan = card?.querySelector<HTMLElement>('.fan');
      const box = fan?.getBoundingClientRect();
      if (card && fan && box && box.width > 0 && box.height > 0) {
        const tilt = Number.parseFloat(card.style.getPropertyValue('--rot')) || 0;
        handSize = uprightSize(fan, box, tilt);
        // The pressed point keeps its offset from the card's middle: the ghost takes the card's place.
        return {
          x: 0.5 + (pressedAt.x - (box.left + box.width / 2)) / handSize.w,
          y: 0.5 + (pressedAt.y - (box.top + box.height / 2)) / handSize.h,
        };
      }
      handSize = { w: HAND_CARD.w, h: HAND_CARD.h };
    }
    // A pile's card is held by its middle, as in the prototype.
    return { x: 0.5, y: 0.5 };
  }

  /** Where a table card's top-left corner shows on the screen, drawn with its stack or its pile. */
  function drawnCorner(card: TableCard, surface: Rect): Point | null {
    return onScreen(card, surface, card.id);
  }

  /** The box a card is drawn at on the table: smaller in dock mode. */
  function drawn(box: Box): Box {
    return dock.current ? dockCardBox(box) : box;
  }

  /**
   * Where a hold on a deck's portrait slot holds the landscape card it shows,
   * as fractions of each box. The slot shows the card turned a quarter
   * counter-clockwise (CardFace): the card's top edge is the slot's left
   * edge, its right edge the slot's top.
   */
  function unturned(held: Point): Point {
    return { x: 1 - held.y, y: held.x };
  }

  /** The box a table card has where it lies: a card revealed on a deck, the deck's portrait slot. */
  function slotOf(card: TableCard): Box {
    return drawn(cardBox(sizeOf(card), { faceDown: card.faceDown, onPile: !!card.onPile }));
  }

  /**
   * The size a hand card's picture (.fan) shows on the screen, popped or not,
   * as the ghost draws it, upright. Not its box, which takes in its tilt: at
   * the ends of the fan, that box is far wider than the card, and the ghost
   * would shrink into the card at the drop. With no layout (tests), its box.
   */
  function uprightSize(fan: HTMLElement, box: DOMRect, degrees: number): { w: number; h: number } {
    if (!fan.offsetWidth || !fan.offsetHeight) {
      return { w: box.width, h: box.height };
    }
    const angle = (degrees * Math.PI) / 180;
    const ratio = fan.offsetHeight / fan.offsetWidth;
    // A card w wide and h high, turned by that angle, spans w·|cos| + h·|sin| across.
    const w = box.width / (Math.abs(Math.cos(angle)) + ratio * Math.abs(Math.sin(angle)));
    return { w, h: w * ratio };
  }

  /** The box of the dragged card or marker on the table, in table units, as its ghost is drawn. */
  function boxOf(from: DragSource): Box {
    if (from.kind === 'marker') {
      return drawn({ ...MARKER_BOXES[from.name], rotated: false });
    }
    return drawn(cardBoxOf(from));
  }

  /** The box of the dragged card at full size, in table units. */
  function cardBoxOf(from: Exclude<DragSource, { kind: 'marker' }>): Box {
    if (from.kind === 'encounter' || from.kind === 'deck') {
      const shown = from.kind === 'deck' ? shownDeckTop(from.pile) : undefined;
      return shown ? cardBox(sizeOf(shown), {}) : cardBox('std', { faceDown: true });
    }
    const card = cardsById.get(from.card);
    if (!card) {
      return cardBox('std', {});
    }
    // A table card keeps its side, lying as the table draws it: a card revealed on a deck leaves
    // the deck's slot. A card from the hand or a pile comes into play face up.
    if (from.kind === 'card') {
      return cardBox(sizeOf(card), { faceDown: card.faceDown });
    }
    return cardBox(sizeOf(card), {});
  }

  /**
   * Where a spot of the table shows on the screen, as the view mode draws it, or null when its row is
   * hidden; a spot of an item, named by its id, is drawn with that item.
   */
  function onScreen(point: Point, surface: Rect, itemId?: string): Point | null {
    const drawn = tableMap.toDisplay(point, itemId);
    return drawn === null ? null : toScreen(drawn, surface, zoom);
  }

  /** The spot of the table drawn at a point of the screen, whatever the view mode. */
  function onTable(at: Point, surface: Rect): Point {
    return tableMap.toTable(toTable(at, surface, zoom));
  }

  /** The top-left corner of the dragged card at table size, on the screen. */
  function cornerOf(from: DragSource, at: Point): Point {
    const box = boxOf(from);
    return { x: at.x - grab.x * box.w * zoom, y: at.y - grab.y * box.h * zoom };
  }

  /**
   * Where a drop at the point leaves the dragged card's corner: on its grid spot when the action
   * places it; where it was let go when it tucks it into a stack, whose chain the server lays out,
   * or when it places it in dock mode, whose flow draws it in the slot the rows opened: the next
   * view slides it from there (animate.ts). A marker lands on its spot in every mode.
   */
  function landingCorner(from: DragSource, action: Action, at: Point): Point {
    const surface = surfaceRect(root);
    const spot = spotOf(from, action);
    const flows = tableMap.insertAt !== undefined && from.kind !== 'marker';
    if (!surface || !spot || flows) {
      return cornerOf(from, at);
    }
    // A placed card always lands in a shown row; the spot under the pointer covers any other case.
    return onScreen(spot, surface) ?? cornerOf(from, at);
  }

  /**
   * Where the action places the dragged card on the table, in table units; null when it does not,
   * or when it tucks the card into a stack, which the server lays out.
   */
  function spotOf(from: DragSource, action: Action): Point | null {
    if (tucks(action)) {
      return null;
    }
    if (action.kind !== 'group') {
      return action.x === undefined || action.y === undefined ? null : { x: action.x, y: action.y };
    }
    // A group of moves moves every card by the same offset as drawn (groupAction): the pressed
    // card's own move tells where it lands, else the first move, at its drawn offset.
    const lead = from.kind === 'card' ? cardsById.get(from.card) : undefined;
    const own = action.actions?.find((move) => move.card === lead?.id);
    if (own?.x !== undefined && own.y !== undefined) {
      return { x: own.x, y: own.y };
    }
    const first = action.actions?.[0];
    const moved = first?.card === undefined ? undefined : cardsById.get(first.card);
    if (first?.x === undefined || first.y === undefined || !moved || !lead) {
      return null;
    }
    // Where the first move lands as drawn, then the lead's drawn offset from the moved card.
    const landed = tableMap.toDisplay({ x: first.x, y: first.y });
    if (landed === null) {
      return { x: lead.x + first.x - moved.x, y: first.y };
    }
    const offset = drawnDelta(tableMap, moved, lead);
    return tableMap.toTable({ x: landed.x + offset.x, y: landed.y + offset.y });
  }

  /**
   * Where a card or a pile on the surface lies on the screen, never shifted aside by the drag's
   * preview: a card gliding out of the way under the pointer would take the drop, the
   * preview would go, the card glide back, and so on.
   */
  function placedRect(selector: string): Rect | undefined {
    const element = root?.querySelector(selector);
    if (!element) {
      return undefined;
    }
    // The computed translate, not the style's: mid-glide, the card is drawn on its way there.
    return unshifted(element.getBoundingClientRect(), getComputedStyle(element).translate, zoom);
  }

  /** Everything the dragged thing can be dropped on, measured on the screen. */
  function targetsFor(from: DragSource, at: Point): DropRect[] {
    const table = root?.querySelector('.tablewrap')?.getBoundingClientRect();
    if (!root || !table) {
      return [];
    }
    const targets: DropRect[] = [];
    if (dock.current) {
      const button = dockHandTarget(from);
      if (button) {
        targets.push(button);
      }
    } else if (from.kind === 'hand') {
      // A hand card slots back into its own hand only, among its other cards.
      const hand = root.querySelector<HTMLElement>(`.hand[data-seat="${seatOf(from.area)}"]`);
      const others = cardRects(hand, from.card);
      const middles = others.map((rect) => (rect.left + rect.right) / 2);
      targets.push({
        kind: 'hand',
        index: insertIndex(middles, at.x),
        rect: handBand(others, under(hand, table), window.innerHeight),
      });
    } else if (goesToHand(from, units, view)) {
      // Any hand shown takes it, for its owner's hand; with no hand shown, the bottom of the table.
      const hands = [...root.querySelectorAll<HTMLElement>('.hand')];
      if (hands.length === 0) {
        targets.push({ kind: 'toHand', rect: handBand([], table, window.innerHeight) });
      }
      for (const hand of hands) {
        const rect = handBand(cardRects(hand), under(hand, table), window.innerHeight);
        targets.push({ kind: 'toHand', rect });
      }
    }
    const whole: TableRect = { kind: 'table', rect: table };
    targets.push(whole);
    // A marker lies anywhere on the table, over cards and piles alike.
    if (from.kind === 'marker' || !contains(table, at)) {
      return targets;
    }

    // Out-of-play piles are not drawn: they cannot be measured, and take no drop.
    const piles = units.length > 0 ? groupPileTargets(units, view) : pileTargets(from, view);
    for (const target of piles) {
      const rect = placedRect(tablePile(target.pile));
      if (rect) {
        targets.push({ kind: 'pile', ...target, rect });
      }
    }
    // The dragged cards, a group's included, are never dropped on.
    const lifted = interaction.dragging?.lifted ?? [];
    for (const card of cards) {
      if (card.zone !== 'table' || lifted.includes(card.id)) {
        continue;
      }
      const rect = placedRect(tableCard(card.id));
      if (rect) {
        targets.push({ kind: 'card', card: card.id, z: card.z, rect });
      }
    }
    return targets;
  }

  /** The cards of a hand on the screen, but the one left out; none without a hand. */
  function cardRects(hand: HTMLElement | null, leftOut?: string): DOMRect[] {
    return [...(hand?.querySelectorAll<HTMLElement>('.hcard:not(.gap)') ?? [])]
      .filter((element) => element.dataset.id !== leftOut)
      .map((element) => element.getBoundingClientRect());
  }

  /**
   * The bottom of the table under a hand's resting fan (its middle, data-rest-x px right of the
   * hand's), where an empty hand takes a drop; the whole table without a hand.
   */
  function under(hand: HTMLElement | null, table: Rect): Rect {
    if (!hand) {
      return table;
    }
    const room = hand.getBoundingClientRect();
    const middle = (room.left + room.right) / 2 + Number(hand.dataset.restX ?? 0);
    return { left: middle, right: middle, top: table.top, bottom: table.bottom };
  }

  /**
   * In dock mode the only hand on the screen is the dock's hand button, and none of the
   * table around it: it takes what goes to a hand, and a hand card dragged out of the carousel back
   * to the hand, which sends nothing (dropAction). Null for anything else, or with no hand button.
   */
  function dockHandTarget(from: DragSource): DropRect | null {
    if (!takesHandDrop(from, units, view)) {
      return null;
    }
    const button = root?.querySelector('.dock .handbtn')?.getBoundingClientRect();
    return button ? { kind: 'toHand', rect: button } : null;
  }

  /** What a drop at the pointer lands on, and the action it sends, null when nothing. */
  function locate(from: DragSource, at: Point): Located | null {
    const target = dropTarget(at, targetsFor(from, at));
    if (!target || selected === null) {
      return null;
    }
    const surface = surfaceRect(root);
    // Where the corner is drawn: dropAction snaps it before mapping it to the table.
    const spot = surface ? toTable(cornerOf(from, at), surface, zoom) : { x: 0, y: 0 };
    // An encounter card goes to the player whose row the pointer is in.
    const pointed = surface ? onTable(at, surface) : { x: 0, y: 0 };
    const dealTo = dealRecipient(view.table?.piles ?? [], pointed.y, areaOf(selected));
    // A group tucks under nothing: over a card, it moves there as over the table.
    const onto: DropRect =
      units.length > 0 && target.kind === 'card' ? { kind: 'table', rect: target.rect } : target;
    const single = dropAction(from, onto, spot, dealTo, tableMap, dockSpotOf(from), grid);
    return { target, action: grouped(from, single) };
  }

  /**
   * What a drop at the pointer lands on, as the rows show it in dock mode: the drop shown
   * holds until the pointer is DROP_MARGIN drawn units past where it last lay under it, or has
   * stayed off it DROP_DWELL_MS. Elsewhere, and for what the rows show no drop of, what lies under the pointer.
   */
  function settledAt(from: DragSource, at: Point): Located | null {
    if (tableMap.insertAt === undefined || from.kind === 'marker' || units.length > 0) {
      return locate(from, at);
    }
    clearTimeout(dwellTimer);
    dwellTimer = 0;
    const found = steady.settle(at, DROP_MARGIN * zoom, performance.now(), (point) =>
      locate(from, point),
    );
    if (steady.waiting) {
      // The pointer may stay put past the edge: the drop under it shows all the same.
      dwellTimer = window.setTimeout(aim, DROP_DWELL_MS);
    }
    return found;
  }

  /**
   * In dock mode, where a card dropped on the table goes: among the units of the row
   * its ghost's middle is drawn in, the dragged cards left out. None elsewhere, nor for a marker.
   */
  function dockSpotOf(from: DragSource): DropSpot | undefined {
    const insertAt = tableMap.insertAt?.bind(tableMap);
    if (insertAt === undefined || from.kind === 'marker') {
      return undefined;
    }
    const ghost = boxOf(from);
    const width = cardBoxOf(from).w;
    const dragged = new Set(interaction.dragging?.lifted ?? []);
    return (corner) =>
      insertAt({ x: corner.x + ghost.w / 2, y: corner.y + ghost.h / 2 }, width, dragged);
  }

  /**
   * In dock mode, the drop the rows show before it is let go: the dragged card where the
   * drop would put it, the same spot as the drop sends. None for a drop anywhere but on the table,
   * one that tucks the card into a stack or would not move it, a group, a marker, and elsewhere.
   */
  function previewOf(from: DragSource, found: Located | null): DockPreview | null {
    if (tableMap.insertAt === undefined || from.kind === 'marker' || units.length > 0) {
      return null;
    }
    const action = found?.action;
    if (found?.target.kind !== 'table' || !action) {
      return null;
    }
    const spot = spotOf(from, action);
    if (spot === null) {
      return null;
    }
    const box = cardBoxOf(from);
    return { unitId: previewIdOf(from), insertAt: spot, size: { w: box.w, h: box.h } };
  }

  /** The id the dragged card goes by on the table, its ghost's: a deck's unknown top card the deck's stand-in. */
  function previewIdOf(from: Exclude<DragSource, { kind: 'marker' }>): string {
    switch (from.kind) {
      case 'encounter':
        return ENCOUNTER_TOP.id;
      case 'deck':
        return shownDeckTop(from.pile)?.id ?? DECK_TOP.id;
      default:
        return from.card;
    }
  }

  /**
   * Feeds the table the preview at the next frame, however often the pointer moves: the table lays
   * its rows out once a frame at most. None feeds it at once: the cards pushed aside go back.
   */
  function feedPreview(next: DockPreview | null): void {
    pendingPreview = next;
    if (next === null) {
      flushPreview();
    } else if (previewFrame === 0) {
      previewFrame = requestAnimationFrame(flushPreview);
    }
  }

  /** Feeds the table the pending preview now, when it differs from the one it shows. */
  function flushPreview(): void {
    cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    if (!samePreview(pendingPreview, fedPreview)) {
      fedPreview = pendingPreview;
      onpreview(fedPreview);
    }
  }

  function samePreview(a: DockPreview | null, b: DockPreview | null): boolean {
    if (a === null || b === null) {
      return a === b;
    }
    return a.unitId === b.unitId && a.insertAt.x === b.insertAt.x && a.insertAt.y === b.insertAt.y;
  }

  /**
   * The action a drop sends: during a group drag, the action of the pressed
   * card alone made the whole group's.
   */
  function grouped(from: DragSource, single: Action | null): Action | null {
    if (single === null || units.length === 0 || from.kind !== 'card') {
      return single;
    }
    return groupAction(units, from.card, single, cards, tableMap);
  }

  /** Outlines and labels what the drop would land on, and opens the gap in the hand. */
  function aim(): void {
    if (!source || !pointer) {
      return;
    }
    const found = settledAt(source, pointer);
    feedPreview(previewOf(source, found));
    interaction.handGap = found?.target.kind === 'hand' ? found.target.index : null;
    // Only what a drop would change is outlined: not the pile a card came from. A deck's top card
    // dropped back on its deck is the exception: that drop is a target, which cancels the drag.
    const returns = found?.target.kind === 'pile' && found.target.drop === 'return';
    const target = found && (found.action || returns) ? found.target : null;
    const handArea = handAreaOf(source, view);
    if (target?.kind === 'toHand' && handArea) {
      const label = { glyph: HAND_GLYPH, text: handName(handArea), tuck: false };
      showHint({ kind: 'hand', id: handArea }, label, target.rect);
    } else if (target?.kind === 'pile') {
      const label = { glyph: PILE_GLYPHS[target.drop], text: target.label, tuck: false };
      showHint({ kind: 'pile', id: target.pile }, label, target.rect);
    } else if (target?.kind === 'card' && found?.action && tucks(found.action)) {
      // The stack's main card is outlined and named, though the card goes to the end of its chain.
      // Lifted cards are not targets and a main card cannot target its own chain, so that main card
      // stays put. The label stays over the card pointed at: the main card may lie beneath it.
      const pointedAt = cardsById.get(target.card);
      const main = pointedAt ? mainCardOf(pointedAt, cards) : undefined;
      const name = faceOf(main)?.name ?? 'a card';
      const label = { glyph: TUCK_GLYPH, text: `Under ${name}`, tuck: true };
      showHint({ kind: 'card', id: main?.id ?? target.card }, label, target.rect);
    } else {
      interaction.dropOn = null;
      hint = null;
    }
  }

  /** "Hand", or with several decks the hero's: "Spider-Man's hand". */
  function handName(area: Area): string {
    const hero = seatHero(view, seatOf(area));
    return hero ? `${hero}'s hand` : 'Hand';
  }

  function showHint(
    on: DropOn,
    label: { glyph: string; text: string; tuck: boolean },
    rect: Rect,
  ): void {
    if (interaction.dropOn?.kind !== on.kind || interaction.dropOn.id !== on.id) {
      interaction.dropOn = on;
    }
    // Every move over the same target makes the same label: it is not drawn again.
    const next = { ...label, x: (rect.left + rect.right) / 2, y: rect.top - 8 };
    if (!sameHint(hint, next)) {
      hint = next;
    }
  }

  function sameHint(a: Hint | null, b: Hint): boolean {
    return (
      a !== null &&
      a.glyph === b.glyph &&
      a.text === b.text &&
      a.tuck === b.tuck &&
      a.x === b.x &&
      a.y === b.y
    );
  }

  function onUp(event: PointerEvent): void {
    const pressed = interaction.held;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    if (!pressed.moved) {
      // Armed, then let go without a move: a hold, which opens nothing. Otherwise a tap or a click,
      // not a drag: its click opens the action menu, or selects a hand card on touch.
      if (interaction.armed) {
        interaction.swallowNextClick();
      }
      interaction.letGo();
      return;
    }
    const from = sourceOf(pressed.element, view, pressed.card ?? undefined);
    const at = { x: event.clientX, y: event.clientY };
    // The drop goes where the rows show it: into the slot they open for its card.
    const found = isStillThere(pressed, from) ? settledAt(from, at) : null;
    pendingPreview = from && found ? previewOf(from, found) : null;
    flushPreview();
    end();
    // The click this release fires is the end of the drag, not a tap on what lies there.
    interaction.swallowNextClick();
    const action = found?.action;
    if (!from || !found || !action) {
      return;
    }
    const sent = act(action, pressed.element);
    if (sent === null) {
      return;
    }
    land(sent, pressed, from, action, at);
    // The card went to the hand of one of the viewer's decks: that hand shows (spec 5).
    const handArea = found.target.kind === 'toHand' ? handAreaOf(from, view) : null;
    if (handArea) {
      onhand(seatOf(handArea));
    }
  }

  /**
   * Keeps what was dropped in place until the server answers: a reordered
   * hand in its new order, any other drop as ghosts where it landed.
   */
  function land(sent: number, pressed: Held, from: DragSource, action: Action, at: Point): void {
    const reorder = action.kind === 'handOrder';
    const corner = landingCorner(from, action, at);
    landed = {
      action: sent,
      ghosts: reorder ? [] : ghostsAt(from, corner, pressed.lifted),
      token:
        from.kind === 'marker' ? { name: from.name, x: corner.x / zoom, y: corner.y / zoom } : null,
      view,
    };
    interaction.land({
      action: sent,
      element: pressed.element,
      card: pressed.card,
      lifted: reorder ? [] : pressed.lifted,
      tucks: tucks(action),
      handOrder: reorder ? (action.cards ?? null) : null,
    });
  }

  function onCancel(event: PointerEvent): void {
    if (interaction.held?.pointerId === event.pointerId) {
      end();
    }
  }

  /** The drag is over: dropped, or cancelled. */
  function end(): void {
    interaction.letGo();
    clearTimeout(dwellTimer);
    dwellTimer = 0;
    steady.reset();
    units = [];
    pointer = null;
    hint = null;
    if (told) {
      told = false;
      ondrag(null);
    }
  }

  /** Tells the other players where the drag is; it shows to them only while it is over the table. */
  function tellOthers(from: DragSource, at: Point): void {
    const drag = presenceOf(from, at);
    if (drag === null && !told) {
      return;
    }
    told = drag !== null;
    ondrag(drag);
  }

  /**
   * The ids of the dragged cards, as the other players may know them: a
   * table card or a card of a public pile by its id, a hand card (or a card
   * of a pile they cannot see) by a stand-in, and a deck's unknown top card
   * by its pile.
   */
  function cardsShown(from: Exclude<DragSource, { kind: 'marker' }>): readonly string[] {
    switch (from.kind) {
      case 'card':
        return interaction.dragging?.lifted ?? [from.card];
      case 'pile': {
        // The view lists a pile's cards only when everybody may see them.
        const listed = view.table?.piles.find((pile) => pile.id === from.pile)?.cards;
        return listed ? [from.card] : [HIDDEN_CARD];
      }
      case 'encounter':
      case 'deck':
        return [from.pile];
      case 'hand':
        return [HIDDEN_CARD];
    }
  }

  /**
   * What the other players see of the drag: the cards it carries, or the
   * marker, and their corner, in table units, while it is over
   * the table. Not a hand card over the hand, which is the viewer's own
   * business.
   */
  function presenceOf(from: DragSource, at: Point): PresenceDrag | null {
    const table = root?.querySelector('.tablewrap')?.getBoundingClientRect();
    if (!root || !table || overHand) {
      return null;
    }
    const surface = surfaceRect(root);
    if (!contains(table, at) || !surface) {
      return null;
    }
    const corner = onTable(cornerOf(from, at), surface);
    const x = Math.round(corner.x);
    const y = Math.round(corner.y);
    if (from.kind === 'marker') {
      return { cards: [], token: from.name, x, y };
    }
    return { cards: cardsShown(from).slice(0, MAX_DRAG_CARDS), x, y };
  }

  /**
   * The cards drawn at table size for the dragged card's corner at that point
   * of the screen, in table units of the zoomed layer; `lifted` are the table
   * cards that move with a table card.
   */
  function ghostsAt(from: DragSource, corner: Point, lifted: readonly string[]): TableCard[] {
    const x = corner.x / zoom;
    const y = corner.y / zoom;
    if (from.kind === 'marker') {
      return [];
    }
    if (from.kind === 'encounter') {
      return [{ ...ENCOUNTER_TOP, x, y }];
    }
    if (from.kind === 'deck') {
      const shown = shownDeckTop(from.pile);
      return shown ? [asPlayed(shown, x, y)] : [deckTop(from.pile, x, y)];
    }
    const card = cardsById.get(from.card);
    if (!card) {
      return [];
    }
    if (from.kind !== 'card') {
      return [asPlayed(card, x, y)];
    }
    // The cards it carries, and the rest of a group, keep their offsets as drawn. Off the
    // deck it is revealed on, a card lies as the table draws it (boxOf).
    return lifted.flatMap((id) => {
      const k = cardsById.get(id);
      if (!k) {
        return [];
      }
      const offset = drawnDelta(tableMap, card, k);
      return [{ ...k, x: x + offset.x, y: y + offset.y, onPile: undefined }];
    });
  }

  /** The unknown top card of a deck, its back the deck's: a side deck may have its own. */
  function deckTop(pileId: string, x: number, y: number): TableCard {
    const pile = tablePiles.find((p) => p.id === pileId);
    const back = pile ? pileBack(pile) : DECK_TOP.back;
    return { ...DECK_TOP, x, y, back, home: pile?.kind === 'sideDeck' ? pile.id : undefined };
  }

  /** A card from the hand or a pile, drawn as it would lie on the table. */
  function asPlayed(card: TableCard, x: number, y: number): TableCard {
    return { ...card, zone: 'table', x, y, onPile: undefined, parent: undefined };
  }

  /** The top card a side deck shows to everyone (topFaceUp), which its drag shows too. */
  function shownDeckTop(pileId: string): TableCard | undefined {
    const pile = view.table?.piles.find((p) => p.id === pileId);
    const top = pile?.topFaceUp ? pile.cards?.at(-1) : undefined;
    return top === undefined ? undefined : cardsById.get(top);
  }

  /** The cards drawn under the pointer. */
  const ghosts = $derived(
    pointer && source && held ? ghostsAt(source, cornerOf(source, pointer), held.lifted) : [],
  );

  /** The marker under the pointer, its corner in table units of the layer. */
  const tokenGhost = $derived.by(() => {
    if (!pointer || source?.kind !== 'marker') {
      return null;
    }
    const corner = cornerOf(source, pointer);
    return { name: source.name, x: corner.x / zoom, y: corner.y / zoom };
  });

  /** The last drop, while it waits for the server. */
  const waiting = $derived(landed && interaction.landing?.action === landed.action ? landed : null);
  const landedGhosts = $derived(waiting?.ghosts ?? []);

  /** The dragged hand card at hand size, while it is over the hand. */
  const handGhost = $derived.by(() => {
    if (!pointer || source?.kind !== 'hand' || !overHand) {
      return null;
    }
    const card = cardsById.get(source.card);
    return card
      ? {
          card,
          left: (pointer.x - grab.x * handSize.w) / zoom,
          top: (pointer.y - grab.y * handSize.h) / zoom,
          width: handSize.w / zoom,
          height: handSize.h / zoom,
        }
      : null;
  });
</script>

<!-- The capture phase counts the fingers down before any press they begin, whatever stops the event later. -->
<svelte:window
  onpointerdowncapture={(event) => interaction.fingerDown(event)}
  onpointerupcapture={(event) => interaction.fingerUp(event)}
  onpointercancelcapture={(event) => interaction.fingerUp(event)}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onCancel}
/>

<!--
  The ghosts repeat what is dragged, for the eyes only, held up off the table (--lift-scale,
  --lift-shade: CardView.svelte, .hghost) and swaying (--sway, stepSway).
-->
<div
  class="draglayer"
  aria-hidden="true"
  class:rising
  bind:this={layer}
  style:--lift-scale={LIFT_SCALE}
  style:--lift-shade={LIFT_SHADE}
>
  {#if handGhost}
    {@const face = faceOf(handGhost.card)}
    <div
      class="hghost"
      style:translate="{handGhost.left}px {handGhost.top}px"
      style:width="{handGhost.width}px"
      style:height="{handGhost.height}px"
    >
      <div class="shade"></div>
      {#if isHidden(handGhost.card)}
        <CardBack back={handGhost.card.back} caption={backCaption(handGhost.card, tablePiles)} />
      {:else}
        <CardFace
          images={face?.images ?? []}
          name={face?.name ?? ''}
          rotated={isLandscape(face?.size ?? 'std')}
        />
      {/if}
    </div>
  {:else}
    {#each ghosts as ghost (ghost.id)}
      <CardView card={ghost} face={faceOf(ghost)} caption={backCaption(ghost, tablePiles)} ghost />
    {/each}
  {/if}
  {#each landedGhosts as ghost (ghost.id)}
    <CardView
      card={ghost}
      face={faceOf(ghost)}
      caption={backCaption(ghost, tablePiles)}
      ghost
      landed
    />
  {/each}
  {#if tokenGhost}
    <MarkerToken name={tokenGhost.name} x={tokenGhost.x} y={tokenGhost.y} ghost />
  {:else if waiting?.token}
    <MarkerToken name={waiting.token.name} x={waiting.token.x} y={waiting.token.y} />
  {/if}
</div>

{#if hint}
  <div class="drop-hint" class:tuck={hint.tuck} style:left="{hint.x}px" style:top="{hint.y}px">
    <span aria-hidden="true">{hint.glyph}</span>
    {hint.text}
  </div>
{/if}

<style>
  /* Over the whole page, at the table's zoom: positions inside are in table units. */
  .draglayer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 3000;
    zoom: var(--z, 1);
  }

  /*
    A hand card brought back over the hand, at its size in the hand; off the hand, a table card's
    ghost takes its place. Held up and swaying about its middle as a table card's ghost is
    (CardView.svelte); out of the table, it keeps the hand's shadow (.shade, tokens.css). It follows
    the pointer on translate, from the layer's corner: a pointer move lays nothing out again. Its
    scale and rotate give it its own stacking, which keeps the shade under its face. The ghost is
    portrait, a landscape card turned a quarter in it.
  */
  .hghost {
    --shade-shadow: var(--held-card-shadow);
    position: absolute;
    left: 0;
    top: 0;
    scale: var(--lift-scale);
    rotate: var(--sway, 0deg);
    transition: scale 0.14s ease-out;
  }

  /* Picked up, it rises off the hand, as the drag's first ghost only. */
  @starting-style {
    .draglayer.rising .hghost {
      scale: 1;
    }
  }

  /* Without motion, it shows held up at once. */
  @media (prefers-reduced-motion: reduce) {
    .hghost {
      transition: none;
    }
  }

  /* Above everything, the dragged card included. */
  .drop-hint {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, -100%);
    pointer-events: none;
    box-shadow: 0 4px 12px #000a;
    background: var(--sel);
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    padding: 5px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* Tucking under a card: the prototype's threat orange. */
  .drop-hint.tuck {
    background: var(--warn);
    color: #2b1700;
  }
</style>
