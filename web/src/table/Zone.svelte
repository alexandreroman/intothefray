<!--
  One zone of the table: its header, the separator handle that resizes the
  zone above (when that zone can be resized), and a horizontal scroller around
  the surface where its cards and piles lie, in table units. The zone is at
  least as wide as its scroller. Chips and fades at the edges tell what is
  scrolled out of view.
-->
<script lang="ts" module>
  export interface Heading {
    /** "Villain", in a caption box, or the player's name. */
    name: string;
    /** Dimmed after the name: the villain and its stage, or the hero, "you" and the hand size. */
    details: string[];
    /** CSS colour of a player's seat. */
    color?: string;
  }

  /** The zone above this one, when the separator between them resizes it. */
  export interface ResizeAbove {
    title: string;
    height: number;
    min: number;
    onresize: (height: number) => void;
  }
</script>

<script lang="ts">
  import type { Area, PackFace, CardView as TableCard, PileView as Pile, Size } from '../lib/types';
  import CardView from './CardView.svelte';
  import { snap } from './drag';
  import { footprints, hiddenAside, zoneWidth, type Footprint } from './layout';
  import FirstPlayerToken from './FirstPlayerToken.svelte';
  import { interaction } from './interaction.svelte';
  import PileView from './PileView.svelte';

  let {
    area,
    heading,
    cards,
    piles,
    topOf,
    faceOf,
    sizeOf,
    foreign,
    height,
    zoom,
    first = false,
    firstPlayer,
    tokenMovable = false,
    above,
  }: {
    area: Area;
    heading: Heading;
    /** The cards lying on this zone's table. */
    cards: TableCard[];
    piles: Pile[];
    /** The top card of a pile that lists its cards. */
    topOf: (pile: Pile) => TableCard | undefined;
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    sizeOf: (card: TableCard) => Size;
    /** Whether a pile is another player's. */
    foreign: (pile: Pile) => boolean;
    /** Surface height, in table units. */
    height: number;
    zoom: number;
    /** The first zone has no separator line above it. */
    first?: boolean;
    /** Where the first player token lies, when it is in this zone. */
    firstPlayer?: { x: number; y: number };
    /** Whether the viewer can drag the token: any player can, spectators cannot. */
    tokenMovable?: boolean;
    above?: ResizeAbove;
  } = $props();

  // The scroller pads the surface so glows, tilted cards and outlines near an edge stay visible.
  const SCROLL_PADDING = 24;
  const TOKEN_TIP = "First player — drag it into the next player's area";

  const titleId = $derived(`zone-${area}-title`);
  const villain = $derived(area === 'villain');
  // The caption box stands apart from what follows; a name runs on with a dot.
  const detailText = $derived(
    heading.details.length === 0 ? '' : (villain ? ' ' : ' · ') + heading.details.join(' · '),
  );

  let scroller = $state<HTMLElement>();
  let scrollerWidth = $state(0);
  // What the scroller shows of the surface, in table units.
  const visibleWidth = $derived((scrollerWidth - 2 * SCROLL_PADDING) / zoom);
  const surfaceWidth = $derived(zoneWidth(cards, piles, area, sizeOf, visibleWidth));

  let scrollLeft = $state(0);
  let fadeLeft = $state(false);
  let fadeRight = $state(false);

  // Nothing is known to be hidden before the scroller is measured.
  const hidden = $derived(
    scrollerWidth > 0
      ? hiddenAside(
          footprints(cards, piles, area, sizeOf),
          (scrollLeft - SCROLL_PADDING) / zoom,
          (scrollLeft + scrollerWidth - SCROLL_PADDING) / zoom,
        )
      : { left: [], right: [] },
  );
  // A chip brings the nearest hidden item to the left edge of the view.
  const nearestLeft = $derived(hidden.left.at(-1));
  const nearestRight = $derived(hidden.right[0]);
  const CHIP_SCROLL_MARGIN = 40;

  function scrollToItem(item: Footprint): void {
    scroller?.scrollTo({
      left: Math.max(0, item.x * zoom + SCROLL_PADDING - CHIP_SCROLL_MARGIN),
      behavior: 'smooth',
    });
  }

  function updateEdges(): void {
    if (!scroller) {
      return;
    }
    scrollLeft = scroller.scrollLeft;
    fadeLeft = scroller.scrollLeft > 2;
    fadeRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2;
  }

  // Whatever changes the scroll range also changes what is hidden at the edges.
  $effect(() => {
    void [surfaceWidth, scrollerWidth, zoom];
    updateEdges();
  });

  let resizing = $state<{ startY: number; startHeight: number } | null>(null);

  function startResize(event: PointerEvent): void {
    if (!above) {
      return;
    }
    event.preventDefault();
    // Captured, the pointer keeps the handle's row-resize cursor wherever it goes.
    // The moves still bubble up to the window listeners below.
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    resizing = { startY: event.clientY, startHeight: above.height };
  }

  function moveResize(event: PointerEvent): void {
    if (!resizing || !above) {
      return;
    }
    // The pointer moves in screen pixels, the height is in table units.
    const wanted = snap(resizing.startHeight + (event.clientY - resizing.startY) / zoom);
    const next = Math.max(above.min, wanted);
    if (next !== above.height) {
      above.onresize(next);
    }
  }

  function endResize(): void {
    resizing = null;
  }
</script>

<svelte:window onpointermove={moveResize} onpointerup={endResize} onpointercancel={endResize} />

