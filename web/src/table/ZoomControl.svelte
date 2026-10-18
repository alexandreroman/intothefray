<!--
  The zoom control at the bottom right of the table: − / % / +, and the
  keyboard shortcuts button. The parent owns the zoom and clamps it.
-->
<script lang="ts">
  import { ZOOM_STEP } from './zoom';

  let {
    zoom,
    onzoom,
    onkeys,
  }: {
    zoom: number;
    onzoom: (zoom: number) => void;
    /** Opens the keyboard shortcuts sheet (plan 5c). */
    onkeys?: () => void;
  } = $props();
</script>

<div class="zoomctl">
  <button title="Zoom out" aria-label="Zoom out" onclick={() => onzoom(zoom - ZOOM_STEP)}>−</button>
  <button class="pct" title="Back to 100%" aria-label="Back to 100%" onclick={() => onzoom(1)}>
    {Math.round(zoom * 100)}%
  </button>
  <button title="Zoom in" aria-label="Zoom in" onclick={() => onzoom(zoom + ZOOM_STEP)}>+</button>
  <span class="sep"></span>
  <button class="keys" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onclick={onkeys}>
    ?
  </button>
</div>

<style>
  /* Bottom right of the table column: never over a zone's piles. */
  .zoomctl {
    grid-area: table;
    align-self: end;
    justify-self: end;
    margin: 0 16px 14px 0;
    z-index: 30;
    display: flex;
    gap: 2px;
    background: #0b0f18e6;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 3px;
    box-shadow: 0 6px 16px #0008;
  }

  button {
    border: none;
    background: none;
    padding: 3px 9px;
    border-radius: 7px;
    font-weight: 700;
  }

  button:hover:not(:disabled) {
    background: #2a3555;
  }

  .pct {
    min-width: 54px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    width: 1px;
    background: var(--line);
    margin: 3px 2px;
  }

  .keys {
    padding: 3px 7px;
    display: inline-flex;
    align-items: center;
  }
</style>
