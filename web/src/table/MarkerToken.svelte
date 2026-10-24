<!--
  A marker of the table (spec 5.8): the first player token (FirstPlayerArt.svelte)
  or the active counter (ActiveCounterArt.svelte), placed in table units. It lies
  on the table, or in the drag layer while it is dragged or waits for the server
  after a drop, or in the presence layer while another player drags it.
-->
<script lang="ts">
  import type { MarkerName } from '../lib/types';
  import ActiveCounterArt from './ActiveCounterArt.svelte';
  import FirstPlayerArt from './FirstPlayerArt.svelte';
  import { ACTIVE_COUNTER_BOX, FIRST_PLAYER_BOX } from './layout';

  let {
    name,
    x,
    y,
    ghost = false,
    lifted = false,
    tip,
    onpointerenter,
    onpointerdown,
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
  } = $props();

  const box = $derived(name === 'active' ? ACTIVE_COUNTER_BOX : FIRST_PLAYER_BOX);
</script>

<div
  class="marker"
  data-marker={name}
  class:ghost
  class:lifted
  class:movable={tip !== undefined}
  role="presentation"
  data-tip={tip}
  {onpointerenter}
  {onpointerdown}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{box.w}px"
  style:height="{box.h}px"
>
  {#if name === 'active'}
    <ActiveCounterArt />
  {:else}
    <FirstPlayerArt />
  {/if}
</div>

<style>
  .marker {
    position: absolute;
    z-index: 500;
    touch-action: none;
    filter: var(--token-shadow);
    transition: transform 0.12s;
  }

  .marker.movable {
    cursor: grab;
  }

  .marker.movable:hover {
    transform: scale(1.06);
  }

  .marker.lifted {
    visibility: hidden;
  }

  /* Picked up under the pointer. */
  .marker.ghost {
    cursor: grabbing;
    transform: scale(1.12) rotate(-6deg);
  }
</style>
