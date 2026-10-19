<!--
  The viewer's hand, fanned on an arc at the bottom of the table. At rest it
  sits low and veiled; it rises when the pointer comes near it, and the table
  behind it dims.
-->
<script lang="ts">
  import type { CardView as TableCard, PackFace } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face';
  import { interaction } from './interaction.svelte';
  import { cardBox, fanPositions, HAND_CARD, HAND_CARD_NARROW } from './layout';

  let {
    cards,
    faceOf,
    narrow = false,
  }: {
    /** The hand, in its order. */
    cards: TableCard[];
    /** The catalog face a card shows, null while unknown. */
    faceOf: (card: TableCard) => PackFace | null;
    /** A narrow screen, where the cards are smaller. */
    narrow?: boolean;
  } = $props();

  const cardSize = $derived(narrow ? HAND_CARD_NARROW : HAND_CARD);

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

  let open = $state(false);

  // A table card of the viewer's own, dragged over the hand to go back to it.
  const dropTarget = $derived(interaction.dropOn?.kind === 'hand');

  // While something is dragged, the drag decides: the hand rises only under a
  // hand card brought back over it, or a table card going back to it. It is
  // left as it was when the card is dropped, so a reordered hand stays up,
  // until the pointer moves again.
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

  /**
   * Decided from the pointer position rather than :hover: as the hand rises,
   * its cards move away from a pointer resting at the bottom of the screen,
   * and :hover would flip on and off.
   */
  function followPointer(event: PointerEvent): void {
    if (interaction.dragging) {
      return;
    }
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
    // A drag keeps the hand as the drag has it, even off the window.
    const close = () => {
      if (!interaction.dragging) {
        open = false;
      }
    };
    root.addEventListener('pointerleave', close);
    return () => root.removeEventListener('pointerleave', close);
  });
</script>

<svelte:window onpointermove={followPointer} />

<div class="veil" class:open></div>

<ul
  class="hand"
  class:open
  class:drop={dropTarget}
  aria-label="Your hand"
  style:--card-w="{cardSize.w}px"
  style:--card-h="{cardSize.h}px"
  bind:this={list}
  bind:clientWidth={width}
>
  {#each shown as card, i (card === 'gap' ? card : card.id)}
    {@const slot = slots[i]}
    {#if card === 'gap'}
      <li class="hcard gap" aria-hidden="true" style:--x="{slot?.x ?? 0}px">
        <div class="fan" style:--rot="{slot?.angle ?? 0}deg" style:--ty="{slot?.y ?? 0}px"></div>
      </li>
    {:else}
      {@const face = faceOf(card)}
      <!--
      Only a touch tap selects (there is no hover on touch): keyboard users act on hand cards with
      their keys instead.
    -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li
        class="hcard"
        data-id={card.id}
        class:locked={interaction.isLocked({ kind: 'hand', id: card.id })}
        style:--x="{slot?.x ?? 0}px"
        onpointerenter={(event) => interaction.enter({ kind: 'hand', id: card.id }, event)}
        onpointerleave={() => interaction.leave()}
        onpointerdown={(event) => interaction.press({ kind: 'hand', id: card.id }, event)}
        onclick={() => interaction.select({ kind: 'hand', id: card.id })}
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
    min-height: calc(26px + var(--card-h) + 18px);
    margin: 0;
    padding: 26px 18px 18px;
    list-style: none;
    overflow: visible;
    pointer-events: none;
    background: linear-gradient(to top, #07090fe6 0%, #07090fa0 55%, transparent 100%);
    /* Low enough that only the top part of the cards shows. */
    transform: translateY(140px) scale(0.82);
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
    top: 26px;
    left: calc(50% + var(--x));
    width: var(--card-w);
    height: var(--card-h);
    transform: translateX(-50%);
    pointer-events: auto;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    /* The other cards slide aside when a dragged card comes back over the hand. */
    transition: left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
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

  /* A card selected by a tap stays up like a hovered one. */
  .hcard:hover,
  .hcard.locked {
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
  .hcard:hover .fan,
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
