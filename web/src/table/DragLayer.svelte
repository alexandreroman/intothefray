<!--
  Drag and drop (spec 5.4). A press on a table card, a pile, a hand card or
  a marker (first player token, active counter) becomes a drag after 4 px (a
  finger pushing a hand card down swipes the hand away instead): what is dragged is drawn here,
  over the whole page at the table's zoom, outside the table's surface, so
  that new views redrawing the table leave it alone. The drop targets are
  measured on the screen and drag.ts decides what the drop sends. Once
  dropped, it stays drawn where it landed until the server answers.
-->
<script lang="ts">
  import { untrack } from 'svelte';
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
    dropAction,
    dropTarget,
    ENCOUNTER_TOP_ID,
    handAreaOf,
    handBand,
    insertIndex,
    isDownward,
    pileTargets,
    sourceOf,
    stackOf,
    tucks,
    type DragSource,
    type DropRect,
    type PileDrop,
    type Rect,
    type TableRect,
  } from './drag';
  import { backCaption, isHidden, pileBack } from './face';
  import { interaction, type DropOn, type Held, type Pressable } from './interaction.svelte';
  import { ACTIVE_COUNTER_BOX, cardBox, FIRST_PLAYER_BOX, HAND_CARD, type Box } from './layout';
  import { ALL_ROWS, type RowMap } from './rows';
  import { surfaceRect, tableCard, tablePile, toScreen, toTable } from './screen';
  import { areaOf, seatHero, seatOf } from './seats';
  import { groupAction, groupPileTargets, groupUnits } from './selection';

  let {
    view,
    zoom,
    root,
    faceOf,
    sizeOf,
    rowMap = ALL_ROWS,
    selected,
    act,
    onhand,
    ondrag,
    lastError,
  }: {
    view: View;
    zoom: number;
    /** The page the table is drawn in: the surface, the piles and the hand are measured there. */
    root: HTMLElement | undefined;
    faceOf: (card: TableCard | undefined) => PackFace | null;
    sizeOf: (card: TableCard) => Size;
    /** Where the view mode draws the heights of the table (rows.ts). */
    rowMap?: RowMap;
    /** The viewer's selected deck (spec 5): an encounter card dealt above every row goes to it. */
    selected: number | null;
    /** Sends a drop's action, about what was pressed: its id, or null when it could not be sent. */
    act: (action: Action, element: Pressable) => number | null;
    /** A card went to the hand of one of the viewer's decks: that seat's hand is the one to show. */
    onhand: (seat: number) => void;
    /** Tells the other players where the drag is, and null once it is over (spec 5.8). */
    ondrag: (drag: PresenceDrag | null) => void;
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
  /** The label above the drop target. */
  let hint = $state<{ glyph: string; text: string; tuck: boolean; x: number; y: number } | null>(
    null,
  );

  // The server relays no more cards in one drag: it mirrors maxDragCards in internal/server/presence.go.
  const MAX_DRAG_CARDS = 50;
  // What the other players are told of a card hidden from them (ruling P5c-R9): its real id
  // would let them follow it once it is played.
  const HIDDEN_CARD = 'hidden-0';

  // The prototype's arrows in front of the labels.
  const PILE_GLYPHS: Record<PileDrop, string> = { top: '↑', discard: '✕', pile: '→' };
  const TUCK_GLYPH = '↓';
  const HAND_GLYPH = '↓';

  const cards = $derived(view.table?.cards ?? []);
  const tablePiles = $derived(view.table?.piles ?? []);
  const cardsById = $derived(new Map(cards.map((card) => [card.id, card])));
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
      const from = sourceOf(pressed.element, view);
      if (!from) {
        // Not draggable, or a spectator: the press stays a press.
        interaction.letGo();
        return;
      }
      start(from, pressed.start);
    }
    pointer = at;
    aim();
    if (source) {
      tellOthers(source, at);
    }
  }

  /** A finger pushing a hand card down: a swipe that lowers the hand, not a drag of the card. */
  function isHandSwipe(pressed: Held, event: PointerEvent, at: Point): boolean {
    return (
      pressed.element.kind === 'hand' &&
      event.pointerType === 'touch' &&
      isDownward(pressed.start, at)
    );
  }

  function start(from: DragSource, pressedAt: Point): void {
    grab = grabOf(from, pressedAt);
    units = from.kind === 'card' ? groupOf(from.card) : [];
    let lifted: string[] = [];
    if (from.kind === 'card') {
      lifted = units.length > 0 ? groupLifted(from.card, units) : stackOf(from.card, cards);
    } else if (from.kind === 'hand') {
      lifted = [from.card];
    }
    interaction.lift(movedCard(from), lifted);
  }

  /** The units of the selection when pressing that card drags it all: a selected card, 2 units at least. */
  function groupOf(card: string): string[] {
    if (!interaction.group.has(card)) {
      return [];
    }
    const found = groupUnits(interaction.group, cards);
    return found.length > 1 ? found : [];
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
      const corner = card && surface ? onScreen(card, surface) : null;
      if (corner) {
        const box = boxOf(from);
        return {
          x: (pressedAt.x - corner.x) / (box.w * zoom),
          y: (pressedAt.y - corner.y) / (box.h * zoom),
        };
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
      const fan = root
        ?.querySelector(`.hand .hcard[data-id="${from.card}"] .fan`)
        ?.getBoundingClientRect();
      if (fan && fan.width > 0 && fan.height > 0) {
        handSize = { w: fan.width, h: fan.height };
        return { x: (pressedAt.x - fan.left) / fan.width, y: (pressedAt.y - fan.top) / fan.height };
      }
      handSize = { w: HAND_CARD.w, h: HAND_CARD.h };
    }
    // A pile's card is held by its middle, as in the prototype.
    return { x: 0.5, y: 0.5 };
  }

  /** The box of the dragged card on the table, in table units. */
  function boxOf(from: DragSource): Box {
    if (from.kind === 'marker') {
      return {
        ...(from.name === 'active' ? ACTIVE_COUNTER_BOX : FIRST_PLAYER_BOX),
        rotated: false,
      };
    }
    if (from.kind === 'encounter' || from.kind === 'deck') {
      const shown = from.kind === 'deck' ? shownDeckTop(from.pile) : undefined;
      return shown ? cardBox(sizeOf(shown), {}) : cardBox('std', { faceDown: true });
    }
    const card = cardsById.get(from.card);
    if (!card) {
      return cardBox('std', {});
    }
    // A table card keeps the box it has there; a card from the hand or a pile comes into play face up.
    if (from.kind === 'card') {
      return cardBox(sizeOf(card), { faceDown: card.faceDown, onPile: !!card.onPile });
    }
    return cardBox(sizeOf(card), {});
  }

  /** Where a spot of the table shows on the screen, as the view mode draws it, or null when its row is hidden. */
  function onScreen(point: Point, surface: Rect): Point | null {
    const y = rowMap.toDisplay(point.y);
    return y === null ? null : toScreen({ x: point.x, y }, surface, zoom);
  }

  /** The spot of the table drawn at a point of the screen, whatever the view mode. */
  function onTable(at: Point, surface: Rect): Point {
    const drawn = toTable(at, surface, zoom);
    return { x: drawn.x, y: rowMap.toTable(drawn.y) };
  }

  /** The top-left corner of the dragged card at table size, on the screen. */
  function cornerOf(from: DragSource, at: Point): Point {
    const box = boxOf(from);
    return { x: at.x - grab.x * box.w * zoom, y: at.y - grab.y * box.h * zoom };
  }

  /** Where a drop at the point leaves the dragged card's corner: on its grid spot when the action places it. */
  function landingCorner(from: DragSource, action: Action, at: Point): Point {
    const surface = surfaceRect(root);
    const spot = spotOf(from, action);
    if (!surface || !spot) {
      return cornerOf(from, at);
    }
    // A placed card always lands in a shown row; the spot under the pointer covers any other case.
    return onScreen(spot, surface) ?? cornerOf(from, at);
  }

  /** Where the action places the dragged card on the table, in table units; null when it does not. */
  function spotOf(from: DragSource, action: Action): Point | null {
    if (action.kind !== 'group') {
      return action.x === undefined || action.y === undefined ? null : { x: action.x, y: action.y };
    }
    // A group of moves moves every card by the same offset: its first move tells it.
    const first = action.actions?.[0];
    const moved = first?.card === undefined ? undefined : cardsById.get(first.card);
    const lead = from.kind === 'card' ? cardsById.get(from.card) : undefined;
    if (first?.x === undefined || first.y === undefined || !moved || !lead) {
      return null;
    }
    return { x: lead.x + first.x - moved.x, y: lead.y + first.y - moved.y };
  }

  function placedRect(selector: string): DOMRect | undefined {
    return root?.querySelector(selector)?.getBoundingClientRect();
  }

  /** Everything the dragged thing can be dropped on, measured on the screen. */
  function targetsFor(from: DragSource, at: Point): DropRect[] {
    const table = root?.querySelector('.tablewrap')?.getBoundingClientRect();
    if (!root || !table) {
      return [];
    }
    const targets: DropRect[] = [];
    if (from.kind === 'hand') {
      // A hand card slots back into its own hand only, among its other cards.
      const hand = root.querySelector<HTMLElement>(`.hand[data-seat="${seatOf(from.area)}"]`);
      const others = cardRects(hand, from.card);
      const middles = others.map((rect) => (rect.left + rect.right) / 2);
      targets.push({
        kind: 'hand',
        index: insertIndex(middles, at.x),
        rect: handBand(others, under(hand, table), window.innerHeight),
      });
    } else if (goesToHand(from)) {
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

  /** The bottom of the table under a hand, where an empty hand takes a drop; the whole table without a hand. */
  function under(hand: HTMLElement | null, table: Rect): Rect {
    if (!hand) {
      return table;
    }
    const room = hand.getBoundingClientRect();
    return { left: room.left, right: room.right, top: table.top, bottom: table.bottom };
  }

  /**
   * Whether a drop on the hand takes what is dragged: each card of a group
   * goes to its owner's hand, which must be one of the viewer's.
   */
  function goesToHand(from: DragSource): boolean {
    if (units.length === 0) {
      return handAreaOf(from, view) !== null;
    }
    return units.every((id) => {
      const unit = sourceOf({ kind: 'card', id }, view);
      return unit !== null && handAreaOf(unit, view) !== null;
    });
  }

  /** What a drop at the pointer lands on, and the action it sends, null when nothing. */
  function locate(from: DragSource, at: Point): { target: DropRect; action: Action | null } | null {
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
    const single = dropAction(from, target, spot, dealTo, rowMap);
    return { target, action: grouped(from, single) };
  }

  /**
   * The action a drop sends: during a group drag, the action of the pressed
   * card alone made the whole group's (a drop over a card tucks nothing).
   */
  function grouped(from: DragSource, single: Action | null): Action | null {
    if (single === null || units.length === 0 || from.kind !== 'card') {
      return single;
    }
    return groupAction(units, from.card, single, cards);
  }

  /** Outlines and labels what the drop would land on, and opens the gap in the hand. */
  function aim(): void {
    if (!source || !pointer) {
      return;
    }
    const found = locate(source, pointer);
    interaction.handGap = found?.target.kind === 'hand' ? found.target.index : null;
    // Only what a drop would change is outlined: not the pile a card came from.
    const target = found?.action ? found.target : null;
    const handArea = handAreaOf(source, view);
    if (target?.kind === 'toHand' && handArea) {
      const label = { glyph: HAND_GLYPH, text: handName(handArea), tuck: false };
      showHint({ kind: 'hand', id: handArea }, label, target.rect);
    } else if (target?.kind === 'pile') {
      const label = { glyph: PILE_GLYPHS[target.drop], text: target.label, tuck: false };
      showHint({ kind: 'pile', id: target.pile }, label, target.rect);
    } else if (target?.kind === 'card' && found?.action && tucks(found.action)) {
      const name = faceOf(cardsById.get(target.card))?.name ?? 'a card';
      const label = { glyph: TUCK_GLYPH, text: `Under ${name}`, tuck: true };
      showHint({ kind: 'card', id: target.card }, label, target.rect);
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
    hint = { ...label, x: (rect.left + rect.right) / 2, y: rect.top - 8 };
  }

  function onUp(event: PointerEvent): void {
    const pressed = interaction.held;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    if (!pressed.moved) {
      // A tap or a click, not a drag: its click opens the action menu, or selects a hand card on touch.
      interaction.letGo();
      return;
    }
    const from = sourceOf(pressed.element, view, pressed.card ?? undefined);
    const at = { x: event.clientX, y: event.clientY };
    const found = isStillThere(pressed, from) ? locate(from, at) : null;
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
    // The cards tucked under it, and the rest of a group, keep their offsets.
    return lifted.flatMap((id) => {
      const k = cardsById.get(id);
      return k ? [{ ...k, x: x + k.x - card.x, y: y + k.y - card.y }] : [];
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

<svelte:window onpointermove={onMove} onpointerup={onUp} onpointercancel={onCancel} />

<!-- The ghosts repeat what is dragged, for the eyes only. -->
<div class="draglayer" aria-hidden="true">
  {#if handGhost}
    {@const face = faceOf(handGhost.card)}
    <div
      class="hghost"
      style:left="{handGhost.left}px"
      style:top="{handGhost.top}px"
      style:width="{handGhost.width}px"
      style:height="{handGhost.height}px"
    >
      {#if isHidden(handGhost.card)}
        <CardBack back={handGhost.card.back} caption={backCaption(handGhost.card, tablePiles)} />
      {:else}
        <CardFace
          images={face?.images ?? []}
          name={face?.name ?? ''}
          rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
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

  /* A hand card brought back over the hand: hand size, growing to table size as it leaves. */
  .hghost {
    position: absolute;
    transition:
      width 0.14s ease-out,
      height 0.14s ease-out;
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
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
