<!--
  The small "− value +" pill above a hovered token or status. It stays while
  the pointer is on it, like the action bar.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { interaction } from './interaction.svelte';

  let {
    anchor,
    label,
    value,
    zoom,
    version,
    onstep,
  }: {
    /** The token or status disc, found anew at every placement as redraws replace it. */
    anchor: () => HTMLElement | null;
    /** "damage", "stunned": what the pill changes. */
    label: string;
    value: number;
    /** Read to place the pill again when the table is zoomed. */
    zoom: number;
    /** Changes with every redraw of the table, which may move the token. */
    version?: unknown;
    onstep: (delta: -1 | 1) => void;
  } = $props();

  // Room between the pill and its token, and from the window edge.
  const GAP = 2;
  const EDGE = 4;

  let pill = $state<HTMLElement>();
  let position = $state<{ x: number; y: number } | null>(null);

  function place(): void {
    const element = anchor();
    if (!pill || !element) {
      position = null;
      return;
    }
    const r = element.getBoundingClientRect();
    const own = pill.getBoundingClientRect();
    const centred = r.left + r.width / 2 - own.width / 2;
    position = {
      x: Math.min(Math.max(EDGE, centred), window.innerWidth - own.width - EDGE),
      y: r.top - own.height - GAP,
    };
  }

  $effect(() => {
    void [value, zoom, version];
    place();
  });

  // Gone with its token, the pill is no longer under the pointer.
  onDestroy(() => {
    interaction.onPill = false;
  });
</script>

<svelte:window onscrollcapture={place} onresize={place} />

<div
  class="tokpill"
  role="group"
  aria-label="Change {label}"
  bind:this={pill}
  style:left="{position?.x ?? 0}px"
  style:top="{position?.y ?? 0}px"
  class:placed={position !== null}
  onpointerenter={() => interaction.enterPill()}
  onpointerleave={() => interaction.leavePill()}
>
  <button type="button" aria-label="Remove 1" data-tip="Remove 1" onclick={() => onstep(-1)}
    >−</button
  >
  <span class="value">{value}</span>
  <button type="button" aria-label="Add 1" data-tip="Add 1" onclick={() => onstep(1)}>+</button>
</div>

<style>
  .tokpill {
    position: fixed;
    z-index: 4500;
    display: flex;
    align-items: center;
    padding: 1px;
    background: #0b0f18f0;
    border: 1px solid #3a4870;
    border-radius: 999px;
    box-shadow: 0 4px 10px #000a;
    /* Measured before it is placed: unseen until then. */
    visibility: hidden;
  }

  .tokpill.placed {
    visibility: visible;
  }

  button {
    border: none;
    background: none;
    padding: 0 8px;
    font:
      700 14px/20px system-ui,
      sans-serif;
    border-radius: 999px;
    color: var(--text);
  }

  button:hover {
    background: #2a3555;
  }

  .value {
    min-width: 26px;
    margin: 1px 0;
    padding: 0 6px;
    text-align: center;
    font:
      800 14px/20px system-ui,
      sans-serif;
    background: #0c111b;
    border-radius: 6px;
  }
</style>
