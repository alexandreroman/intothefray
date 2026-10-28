<!--
  The viewer's hand, fanned on an arc at the bottom of the table. At rest it
  sits low and veiled; it rises when the pointer comes near it, and the table
  behind it dims. Touch has no hover: a tap raises the hand and pins it up
  until a tap on the table, Escape or a swipe down lowers it.

  A player with two decks on a wide screen sees both resting hands side by
  side: the one of the selected deck is active, as above; the other one is
  inactive, dimmed. An inactive hand never rises and its cards take no
  pointer: the pointer coming into its band, or a tap on it, makes it the
  active one (onactivate). Both take the whole room the hands have: at rest
  each fan keeps to its place in it (restPlace); raised, the active one
  spreads over most of it, and the other one fades out meanwhile (hidden).

  A card a mouse or a pen drags to another place in the hand stays popped and
  hovered there once dropped, while the pointer stays on it (kept).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { modal } from '../components/modal.svelte';
  import type { CardView as TableCard, PackFace } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face';
  import { interaction } from './interaction.svelte';
  import {
    cardBox,
    fanExtent,
    fanPositions,
    HAND_CARD,
    HAND_PADDING,
    HAND_REST_DROP,
    handRestScale,
    RAISED_FAN_SHARE,
    type FanSlot,
    type HandInsets,
    restingFanPositions,
  } from './layout';
  import { motion } from './motion.svelte';
  import { areaOf } from './seats';

  let {
    cards,
    faceOf,
    captionOf,
    cardSize = HAND_CARD,
    restCardSize,
    restDrop = HAND_REST_DROP,
    open = $bindable(false),
    seat,
    color = 'transparent',
    label = 'Your hand',
    active = true,
    onactivate,
    inset = { left: 0, right: 0 },
    restPlace,
    hidden = false,
  }: {
    /** The hand, in its order. */
    cards: TableCard[];
    /** The catalog face a card shows, null while unknown. */
    faceOf: (card: TableCard) => PackFace | null;
    /** The caption of a card's back (backCaption): its side deck's label, if any. */
    captionOf: (card: TableCard) => string | undefined;
    /** The size of a card in the raised hand, in px (Table.svelte). */
    cardSize?: { w: number; h: number };
    /**
     * The size of the base card the resting hand shows at HAND_REST_SCALE, in px: the rest scale
     * follows from it (handRestScale), and the resting fan is laid out for it
     * (restingFanPositions). The raised card's by default.
     */
    restCardSize?: { w: number; h: number };
    /** How far the resting hand drops below its raised place, in px. */
    restDrop?: number;
    /** Whether the hand is raised. */
    open?: boolean;
    /** The seat whose hand this is. */
    seat: number;
    /** The CSS colour of the seat's player, which the fan glows in. */
    color?: string;
    /** The hand's accessible name. */
    label?: string;
    /** Whether this is the hand in use; an inactive one shows beside it, dimmed, and never rises. */
    active?: boolean;
    /** Makes this inactive hand the active one: the pointer came into its band, or a finger tapped it. */
    onactivate?: () => void;
    /** The hand's room at the bottom of the table, in from its edges: the fan centres in it. */
    inset?: HandInsets;
    /**
     * Where the resting fan lies beside the other hand shown, if any: its middle `offset` px right
     * of the hand's middle as seen, laid out for a hand `width` px wide. In the middle, for the
     * whole hand, without one.
     */
    restPlace?: { offset: number; width: number };
    /** The other hand shown is raised over the room: this one fades out, and takes no pointer. */
    hidden?: boolean;
  } = $props();

  /** The cards in the given order, then any the order does not know (drawn meanwhile). */
  function inOrder(order: readonly string[]): TableCard[] {
    const ordered = order.flatMap((id) => cards.filter((card) => card.id === id));
    return [...ordered, ...cards.filter((card) => !order.includes(card.id))];
  }

  // A card of this hand is being dragged: only its own hand takes it back, in another order.
  const reordering = $derived.by(() => {
    const dragged = interaction.dragging?.element;
    return dragged?.kind === 'hand' && cards.some((card) => card.id === dragged.id);
  });

  // A card dragged out of the hand leaves the fan, and stays out until the
  // server answers its drop. Brought back over the fan, the other cards make
  // room where it would slot in; a reorder shows its new order meanwhile.
  const shown = $derived.by((): (TableCard | 'gap')[] => {
    const order = interaction.landing?.handOrder;
    const ordered = order ? inOrder(order) : cards;
    const others: (TableCard | 'gap')[] = ordered.filter((card) => !interaction.isLifted(card.id));
    const gap = interaction.handGap;
    if (reordering && gap !== null) {
      others.splice(Math.min(gap, others.length), 0, 'gap');
    }
    return others;
  });

  // The whole hand's width, padding included: fanPositions keeps that padding free.
  let width = $state(0);
  // Raised, the fan spreads out for the raised cards; at rest, it is the base cards' fan.
  const restCard = $derived(restCardSize ?? cardSize);
  const restScale = $derived(handRestScale(restCard, cardSize));
  const slots = $derived(open ? raisedSlots() : restingSlots());

  /** The raised fan, over the middle of the hand (RAISED_FAN_SHARE of it). */
  function raisedSlots(): FanSlot[] {
    return fanPositions(shown.length, RAISED_FAN_SHARE * width, cardSize.w);
  }

  /** The resting fan, at its place: the offset is seen at the rest scale, the slots are before it. */
  function restingSlots(): FanSlot[] {
    const offset = (restPlace?.offset ?? 0) / restScale;
    return restingFanPositions(shown.length, restPlace?.width ?? width, restCard.w, cardSize.w).map(
      (slot) => ({ ...slot, x: slot.x + offset }),
    );
  }

  // Where the fan's cards reach, tilted end cards included, in the hand's own px (before the rest
  // scale): the glow spans it.
  const extent = $derived(fanExtent(slots, cardSize));

  // A table card of this seat's, dragged over a hand to go back to this one: the active hand rises
  // for it. Any hand's tints the backdrop (.backdrop.tinted).
  const dropTarget = $derived(
    interaction.dropOn?.kind === 'hand' && interaction.dropOn.id === areaOf(seat),
  );

  // A band of the screen the pointer keeps the hand up in (see followBand), down to the bottom of
  // the window.
  type Band = { left: number; right: number; top: number };

  // The band of the raised hand, as last measured.
  let openBand: Band | null = null;
  // The band of a raised hand some cards left without a drag (played or discarded with a key): the
  // fan closes up behind them, and a pointer resting where they were would be out of the new band.
  // The hand stays up while the pointer is in either band, and lowers once it is out of both. A drag
  // decides on its own, and forgets it.
  let keptBand: Band | null = null;

  // The card of this hand a drop would put back in it now, in another place or in its own: once
  // dropped, it is kept focused (see keepReordered).
  let reordered: string | null = null;

  // While something is dragged, the drag decides: the active hand rises only under
  // one of its cards brought back over it, or a table card going back to it.
  // Once the card is dropped, the pointer decides again (see below).
  $effect.pre(() => {
    const dragged = interaction.dragging?.element;
    if (dragged) {
      keptBand = null;
      // Another drag lets go of the card the last reorder kept.
      if (interaction.kept?.seat === seat) {
        interaction.kept = null;
      }
      const overGap = reordering && interaction.handGap !== null;
      reordered = overGap && dragged.kind === 'hand' ? dragged.id : null;
      open = active && (overGap || dropTarget);
    }
  });
  let list = $state<HTMLElement>();

  // The band the pointer opens the hand in: the area of the cards as seen,
  // tilted on the arc and the popped one included, stretched down to the
  // bottom of the window. Open, it is wider, so the pointer that raised the
  // hand keeps it up.
  const RESTING_MARGIN = 6;
  const OPEN_MARGIN = 24;

  // Where the pointer was last seen, drags included.
  let pointer: { x: number; y: number } | null = null;

  // The last press was a finger's. A finger has no hover to follow: the band is a mouse's or a
  // pen's, and a tap pins the hand up instead.
  let touch = false;
  // A tap raised the hand: it stays up wherever the finger goes, until a tap on the table, Escape,
  // a swipe down, a drop away from the hand or a dialog lowers it.
  let pinned = $state(false);
  // A finger pressed on a card of the pinned hand: moved far enough down, it lowers the hand.
  let swipe: { pointerId: number; y: number } | null = null;
  const SWIPE_DOWN = 40;

  /**
   * Decided from the pointer position rather than :hover: as the hand rises,
   * its cards move away from a pointer resting at the bottom of the screen,
   * and :hover would flip on and off. In the capture phase, so that outside a
   * drag the hand has risen or lowered before every other window listener sees
   * the move: Presence tells the others about the cursor only while the hand
   * is down. During a drag, the hand follows the drop target that DragLayer
   * sets later in the same move, so one cursor point may go out before
   * Presence sends `cursor: null`.
   */
  function followPointer(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      followSwipe(event);
      return;
    }
    // A mouse or a pen takes over from the finger that pinned the hand.
    pinned = false;
    if (interaction.dragging) {
      return;
    }
    if (active) {
      followKept(event);
      followBand(pointer);
    } else {
      activateUnder(pointer);
    }
  }

  /**
   * A finger pushing a card of the pinned hand down, which DragLayer lets go
   * of rather than drag (isDownward): far enough, it lowers the hand. While
   * the press is still held, it is a drag, or not told apart from one yet.
   */
  function followSwipe(event: PointerEvent): void {
    if (swipe === null || event.pointerId !== swipe.pointerId || interaction.held !== null) {
      return;
    }
    if (event.clientY - swipe.y >= SWIPE_DOWN) {
      swipe = null;
      lower();
    }
  }

  /** In the capture phase, so that the press is seen before what it lands on acts on it. */
  function onPress(event: PointerEvent): void {
    touch = event.pointerType === 'touch';
    const target = event.target as Element;
    const onCard = list?.contains(target) ?? false;
    swipe = touch && pinned && onCard ? { pointerId: event.pointerId, y: event.clientY } : null;
    // A tap on the table (an empty spot, a card, a pile) lowers the hand, and goes on to do what it
    // does there: one tap leaves the hand for the table. Elsewhere (the hero selector, the zoom),
    // the hand stays up.
    if (pinned && target.closest('.tablewrap') !== null) {
      lower();
    }
  }

  function onRelease(): void {
    swipe = null;
  }

  // Lowering takes the key, so that fullscreen stays (lib/fullscreen). The table's Escape (keys.ts),
  // listened to before this one, has run already, and taking the key does not stop this one: a
  // single press lowers the hand and lets go of the card the same tap locked.
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && pinned) {
      event.preventDefault();
      lower();
    }
  }

  /**
   * A tap on a card; a mouse click does nothing here, hovering is enough.
   * The first tap only raises the hand: the fan spreads out as it rises, and
   * the card under the finger at rest is seldom the one wanted. In the raised
   * hand, a tap selects a card, another one moves the selection, and a tap on
   * the selected card lets go of it.
   */
  function tapped(id: string): void {
    if (modal.open) {
      return;
    }
    // An inactive hand only turns active; it rises at the next tap, as any resting hand.
    if (!active) {
      onactivate?.();
      return;
    }
    if (!touch) {
      return;
    }
    const wasOpen = open;
    pinned = true;
    open = true;
    if (!wasOpen) {
      return;
    }
    const element = { kind: 'hand', id } as const;
    if (interaction.isLocked(element)) {
      interaction.release();
    } else {
      interaction.select(element);
    }
  }

  /** Lowers the hand; its selected card, if any, goes down with it. */
  function lower(): void {
    pinned = false;
    open = false;
    keptBand = null;
    if (interaction.locked && interaction.hovered?.kind === 'hand') {
      interaction.release();
    }
  }

  // A dialog freezes the table: the pinned hand goes down under its backdrop.
  $effect(() => {
    if (modal.open && pinned) {
      untrack(lower);
    }
  });

  // Another hand shown (Q, the hero selector) keeps the pinned hand up, to read that one too: a
  // hand with no card left goes down, and the selection of a card no longer shown goes.
  $effect(() => {
    if (pinned && cards.length === 0) {
      untrack(lower);
    }
  });
  // Only the active hand looks after the selection: the cards of the other one are never selected.
  $effect(() => {
    const hovered = interaction.hovered;
    const shownIds = new Set(cards.map((card) => card.id));
    if (active && interaction.locked && hovered?.kind === 'hand' && !shownIds.has(hovered.id)) {
      untrack(() => interaction.release());
    }
  });

  // A hand turning inactive goes down, even pinned up, its selected card with it. One turning active
  // under a resting mouse or pen follows it at once: it rises when the pointer is in its band, as the
  // pointer that made it active is. Only a change counts: the props may be handed over again unchanged.
  let wasActive = untrack(() => active);
  $effect(() => {
    if (active === wasActive) {
      return;
    }
    wasActive = active;
    if (active) {
      untrack(() => {
        if (pointer && !touch && !interaction.dragging) {
          followBand(pointer);
        }
      });
    } else {
      untrack(deactivate);
    }
  });

  function deactivate(): void {
    pinned = false;
    open = false;
    keptBand = null;
    const hovered = interaction.hovered;
    if (
      interaction.locked &&
      hovered?.kind === 'hand' &&
      cards.some((card) => card.id === hovered.id)
    ) {
      interaction.release();
    }
  }

  /** The pointer came into this inactive hand's band: it becomes the active one. */
  function activateUnder(at: { x: number; y: number }): void {
    if (modal.open || hidden) {
      return;
    }
    const band = bandOf(shownCards(), RESTING_MARGIN);
    if (band !== null && isIn(band, at)) {
      onactivate?.();
    }
  }

  function shownCards(): HTMLElement[] {
    return [...(list?.querySelectorAll<HTMLElement>('.hcard') ?? [])];
  }

  /**
   * The band of the cards, `margin` px around them, or null while none of them can be measured.
   * A card flying in (drawn, or brought back from the table) is drawn away from its slot
   * meanwhile: the band is the resting cards'. Once it has landed, the band is measured again.
   * Each card is measured by its fan, the card as seen: the slot stays upright, and the tilted
   * cards at the ends of the arc stick out of it.
   */
  function bandOf(cardsShown: HTMLElement[], margin: number): Band | null {
    const boxes = cardsShown
      .filter((card) => !isMoving(card))
      .map((card) => (card.querySelector('.fan') ?? card).getBoundingClientRect());
    if (boxes.length === 0) {
      return null;
    }
    return {
      left: Math.min(...boxes.map((box) => box.left)) - margin,
      right: Math.max(...boxes.map((box) => box.right)) + margin,
      top: Math.min(...boxes.map((box) => box.top)) - margin,
    };
  }

  // The card a reorder dropped in this hand, kept focused (interaction.kept), if any.
  const kept = $derived(interaction.kept?.seat === seat ? interaction.kept.id : null);

  // The card the pointer is on, as last entered and not left yet. It may lie over the kept card,
  // whose hover it takes only once the pointer is off the kept card (followKept).
  let under: string | null = null;

  /**
   * A card a mouse or a pen dropped back in this hand stays focused there,
   * popped and hovered, as if the pointer had entered it. Without it, the
   * gap the drag opened, wider than a slot, closes under the pointer at the
   * drop, and the card next to the dropped one, over it on the fan, takes
   * the hover and pops instead. Only when the pointer is on it.
   */
  function keepReordered(at: { x: number; y: number }): void {
    const id = reordered;
    reordered = null;
    if (id !== null && open && isOnCard(id, at)) {
      interaction.keep(seat, id);
    }
  }

  /**
   * The kept card stays focused while the pointer stays on its own hit area,
   * under its neighbours or not. Off it, the hover goes to the card the
   * pointer is on, if any, as :hover does.
   */
  function followKept(event: PointerEvent): void {
    if (kept === null || isOnCard(kept, { x: event.clientX, y: event.clientY })) {
      return;
    }
    letGoOfKept();
    if (under !== null) {
      interaction.enter({ kind: 'hand', id: under }, event);
    }
  }

  /** Lets go of the kept card: its hover lingers out, as a card's the pointer left. */
  function letGoOfKept(): void {
    const id = kept;
    interaction.kept = null;
    const hovered = interaction.hovered;
    if (hovered?.kind === 'hand' && hovered.id === id) {
      interaction.leave();
    }
  }

  // The kept card is let go of once the hand lowers or turns inactive, or once the card leaves it.
  $effect(() => {
    if (kept !== null && !(open && active && cards.some((card) => card.id === kept))) {
      untrack(letGoOfKept);
    }
  });

  // And once this hand goes: the kept card would hold the hover with no hand to let go of it.
  $effect(() => {
    return () => {
      if (interaction.kept?.seat === seat) {
        interaction.kept = null;
      }
    };
  });

  /**
   * Whether the point is on that card's own hit area (.hit and .foot), whatever lies over it there.
   * Measured upright: the box of a tilted card takes in a little more than the card.
   */
  function isOnCard(id: string, at: { x: number; y: number }): boolean {
    const card = shownCards().find((item) => item.dataset.id === id);
    const areas = [...(card?.querySelectorAll('.hit, .foot') ?? [])];
    return areas.some((area) => {
      const box = area.getBoundingClientRect();
      return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
    });
  }

  /** Opens the hand while the pointer is in its band, and lowers it once it is out. */
  function followBand(at: { x: number; y: number }): void {
    // A dialog freezes the table: the hand stays down under its backdrop. An inactive hand never rises.
    if (modal.open || !active) {
      keptBand = null;
      open = false;
      return;
    }
    const cardsShown = shownCards();
    if (cardsShown.length === 0) {
      keptBand = null;
      open = false;
      return;
    }
    const band = bandOf(cardsShown, open ? OPEN_MARGIN : RESTING_MARGIN);
    if (band === null) {
      return;
    }
    const inKeptBand = keptBand !== null && isIn(keptBand, at);
    if (!inKeptBand) {
      keptBand = null;
    }
    open = isIn(band, at) || inKeptBand;
    openBand = open ? band : null;
  }

  // Only the active hand's cards take the pointer: an inactive hand turns active first.
  function enterCard(id: string, event: PointerEvent): void {
    if (!active) {
      return;
    }
    under = id;
    if (kept !== null) {
      // A neighbour over the kept card: the kept card keeps the hover.
      if (isOnCard(kept, { x: event.clientX, y: event.clientY })) {
        return;
      }
      letGoOfKept();
    }
    interaction.enter({ kind: 'hand', id }, event);
  }

  function leaveCard(id: string): void {
    if (!active) {
      return;
    }
    if (under === id) {
      under = null;
    }
    // The kept card holds the hover until the pointer is off it (followKept).
    if (kept === null) {
      interaction.leave();
    }
  }

  function pressCard(id: string, event: PointerEvent): void {
    if (active) {
      interaction.press({ kind: 'hand', id }, event);
    }
  }

  function isIn(band: Band, at: { x: number; y: number }): boolean {
    return at.x >= band.left && at.x <= band.right && at.y >= band.top;
  }

  /** The smallest band that holds both. */
  function union(a: Band, b: Band): Band {
    return {
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
    };
  }

  // Cards leaving the raised hand under a mouse or a pen keep its band (see keptBand). A card
  // dragged out of the hand is lifted out of the fan as the drag starts instead, and the drag
  // decides then (see above).
  let shownIds: string[] = [];
  $effect(() => {
    const ids = shown.flatMap((card) => (card === 'gap' ? [] : [card.id]));
    const someLeft = shownIds.some((id) => !ids.includes(id));
    shownIds = ids;
    untrack(() => {
      if (someLeft && open && openBand !== null && !touch && !interaction.dragging) {
        keptBand = keptBand === null ? openBand : union(keptBand, openBand);
      }
    });
  });

  function isMoving(card: HTMLElement): boolean {
    // A drawn card waits hidden in its slot while its copy flies in from the pile.
    const id = card.dataset.id;
    if (id !== undefined && motion.drawing.has(id)) {
      return true;
    }
    // The cards' own CSS transitions do not count: opening or lowering the hand slides every card
    // to its other fan (`left`), and leaving them out of the band meanwhile would lower and raise
    // the hand again under a pointer at rest. Some environments (tests) have no Web Animations,
    // nor CSSTransition: nothing moves there.
    return (
      card
        .getAnimations?.()
        .some((animation) => animation.playState === 'running' && !isTransition(animation)) ?? false
    );
  }

  function isTransition(animation: Animation): boolean {
    return typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition;
  }

  // When a drag ends, and once the cards a view brought have landed, the band is measured again
  // at the pointer, even if it does not move: dropped away from the hand, or with the pointer
  // gone from it as the new cards flew in, the hand lowers.
  let wasDragging = false;
  $effect(() => {
    const dragging = interaction.dragging !== null;
    if (wasDragging && !dragging) {
      untrack(dropped);
    }
    wasDragging = dragging;
  });

  /**
   * A drag is over. A finger that drops a card back in the pinned hand (a
   * reorder) keeps it up, the drag having left it raised over the hand;
   * dropped anywhere else, the finger is on the table and the hand lowers.
   */
  function dropped(): void {
    if (!touch) {
      if (pointer) {
        followBand(pointer);
        keepReordered(pointer);
      }
    } else if (!(pinned && open)) {
      lower();
    }
  }

  $effect(() => {
    void shown;
    // A drawn card shows once its copy has landed: the band takes it in from then on.
    void motion.drawing.size;
    let stale = false;
    void tick()
      .then(() => motion.settled())
      .then(() => {
        if (!stale && pointer && !touch && !interaction.dragging) {
          followBand(pointer);
        }
      });
    return () => {
      stale = true;
    };
  });

  // The window has no pointerleave of its own: the root element gets it.
  $effect(() => {
    const root = document.documentElement;
    // A drag keeps the hand as the drag has it, even off the window. A lifted finger leaves the
    // window too: the hand it pinned stays up.
    const close = (event: PointerEvent) => {
      if (!interaction.dragging && event.pointerType !== 'touch') {
        pointer = null;
        open = false;
        keptBand = null;
      }
    };
    root.addEventListener('pointerleave', close);
    return () => root.removeEventListener('pointerleave', close);
  });
