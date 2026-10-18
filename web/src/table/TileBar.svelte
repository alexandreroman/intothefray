<!--
  The floating action bar of a hovered tile in a card box: the table bar's
  look, centred across the card near its bottom edge, so that the art and the
  title stay visible (the prototype's showTileBar). Drawn inside the box's
  dialog, above its backdrop.
-->
<script lang="ts">
  import type { TileAction } from './boxes';
  import Icons from './Icons.svelte';

  let {
    anchor,
    actions,
    onrun,
    onenter,
    onleave,
  }: {
    /** The tile's card image, which the bar sits on. */
    anchor: HTMLElement;
    actions: TileAction[];
    onrun: (action: TileAction) => void;
    onenter: () => void;
    onleave: () => void;
  } = $props();

  // Room kept between the bar and the card's bottom edge.
  const BOTTOM_GAP = 6;
  // How far down the card the bar is centred.
  const LOW = 0.88;

  let bar = $state<HTMLElement>();
  let position = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    if (!bar) {
      return;
    }
    const r = anchor.getBoundingClientRect();
    const own = bar.getBoundingClientRect();
    position = {
      x: r.left + r.width / 2 - own.width / 2,
      y: Math.min(r.bottom - own.height - BOTTOM_GAP, r.top + r.height * LOW - own.height / 2),
    };
  });
</script>

<div
  class="tilebar"
  role="toolbar"
  aria-label="Card actions"
  tabindex="-1"
  bind:this={bar}
  class:placed={position !== null}
  style:left="{position?.x ?? 0}px"
  style:top="{position?.y ?? 0}px"
  onpointerenter={onenter}
  onpointerleave={onleave}
>
  {#each actions as action (action.id)}
    {#if action.icon}
      <button
        type="button"
        class="ico"
        aria-label={action.label}
        data-tip={action.label}
        onclick={() => onrun(action)}
      >
        <Icons name={action.icon} />
      </button>
    {:else}
      <button type="button" onclick={() => onrun(action)}>{action.label}</button>
    {/if}
  {/each}
</div>

<style>
  /* Above the tiles' rings and badges, inside the dialog. */
  .tilebar {
    position: fixed;
    z-index: 5;
    display: flex;
    gap: 5px;
    padding: 6px;
    border: 1px solid #3a4870;
    border-radius: 12px;
    background: #1a2236f5;
    box-shadow: 0 12px 30px #000c;
    /* Measured before it is placed: unseen until then. */
    visibility: hidden;
  }

  .tilebar.placed {
    visibility: visible;
    animation: floatin 0.12s ease-out;
  }

  @keyframes floatin {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .tilebar:focus {
    outline: none;
  }

  button.ico {
    padding: 6px 8px;
    display: inline-flex;
    align-items: center;
  }

  button.ico :global(svg) {
    width: 18px;
    height: 18px;
  }
</style>