<section
  class="zsec"
  class:sep={!first}
  class:player={!villain}
  style:--seat={heading.color}
  data-area={area}
  aria-labelledby={titleId}
>
  {#if above}
    <div
      class="sep-handle"
      class:active={resizing !== null}
      title={above.title}
      role="separator"
      aria-orientation="horizontal"
      onpointerdown={startResize}
    ></div>
  {/if}

  <div class="zh" id={titleId}>
    {#if villain}
      <span class="caption">{heading.name}</span>
    {:else}
      <i class="seat" aria-hidden="true"></i>
      <b>{heading.name}</b>
    {/if}
    {#if detailText}
      <span class="details">{detailText}</span>
    {/if}
  </div>

  <div class="zbox">
    <div class="fade l" class:show={fadeLeft}></div>
    <div class="fade r" class:show={fadeRight}></div>
    {#if nearestLeft}
      {@const label = `${hidden.left.length} more on the left`}
      <button
        class="chip l"
        title={label}
        aria-label={label}
        onclick={() => scrollToItem(nearestLeft)}
      >
        ← {hidden.left.length}
      </button>
    {/if}
    {#if nearestRight}
      {@const label = `${hidden.right.length} more on the right`}
      <button
        class="chip r"
        title={label}
        aria-label={label}
        onclick={() => scrollToItem(nearestRight)}
      >
        {hidden.right.length} →
      </button>
    {/if}
    <div
      class="zscroll"
      bind:this={scroller}
      bind:clientWidth={scrollerWidth}
      onscroll={updateEdges}
    >
      <!-- Card z-indexes come from the server and can be negative: the surface isolates them. -->
      <div class="surface" style:width="{surfaceWidth}px" style:height="{height}px">
        {#each piles as pile (pile.id)}
          {@const top = topOf(pile)}
          <PileView {pile} {top} face={faceOf(top)} foreign={foreign(pile)} />
        {/each}
        {#each cards as card (card.id)}
          <CardView {card} face={faceOf(card)} />
        {/each}
        {#if firstPlayer && !interaction.tokenMoving}
          <!-- The token has no bar: hovering it drops the previous element at once. -->
          <FirstPlayerToken
            x={firstPlayer.x}
            y={firstPlayer.y}
            tip={tokenMovable ? TOKEN_TIP : undefined}
            onpointerenter={(event) => interaction.enterNothing(event)}
            onpointerdown={tokenMovable
              ? (event) => interaction.press({ kind: 'firstPlayer' }, event)
              : undefined}
          />
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  /* As wide as the table, past its side padding, so that a player's tint reaches the edge. */
  .zsec {
    position: relative;
    margin: 0 -20px;
    padding: 14px 20px 30px;
  }

  .zsec.sep {
    border-top: 1px solid var(--line);
  }

  /* A player's zone is faintly lit from the left in their seat colour. */
  .zsec.player {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--seat, transparent) 6%, transparent),
      transparent 40%
    );
  }

  .zh {
    display: flex;
    align-items: center;
    height: 22px;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .zh .caption {
    font-size: 11px;
    padding: 4px 12px 4px 8px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  }

  /* The seat colour, as a diamond before the name. */
  .seat {
    flex: none;
    width: 8px;
    height: 8px;
    margin: 0 9px 0 2px;
    border-radius: 2px;
    transform: rotate(45deg);
    background: var(--seat, var(--muted));
  }

  .details {
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted);
    font-weight: 500;
  }

  /* The scroller clips, so it pads the surface; the negative margin keeps the surface in line. */
  .zbox {
    position: relative;
    margin: -24px;
  }

  .zscroll {
    padding: 24px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: #2c3654 transparent;
  }

  .surface {
    position: relative;
    isolation: isolate;
    zoom: var(--z, 1);
    background-image: radial-gradient(circle, var(--dot) 1px, transparent 1.2px);
    background-size: 10px 10px;
  }

  /* Something is scrolled out of view on that side. */
  .fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 36px;
    pointer-events: none;
    z-index: 900;
    display: none;
  }

  .fade.l {
    left: 0;
    background: linear-gradient(90deg, var(--table-bg), transparent);
  }

  .fade.r {
    right: 0;
    background: linear-gradient(-90deg, var(--table-bg), transparent);
  }

  .fade.show {
    display: block;
  }

  /* "N →": that many cards or piles are scrolled out on that side; a click brings them back. */
  .chip {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 950;
    font-size: 12px;
    padding: 4px 9px;
    border-radius: 999px;
    background: #07090fcc;
    border: 1px solid var(--line-strong);
  }

  .chip.l {
    left: 4px;
  }

  .chip.r {
    right: 4px;
  }

  .sep-handle {
    position: absolute;
    left: 0;
    right: 0;
    top: -9px;
    height: 17px;
    cursor: row-resize;
    z-index: 960;
    touch-action: none;
  }

  .sep-handle::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 1px;
    transition:
      background 0.15s,
      height 0.15s,
      top 0.15s;
  }

  /* A grip in the middle, shown on hover. */
  .sep-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 4px;
    width: 44px;
    height: 9px;
    margin-left: -22px;
    border-radius: 6px;
    background:
      radial-gradient(circle, var(--muted) 1.5px, transparent 2px) 0 50% / 9px 9px repeat-x,
      var(--panel-2);
    border: 1px solid var(--line);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .sep-handle:hover::before,
  .sep-handle.active::before {
    top: 7px;
    height: 3px;
    background: var(--sel);
  }

  .sep-handle:hover::after,
  .sep-handle.active::after {
    opacity: 1;
  }
</style>
