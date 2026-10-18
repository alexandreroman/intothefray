<!--
  One zone of the table: its header, the separator handle that resizes the
  zone above (when that zone can be resized), and a horizontal scroller around
  the surface where its cards and piles lie, in table units.
-->
<script lang="ts" module>
  export interface Heading {
    name: string;
    /** After the name: the villain's name or the hero's name. */
    detail?: string;
    /** Dimmed, in brackets. */
    aside?: string;
    /** CSS colour of the name, for the viewer's own zone. */
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
  import type { PackFace, CardView as TableCard, PileView as Pile } from '../lib/types';
  import CardView from './CardView.svelte';
  import { GRID } from './layout';
  import PileView from './PileView.svelte';
  import { firstPlayerUrl } from './theme';

  let {
    area,
    heading,
    cards,
    piles,
    topOf,
    faceOf,
    height,
    width,
    zoom,
    first = false,
    firstPlayer,
    above,
  }: {
    area: string;
    heading: Heading;
    /** The cards lying on this zone's table. */
    cards: TableCard[];
    piles: Pile[];
    /** The top card of a pile that lists its cards. */
    topOf: (pile: Pile) => TableCard | undefined;
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** Surface size, in table units. */
    height: number;
    width: number;
    zoom: number;
    /** The first zone has no separator line above it. */
    first?: boolean;
    /** Where the first player token lies, when it is in this zone. */
    firstPlayer?: { x: number; y: number };
    above?: ResizeAbove;
  } = $props();

  // The scroller pads the surface so glows, tilted cards and outlines near an edge stay visible.
  const SCROLL_PADDING = 24;
  const FIRST_PLAYER_BOX = { w: 84, h: 70 };

  const titleId = $derived(`zone-${area}-title`);
  // The space before the bracketed part belongs to the text, not to the dimmed span.
  const detailText = $derived(
    (heading.detail ? ` — ${heading.detail}` : '') + (heading.aside ? ' ' : ''),
  );

  let scroller = $state<HTMLElement>();
  let scrollerWidth = $state(0);
  // The dotted surface fills at least the visible width of the zone.
  const surfaceWidth = $derived(Math.max(width, (scrollerWidth - 2 * SCROLL_PADDING) / zoom));

  let fadeLeft = $state(false);
  let fadeRight = $state(false);

  function updateFades(): void {
    if (!scroller) {
      return;
    }
    fadeLeft = scroller.scrollLeft > 2;
    fadeRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2;
  }

  // Whatever changes the scroll range also changes what is hidden at the edges.
  $effect(() => {
    void [surfaceWidth, scrollerWidth, zoom];
    updateFades();
  });

  const tokenUrl = firstPlayerUrl();
  let tokenBroken = $state(false);

  let resizing = $state<{ startY: number; startHeight: number } | null>(null);

  const snap = (value: number) => Math.round(value / GRID) * GRID;

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

<section class="zsec" class:sep={!first} data-area={area} aria-labelledby={titleId}>
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
    <span
      ><b style:color={heading.color}>{heading.name}</b>{detailText}{#if heading.aside}<span
          class="aside">({heading.aside})</span
        >{/if}</span
    >
  </div>

  <div class="zbox">
    <div class="fade l" class:show={fadeLeft}></div>
    <div class="fade r" class:show={fadeRight}></div>
    <div
      class="zscroll"
      bind:this={scroller}
      bind:clientWidth={scrollerWidth}
      onscroll={updateFades}
    >
      <!-- Card z-indexes come from the server and can be negative: the surface isolates them. -->
      <div class="surface" style:width="{surfaceWidth}px" style:height="{height}px">
        {#each piles as pile (pile.id)}
          {@const top = topOf(pile)}
          <PileView {pile} {top} face={faceOf(top)} />
        {/each}
        {#each cards as card (card.id)}
          <CardView {card} face={faceOf(card)} />
        {/each}
        {#if firstPlayer}
          <div
            class="fptoken"
            style:left="{firstPlayer.x}px"
            style:top="{firstPlayer.y}px"
            style:width="{FIRST_PLAYER_BOX.w}px"
            style:height="{FIRST_PLAYER_BOX.h}px"
          >
            {#if tokenUrl && !tokenBroken}
              <img
                src={tokenUrl}
                alt="First player"
                draggable="false"
                onerror={() => (tokenBroken = true)}
              />
            {:else}
              <!-- The drawn stand-in: a cardboard roundel, gold rim, red field, white star. -->
              <svg viewBox="0 0 64 64" role="img" aria-label="First player">
                <defs>
                  <radialGradient id="fp-red" cx="38%" cy="32%" r="75%">
                    <stop offset="0" stop-color="#ff6b5c" />
                    <stop offset=".5" stop-color="#c8161f" />
                    <stop offset="1" stop-color="#5e070c" />
                  </radialGradient>
                  <linearGradient id="fp-gold" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#fff1a6" />
                    <stop offset=".45" stop-color="#e3a923" />
                    <stop offset="1" stop-color="#7a4c00" />
                  </linearGradient>
                  <path id="fp-top" d="M13 32a19 19 0 0 1 38 0" />
                  <path id="fp-bot" d="M10.5 32a21.5 21.5 0 0 0 43 0" />
                </defs>
                <circle
                  cx="32"
                  cy="32"
                  r="31"
                  fill="url(#fp-gold)"
                  stroke="#3d2600"
                  stroke-width="1.2"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26.5"
                  fill="url(#fp-red)"
                  stroke="#3d0003"
                  stroke-width="1"
                />
                <circle cx="32" cy="32" r="16" fill="none" stroke="#ffffff55" stroke-width="1" />
                <path
                  d="M32 19.5l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L32 38.1l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"
                  fill="#fff"
                  stroke="#3d0003"
                  stroke-width=".8"
                  stroke-linejoin="round"
                />
                <text class="fp-text"
                  ><textPath href="#fp-top" startOffset="50%" text-anchor="middle">FIRST</textPath
                  ></text
                >
                <text class="fp-text"
                  ><textPath href="#fp-bot" startOffset="50%" text-anchor="middle">PLAYER</textPath
                  ></text
                >
              </svg>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .zsec {
    position: relative;
    padding-top: 14px;
  }

  .zsec.sep {
    border-top: 1px solid var(--line);
    margin-top: 30px;
  }

  .zh {
    display: flex;
    font-size: 12px;
    color: #c4cbe0;
    height: 16px;
    margin-bottom: 12px;
    white-space: pre;
  }

  .zh b {
    color: var(--text);
  }

  /* Details in brackets matter less than the name. */
  .zh .aside {
    color: var(--faint);
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

  .fptoken {
    position: absolute;
    z-index: 500;
    filter: drop-shadow(0 3px 4px #000c) drop-shadow(0 1px 0 #2a1a00);
  }

  .fptoken img,
  .fptoken svg {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    pointer-events: none;
  }

  .fp-text {
    font-family: system-ui, sans-serif;
    font-weight: 900;
    font-size: 7.2px;
    letter-spacing: 1.2px;
    fill: #fff;
  }
</style>