</script>

<svelte:window
  onpointermovecapture={followPointer}
  onpointerdowncapture={onPress}
  onpointerup={onRelease}
  onpointercancel={onRelease}
  onkeydown={onKey}
/>

<!--
  The table dims once, under the active hand, and the bottom of the table darkens once behind it,
  across the whole table.
-->
{#if active}
  <div class="veil" class:open></div>
  <div
    class="backdrop"
    class:open
    class:tinted={interaction.dropOn?.kind === 'hand'}
    style:--card-h="{cardSize.h}px"
    style:--rest-drop="{restDrop}px"
    style:--rest-scale={restScale}
    style:--pad-top="{HAND_PADDING.top}px"
    style:--pad-bottom="{HAND_PADDING.bottom}px"
  ></div>
{/if}

<ul
  class="hand"
  class:open
  class:pinned
  class:inactive={!active}
  class:keeping={kept !== null}
  class:hidden
  class:drop={dropTarget}
  aria-label={label}
  data-seat={seat}
  data-rest-x={restPlace?.offset ?? 0}
  style:margin-left="{inset.left}px"
  style:margin-right="{inset.right}px"
  style:--seat={color}
  style:--fan-x="{(extent.left + extent.right) / 2}px"
  style:--fan-w="{extent.right - extent.left}px"
  style:--card-w="{cardSize.w}px"
  style:--card-h="{cardSize.h}px"
  style:--rest-drop="{restDrop}px"
  style:--rest-scale={restScale}
  style:--pad-top="{HAND_PADDING.top}px"
  style:--pad-bottom="{HAND_PADDING.bottom}px"
  bind:this={list}
  bind:clientWidth={width}
>
  {#each shown as card, i (card === 'gap' ? card : card.id)}
    {@const slot = slots[i]}
    {#if card === 'gap'}
      <li
        class="hcard gap"
        aria-hidden="true"
        style:--x="{slot?.x ?? 0}px"
        style:--rot="{slot?.angle ?? 0}deg"
        style:--ty="{slot?.y ?? 0}px"
      >
        <div class="fan"></div>
      </li>
    {:else}
      {@const face = faceOf(card)}
      <!--
      Only a touch tap raises the hand and selects (there is no hover on touch): keyboard users act
      on hand cards with their keys instead.
    -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li
        class="hcard"
        data-id={card.id}
        class:locked={interaction.isLocked({ kind: 'hand', id: card.id })}
        class:kept={card.id === kept}
        class:arriving={motion.drawing.has(card.id)}
        style:--x="{slot?.x ?? 0}px"
        style:--rot="{slot?.angle ?? 0}deg"
        style:--ty="{slot?.y ?? 0}px"
        onpointerenter={(event) => enterCard(card.id, event)}
        onpointerleave={() => leaveCard(card.id)}
        onpointerdown={(event) => pressCard(card.id, event)}
        onclick={() => tapped(card.id)}
      >
        <!-- What the pointer hovers: the card at rest, which the pop does not move. -->
        <div class="hit"></div>
        <!-- And the strip below it, down to the bottom of the screen, so the card stays up there. -->
        <div class="foot"></div>
        <div class="fan">
          {#if isHidden(card)}
            <CardBack back={card.back} caption={captionOf(card)} />
          {:else}
            <!-- A landscape card is turned a quarter to fit the portrait slot. -->
            <CardFace
              images={face?.images ?? []}
              name={face?.name ?? ''}
              rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
            />
          {/if}
        </div>
      </li>
    {/if}
  {/each}
</ul>

<style>
  /* The table behind the open hand dims a little to put the hand forward. */
  .veil {
    grid-area: table;
    /* Above the table and everything on it but the hero selector (Table.svelte), below the open hand. */
    z-index: 2550;
    pointer-events: none;
    background: linear-gradient(to top, #07090fe6 0%, #07090f9e 40%, #07090f66 100%);
    opacity: 0;
    transition: opacity 0.22s;
  }

  .veil.open {
    opacity: 1;
  }

  /*
    The hand floats over the bottom of the table, which scrolls underneath it.
    At rest it sits lower and smaller, out of the way.
  */
  .hand {
    grid-area: table;
    align-self: end;
    position: relative;
    z-index: 20;
    /*
      Border box: the padding around one card. The prototype's min-heights (218 px, 180 px on a
      narrow screen) are below this, so its hand grows to the same height around its card row.
    */
    min-height: calc(var(--pad-top) + var(--card-h) + var(--pad-bottom));
    margin: 0;
    padding: var(--pad-top) 18px var(--pad-bottom);
    list-style: none;
    overflow: visible;
    pointer-events: none;
    /* Low enough that only the top part of the cards shows. */
    transform: translateY(var(--rest-drop)) scale(var(--rest-scale));
    transform-origin: 50% 100%;
    transition:
      transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.22s,
      visibility 0s;
  }

  /*
    The bottom of the table darkens behind the hand's cards, across the whole table whatever the
    hand's room: as tall as the hand, dropped and shrunk from the bottom with it, its width left
    whole. An element of its own, under the hand's cards: raised, between the veil (2550) and the
    hero selector (2575, Table.svelte), so that the selector shows in full; at rest, under the
    controls at the bottom of the table (30), as the resting hand.
  */
  .backdrop {
    grid-area: table;
    align-self: end;
    z-index: 19;
    min-height: calc(var(--pad-top) + var(--card-h) + var(--pad-bottom));
    background: linear-gradient(to top, #07090fe6 0%, #07090fa0 55%, transparent 100%);
    pointer-events: none;
    transform: translateY(var(--rest-drop)) scaleY(var(--rest-scale));
    transform-origin: 50% 100%;
    transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .backdrop.open {
    transform: none;
    z-index: 2560;
  }

  /* A table card would go back to a hand, this one or the other one. */
  .backdrop.tinted {
    background: linear-gradient(to top, #123349f0 0%, #123349a0 60%, transparent 100%);
  }

  /* The hand of the other deck, beside the active one, dimmed. */
  .hand.inactive {
    opacity: 0.8;
  }

  /* The other hand is raised over the room: this one fades out, then takes no pointer. */
  .hand.hidden {
    opacity: 0;
    visibility: hidden;
    transition:
      transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.22s,
      visibility 0s 0.22s;
  }

  .hand.inactive .hcard {
    cursor: pointer;
  }

  /* The fan glows from below in its player's colour, behind the cards: nothing lies on top of them. */
  .hand::before {
    content: '';
    position: absolute;
    left: calc(50% + var(--fan-x));
    bottom: 0;
    width: calc(var(--fan-w) * 1.16);
    height: calc(var(--pad-top) + var(--card-h));
    transform: translateX(-50%);
    background: radial-gradient(
      farthest-side at 50% 100%,
      color-mix(in srgb, var(--seat) 38%, transparent),
      transparent
    );
    pointer-events: none;
  }

  .hand.inactive::before {
    opacity: 0.6;
  }

  /* In use, the hand is above everything, other players' cursors included. */
  .hand.open {
    transform: none;
    z-index: 2600;
  }

  /* Placed around the middle of the hand, below its top padding: --x is the card's middle. */
  .hcard {
    position: absolute;
    top: var(--pad-top);
    left: calc(50% + var(--x));
    width: var(--card-w);
    height: var(--card-h);
    transform: translateX(-50%);
    /* Only its hit area and the foot below it take the pointer (see .hit and .foot). */
    pointer-events: none;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    /* The other cards slide aside when a dragged card comes back over the hand. */
    transition: left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* A drawn card shows once its copy, flying in from its pile, lands (Flights.svelte). */
  .hcard.arriving {
    visibility: hidden;
  }

  /* Where a dragged card would slot back in. */
  .hcard.gap .fan {
    border: 2px dashed #49c6ff88;
    border-radius: 9px;
    background: #49c6ff14;
    filter: none;
  }

  /*
    A card selected by a tap stays up like a hovered one. The hand a tap pinned pops its selected
    card only: a finger leaves a sticky :hover on the last card it tapped, deselected or not. A
    card just reordered under a mouse or a pen (kept) stays up too, and pops alone: the neighbour
    lying over it under the pointer does not.
  */
  .hand:not(.pinned, .inactive, .keeping) .hcard:hover,
  .hcard.kept,
  .hcard.locked {
    z-index: 60;
  }

  /*
    The card's place at rest on the fan, which takes the pointer. The hovered card pops (.fan
    below) without moving it: were the hit area the popped card, a pointer near its lower edge
    would lose it as it pops, get it back as it falls, and so on.
  */
  .hit {
    position: absolute;
    inset: 0;
    transform-origin: 50% 110%;
    transform: translateY(var(--ty)) rotate(var(--rot));
    pointer-events: auto;
  }

  /*
    The strip from the card's bottom on the arc down to the bottom of the hand, which is the
    bottom of the window: a pointer pushed to the bottom of the screen under a card keeps it popped.
    Upright, as wide as the slot: the rotation origin sits just below the card's bottom middle, so
    the tilt barely moves that bottom. A card lowered below the window, at the ends of the arc, has
    a top past the bottom edge, and so no foot at all. Like .hit, the pop never moves it.
  */
  .foot {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + var(--ty));
    bottom: calc(-1 * var(--pad-bottom));
    pointer-events: auto;
  }

  .fan {
    position: relative;
    width: 100%;
    height: 100%;
    pointer-events: none;
    transform-origin: 50% 110%;
    transform: translateY(var(--ty)) rotate(var(--rot));
    transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
  }

  /*
    The hovered card pops up larger, keeping its tilt on the arc. Scaled from below its bottom, its
    top rises by a third of its height: the raised hand's cards, sized from the preview's (or half
    a small screen), leave room enough for that above them in the window.
  */
  .hand:not(.pinned, .inactive, .keeping) .hcard:hover .fan,
  .hcard.kept .fan,
  .hcard.locked .fan {
    transform: translateY(calc(var(--ty) - 31px)) rotate(var(--rot)) scale(1.3);
  }

  /* The card selected by a tap glows in the selection colour, as on the table. */
  .hcard.locked .fan::before {
    content: '';
    position: absolute;
    inset: 1%;
    z-index: 1;
    border-radius: 7px;
    box-shadow:
      0 0 0 2px var(--sel),
      0 0 0 7px #49c6ff38;
    pointer-events: none;
  }

  /* The resting hand sits under the same veil the table gets when the hand is in use. */
  .fan::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 8px;
    background: #07090fa6;
    clip-path: var(--card-cut);
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.22s;
  }

  .hand.open .fan::after,
  .hcard.gap .fan::after {
    opacity: 0;
  }
</style>
