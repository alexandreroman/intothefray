<!--
  The viewer's hand, fanned on an arc at the bottom of the table. At rest it
  sits low and veiled; it rises when the pointer comes near it, and the table
  behind it dims. Touch has no hover: a tap raises the hand and pins it up
  until a tap on the table, Escape or a swipe down lowers it.
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
    fanPositions,
    HAND_CARD,
    HAND_PADDING,
    HAND_REST_DROP,
    HAND_REST_SCALE,
  } from './layout';
  import { motion } from './motion.svelte';

  let {
    cards,
    faceOf,
    captionOf = () => undefined,
    cardSize = HAND_CARD,
    restDrop = HAND_REST_DROP,
    open = $bindable(false),
  }: {
    /** The hand, in its order. */
    cards: TableCard[];
    /** The catalog face a card shows, null while unknown. */
    faceOf: (card: TableCard) => PackFace | null;
    /** The caption of a card's back (backCaption): its side deck's label, if any. */
    captionOf?: (card: TableCard) => string | undefined;
    /** The size of a card, in px: smaller on a narrow or a small screen (Table.svelte). */
    cardSize?: { w: number; h: number };
    /** How far the resting hand drops below its raised place, in px. */
    restDrop?: number;
    /** Whether the hand is raised. */
    open?: boolean;
  } = $props();

  /** The cards in the given order, then any the order does not know (drawn meanwhile). */
  function inOrder(order: readonly string[]): TableCard[] {
    const ordered = order.flatMap((id) => cards.filter((card) => card.id === id));
    return [...ordered, ...cards.filter((card) => !order.includes(card.id))];
  }

  // A card dragged out of the hand leaves the fan, and stays out until the
  // server answers its drop. Brought back over the fan, the other cards make
  // room where it would slot in; a reorder shows its new order meanwhile.
  const shown = $derived.by((): (TableCard | 'gap')[] => {
    const order = interaction.landing?.handOrder;
    const ordered = order ? inOrder(order) : cards;
    const others: (TableCard | 'gap')[] = ordered.filter((card) => !interaction.isLifted(card.id));
    const gap = interaction.handGap;
    if (interaction.dragging?.element.kind === 'hand' && gap !== null) {
      others.splice(Math.min(gap, others.length), 0, 'gap');
    }
    return others;
  });

  // The whole hand's width, padding included: fanPositions keeps that padding free.
  let width = $state(0);
  const slots = $derived(fanPositions(shown.length, width, cardSize.w));

  // A table card of the viewer's own, dragged over the hand to go back to it.
  const dropTarget = $derived(interaction.dropOn?.kind === 'hand');

  // While something is dragged, the drag decides: the hand rises only under a
  // hand card brought back over it, or a table card going back to it. Once
  // the card is dropped, the pointer decides again (see below).
  $effect.pre(() => {
    const drag = interaction.dragging;
    if (drag) {
      open = (drag.element.kind === 'hand' && interaction.handGap !== null) || dropTarget;
    }
  });
  let list = $state<HTMLElement>();

  // The band the pointer opens the hand in: the cards' area stretched down to
  // the bottom of the window. Open, it is wider, so the pointer that raised
  // the hand keeps it up.
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
   * and :hover would flip on and off.
   */
  function followPointer(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      followSwipe(event);
      return;
    }
    // A mouse or a pen takes over from the finger that pinned the hand.
    pinned = false;
    if (!interaction.dragging) {
      followBand(pointer);
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
    // does there: one tap leaves the hand for the table. Elsewhere (the player selector, the zoom),
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
    if (!touch || modal.open) {
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

  // Another hand shown (Q, the player selector) keeps the pinned hand up, to read that one too: a
  // hand with no card left goes down, and the selection of a card no longer shown goes.
  $effect(() => {
    if (pinned && cards.length === 0) {
      untrack(lower);
    }
  });
  $effect(() => {
    const hovered = interaction.hovered;
    const shownIds = new Set(cards.map((card) => card.id));
    if (interaction.locked && hovered?.kind === 'hand' && !shownIds.has(hovered.id)) {
      untrack(() => interaction.release());
    }
  });

  /** Opens the hand while the pointer is in its band, and lowers it once it is out. */
  function followBand(at: { x: number; y: number }): void {
    // A dialog freezes the table: the hand stays down under its backdrop.
    if (modal.open) {
      open = false;
      return;
    }
    const cardsShown = [...(list?.querySelectorAll<HTMLElement>('.hcard') ?? [])];
    if (cardsShown.length === 0) {
      open = false;
      return;
    }
    // A card flying in (drawn, or brought back from the table) is drawn away from its slot
    // meanwhile: the band is the resting cards'. Once it has landed, the band is measured again.
    const boxes = cardsShown
      .filter((card) => !isMoving(card))
      .map((card) => card.getBoundingClientRect());
    if (boxes.length === 0) {
      return;
    }
    const margin = open ? OPEN_MARGIN : RESTING_MARGIN;
    const left = Math.min(...boxes.map((box) => box.left)) - margin;
    const right = Math.max(...boxes.map((box) => box.right)) + margin;
    const top = Math.min(...boxes.map((box) => box.top)) - margin;
    open = at.x >= left && at.x <= right && at.y >= top;
  }

  function isMoving(card: HTMLElement): boolean {
    // A drawn card waits hidden in its slot while its copy flies in from the pile.
    const id = card.dataset.id;
    if (id !== undefined && motion.drawing.has(id)) {
      return true;
    }
    // Some environments (tests) have no Web Animations: nothing moves there.
    return card.getAnimations?.().some((animation) => animation.playState === 'running') ?? false;
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
      }
    };
    root.addEventListener('pointerleave', close);
    return () => root.removeEventListener('pointerleave', close);
  });
