<!--
  A marker of the table (spec 5.8): the first player token (FirstPlayerArt.svelte)
  or the active counter (ActiveCounterArt.svelte), placed in table units. It lies
  on the table, or in the drag layer while it is dragged or waits for the server
  after a drop, or in the presence layer while another player drags it. In dock
  mode it is drawn smaller, as the table's cards are.
-->
<script lang="ts">
  import type { MarkerName } from '../lib/types';
  import ActiveCounterArt from './ActiveCounterArt.svelte';
  import { dockMode } from './dockMode';
  import { DOCK_SCALE, dockCardBox } from './dockPiles';
  import FirstPlayerArt from './FirstPlayerArt.svelte';
  import { interaction } from './interaction.svelte';
  import { MARKER_BOXES } from './layout';

  let {
    name,
    x,
    y,
    ghost = false,
    lifted = false,
    tip,
    onpointerenter,
    onpointerdown,
    shift,
  }: {
    name: MarkerName;
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
    /** Dock mode, during a drag: how far it is drawn pushed aside with its card, as a translate. */
    shift?: string;
  } = $props();

  // In dock mode the marker is drawn at DOCK_SCALE from its corner, which the table
  // hands already projected (dockLayout.ts), its art zoomed with it.
  const dock = dockMode();
  const fullBox = $derived(MARKER_BOXES[name]);
  const box = $derived(dock.current ? dockCardBox(fullBox) : fullBox);
  // A finger held it still long enough (touch mode): it is picked up in place, ready to be dragged.
  const armed = $derived(!ghost && interaction.isArmed({ kind: 'marker', name }));
</script>

<div
  class="marker"
  data-marker={name}
  class:ghost
  class:lifted
  class:armed
  class:movable={tip !== undefined}
  class:scaled={dock.current}
  role="presentation"
  data-tip={tip}
  {onpointerenter}
  {onpointerdown}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{box.w}px"
  style:height="{box.h}px"
  style:--scale={dock.current ? DOCK_SCALE : undefined}
  style:translate={shift}
>
  {#if name === 'active'}
    <ActiveCounterArt />
  {:else}
    <FirstPlayerArt />
  {/if}
</div>

<style>
  /* Above every card (Table.svelte), as the server raises the cards' z-index with each move. */
  .marker {
    position: absolute;
    z-index: var(--above-cards);
    touch-action: none;
    filter: var(--token-shadow);
    /* Pushed aside with its card by a drag (dock mode), it glides as the surface says. */
    transition:
      transform 0.12s,
      translate var(--shift-glide, 0s) ease-out;
  }

  /* In touch mode, a finger swiping over the marker scrolls the table: only a hold drags it. */
  :global(.app.touch) .marker {
    touch-action: pan-x pan-y;
  }

  /* Dock mode: the element is the marker's drawn box, and its art is zoomed by the same scale. */
  .marker.scaled > :global(*) {
    zoom: var(--scale);
  }

  .marker.movable {
    cursor: grab;
  }

  @media (hover: hover) {
    .marker.movable:hover {
      transform: scale(1.06);
    }
  }

  .marker.lifted {
    visibility: hidden;
  }

  /* Picked up under the pointer, or armed by a hold, in place. */
  .marker.armed,
  .marker.ghost {
    cursor: grabbing;
    transform: scale(1.12) rotate(-6deg);
  }
</style>
