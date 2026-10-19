<!--
  The first player token (spec 5.8): the theme's image, or a drawn stand-in
  without one, placed in table units. It lies on the table, or in the drag
  layer while it is dragged or waits for the server after a drop, or in the
  presence layer while another player drags it.
-->
<script lang="ts">
  import { FIRST_PLAYER_BOX } from './layout';
  import { firstPlayerUrl } from './theme';

  let {
    x,
    y,
    ghost = false,
    lifted = false,
    tip,
    onpointerenter,
    onpointerdown,
  }: {
    x: number;
    y: number;
    /** The copy that follows a pointer (DragLayer, Presence). */
    ghost?: boolean;
    /** Hidden in place while another player's ghost of it shows (Presence). */
    lifted?: boolean;
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
  class:lifted
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
    <!-- The drawn stand-in: an ink roundel with a spark rim and a four-pointed spark. -->
    <svg viewBox="0 0 64 64" role="img" aria-label="First player">
      <defs>
        <path id="fp-top" d="M12 32a20 20 0 0 1 40 0" />
        <path id="fp-bot" d="M9.5 32a22.5 22.5 0 0 0 45 0" />
      </defs>
      <circle cx="32" cy="32" r="30" fill="#0d111b" stroke="#ffce3a" stroke-width="3" />
      <path d="M32 20.5l3.1 8.4 8.4 3.1-8.4 3.1-3.1 8.4-3.1-8.4-8.4-3.1 8.4-3.1z" fill="#ffce3a" />
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
    filter: drop-shadow(0 3px 4px #000c);
    transition: transform 0.12s;
  }

  .fptoken.movable {
    cursor: grab;
  }

  .fptoken.movable:hover {
    transform: scale(1.06);
  }

  .fptoken.lifted {
    visibility: hidden;
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
    font-family: var(--font);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 7.5px;
    letter-spacing: 1.4px;
    fill: var(--text);
  }
</style>
