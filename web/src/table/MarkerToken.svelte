<!--
  The first player token (spec 5.8): its art (FirstPlayerArt.svelte) placed
  in table units. It lies on the table, or in the drag layer while it is
  dragged or waits for the server after a drop, or in the presence layer
  while another player drags it.
-->
<script lang="ts">
  import FirstPlayerArt from './FirstPlayerArt.svelte';
  import { FIRST_PLAYER_BOX } from './layout';

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
  <FirstPlayerArt />
</div>

<style>
  .fptoken {
    position: absolute;
    z-index: 500;
    touch-action: none;
    filter: var(--token-shadow);
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
</style>
