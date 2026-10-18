<!--
  The first player token (spec 5.8): the theme's image, or a drawn stand-in
  without one, placed in table units. It lies in its zone, or in the drag
  layer while it is dragged or waits for the server after a drop.
-->
<script lang="ts">
  import { FIRST_PLAYER_BOX } from './layout';
  import { firstPlayerUrl } from './theme';

  let {
    x,
    y,
    ghost = false,
    tip,
    onpointerenter,
    onpointerdown,
  }: {
    x: number;
    y: number;
    /** The copy that follows the pointer (DragLayer). */
    ghost?: boolean;
    /** The tooltip, for players, who can move it. */
    tip?: string;
    onpointerenter?: (event: PointerEvent) => void;
    onpointerdown?: (event: PointerEvent) => void;
  } = $props();

  const tokenUrl = firstPlayerUrl();
  let tokenBroken = $state(false);
</script>

<div
  class="fptoken"
  class:ghost
  class:movable={tip !== undefined}
  role="presentation"
  data-tip={tip}
  {onpointerenter}
  {onpointerdown}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{FIRST_PLAYER_BOX.w}px"
  style:height="{FIRST_PLAYER_BOX.h}px"
>
  {#if tokenUrl && !tokenBroken}
    <img src={tokenUrl} alt="First player" draggable="false" onerror={() => (tokenBroken = true)} />
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
      <circle cx="32" cy="32" r="31" fill="url(#fp-gold)" stroke="#3d2600" stroke-width="1.2" />
      <circle cx="32" cy="32" r="26.5" fill="url(#fp-red)" stroke="#3d0003" stroke-width="1" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#ffffff55" stroke-width="1" />
      <path
        d="M32 19.5l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L32 38.1l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z"
        fill="#fff"
        stroke="#3d0003"
        stroke-width=".8"
        stroke-linejoin="round"
      />
      <text class="fp-text"
        ><textPath href="#fp-top" startOffset="50%" text-anchor="middle">FIRST</textPath></text
      >
      <text class="fp-text"
        ><textPath href="#fp-bot" startOffset="50%" text-anchor="middle">PLAYER</textPath></text
      >
    </svg>
  {/if}
</div>

<style>
  .fptoken {
    position: absolute;
    z-index: 500;
    touch-action: none;
    filter: drop-shadow(0 3px 4px #000c) drop-shadow(0 1px 0 #2a1a00);
    transition: transform 0.12s;
  }

  .fptoken.movable {
    cursor: grab;
  }

  .fptoken.movable:hover {
    transform: scale(1.06);
  }

  /* Picked up under the pointer. */
  .fptoken.ghost {
    cursor: grabbing;
    transform: scale(1.12) rotate(-6deg);
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
