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
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: var(--panel-2);
    box-shadow: 0 14px 34px #0000008c;
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

  button {
    height: 34px;
    padding: 0 11px;
    border: none;
    border-radius: 9px;
    background: transparent;
    font-size: 13px;
  }

  button:hover {
    background: var(--line-strong);
  }

  button.ico {
    width: 38px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  button.ico :global(svg) {
    width: 20px;
    height: 20px;
  }
</style>