</script>

<svelte:window
  onpointermove={followPointer}
  onpointerdowncapture={onPress}
  onpointerup={onRelease}
  onpointercancel={onRelease}
  onkeydown={onKey}
/>

<div class="veil" class:open></div>

<ul
  class="hand"
  class:open
  class:pinned
  class:drop={dropTarget}
  aria-label="Your hand"
  style:--card-w="{cardSize.w}px"
  style:--card-h="{cardSize.h}px"
  style:--rest-drop="{restDrop}px"
  style:--rest-scale={HAND_REST_SCALE}
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
        class:arriving={motion.drawing.has(card.id)}
        style:--x="{slot?.x ?? 0}px"
        style:--rot="{slot?.angle ?? 0}deg"
        style:--ty="{slot?.y ?? 0}px"
        onpointerenter={(event) => interaction.enter({ kind: 'hand', id: card.id }, event)}
        onpointerleave={() => interaction.leave()}
        onpointerdown={(event) => interaction.press({ kind: 'hand', id: card.id }, event)}
        onclick={() => tapped(card.id)}
      >
        <!-- What the pointer hovers: the card at rest, which the pop does not move. -->
        <div class="hit"></div>
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
    /* Above the table and everything on it, below the open hand. */
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
    background: linear-gradient(to top, #07090fe6 0%, #07090fa0 55%, transparent 100%);
    /* Low enough that only the top part of the cards shows. */
    transform: translateY(var(--rest-drop)) scale(var(--rest-scale));
    transform-origin: 50% 100%;
    transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* In use, the hand is above everything, other players' cursors included. */
  .hand.open {
    transform: none;
    z-index: 2600;
  }

  /* A table card would go back to it. */
  .hand.drop {
    background: linear-gradient(to top, #123349f0 0%, #123349a0 60%, transparent 100%);
  }

  /* Placed around the middle of the hand, below its top padding: --x is the card's middle. */
  .hcard {
    position: absolute;
    top: var(--pad-top);
    left: calc(50% + var(--x));
    width: var(--card-w);
    height: var(--card-h);
    transform: translateX(-50%);
    /* Only its hit area takes the pointer (see .hit). */
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
  .hcard.gap {
    pointer-events: none;
  }

  .hcard.gap .fan {
    border: 2px dashed #49c6ff88;
    border-radius: 9px;
    background: #49c6ff14;
    filter: none;
  }

  /*
    A card selected by a tap stays up like a hovered one. The hand a tap pinned pops its selected
    card only: a finger leaves a sticky :hover on the last card it tapped, deselected or not.
  */
  .hand:not(.pinned) .hcard:hover,
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

  /* The hovered card pops up larger, keeping its tilt on the arc. */
  .hand:not(.pinned) .hcard:hover .fan,
  .hcard.locked .fan {
    transform: translateY(calc(var(--ty) - 31px)) rotate(var(--rot)) scale(1.2);
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
