<!--
  The viewer's hand, fanned on an arc at the bottom of the table. At rest it
  sits low and veiled; it rises when the pointer comes near it, and the table
  behind it dims.
-->
<script lang="ts">
  import type { CardView as TableCard, PackFace } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face.svelte';
  import { hover } from './hover.svelte';
  import { cardBox, fanPositions, HAND_CARD } from './layout';

  let {
    cards,
    faceOf,
  }: {
    /** The hand, in its order. */
    cards: TableCard[];
    /** The catalog face a card shows, null while unknown. */
    faceOf: (card: TableCard) => PackFace | null;
  } = $props();

  // The whole hand's width, padding included: fanPositions keeps that padding free.
  let width = $state(0);
  const slots = $derived(fanPositions(cards.length, width));

  let open = $state(false);
  let list = $state<HTMLElement>();

  // The band the pointer opens the hand in: the cards' area stretched down to
  // the bottom of the window. Open, it is wider, so the pointer that raised
  // the hand keeps it up.
  const RESTING_MARGIN = 6;
  const OPEN_MARGIN = 24;

  /**
   * Decided from the pointer position rather than :hover: as the hand rises,
   * its cards move away from a pointer resting at the bottom of the screen,
   * and :hover would flip on and off.
   */
  function followPointer(event: PointerEvent): void {
    const boxes = [...(list?.querySelectorAll('.hcard') ?? [])].map((card) =>
      card.getBoundingClientRect(),
    );
    if (boxes.length === 0) {
      open = false;
      return;
    }
    const margin = open ? OPEN_MARGIN : RESTING_MARGIN;
    const left = Math.min(...boxes.map((box) => box.left)) - margin;
    const right = Math.max(...boxes.map((box) => box.right)) + margin;
    const top = Math.min(...boxes.map((box) => box.top)) - margin;
    open = event.clientX >= left && event.clientX <= right && event.clientY >= top;
  }

  // The window has no pointerleave of its own: the root element gets it.
  $effect(() => {
    const root = document.documentElement;
    const close = () => (open = false);
    root.addEventListener('pointerleave', close);
    return () => root.removeEventListener('pointerleave', close);
  });
</script>

<svelte:window onpointermove={followPointer} />

<div class="veil" class:open></div>

<ul
  class="hand"
  class:open
  aria-label="Your hand"
  style:--card-w="{HAND_CARD.w}px"
  style:--card-h="{HAND_CARD.h}px"
  bind:this={list}
  bind:clientWidth={width}
>
  {#each cards as card, i (card.id)}
    {@const slot = slots[i]}
    {@const face = faceOf(card)}
    <li
      class="hcard"
      style:--x="{slot?.x ?? 0}px"
      onpointerenter={() => (hover.hovered = { kind: 'card', id: card.id })}
    >
      <div class="fan" style:--rot="{slot?.angle ?? 0}deg" style:--ty="{slot?.y ?? 0}px">
        {#if isHidden(card)}
          <CardBack back={card.back} />
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
  {/each}
</ul>

<style>
  /* The table behind the open hand dims a little to put the hand forward. */
  .veil {
    grid-area: table;
    /* Above the table and everything on it, below the open hand. */
    z-index: 2550;
    pointer-events: none;
    background: #05080fa6;
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
    /* Border box: the padding around one card. */
    min-height: calc(26px + var(--card-h) + 18px);
    margin: 0;
    padding: 26px 18px 18px;
    list-style: none;
    overflow: visible;
    pointer-events: none;
    background: linear-gradient(to top, #0b0f18e6 0%, #0b0f18a0 55%, transparent 100%);
    transform: translateY(100px) scale(0.82);
    transform-origin: 50% 100%;
    transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* In use, the hand is above everything, other players' cursors included. */
  .hand.open {
    transform: none;
    z-index: 2600;
  }

  /* Placed around the middle of the hand, below its top padding: --x is the card's middle. */
  .hcard {
    position: absolute;
    top: 26px;
    left: calc(50% + var(--x));
    width: var(--card-w);
    height: var(--card-h);
    transform: translateX(-50%);
    pointer-events: auto;
    cursor: grab;
    touch-action: none;
  }

  .hcard:hover {
    z-index: 60;
  }

  .fan {
    position: relative;
    width: 100%;
    height: 100%;
    transform-origin: 50% 110%;
    transform: translateY(var(--ty)) rotate(var(--rot));
    transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
  }

  /* The hovered card pops up larger, keeping its tilt on the arc. */
  .hcard:hover .fan {
    transform: translateY(calc(var(--ty) - 22px)) rotate(var(--rot)) scale(1.2);
  }

  /* The resting hand sits under the same veil the table gets when the hand is in use. */
  .fan::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 8px;
    background: #05080fa6;
    clip-path: var(--card-cut);
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.22s;
  }

  .hand.open .fan::after {
    opacity: 0;
  }
</style>
