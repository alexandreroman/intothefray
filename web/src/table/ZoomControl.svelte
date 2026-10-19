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
    keysShown = false,
    keysButton = $bindable(),
  }: {
    zoom: number;
    onzoom: (zoom: number) => void;
    /** Shows or hides the keyboard shortcuts sheet. */
    onkeys?: () => void;
    /** Whether the keyboard shortcuts sheet is shown. */
    keysShown?: boolean;
    /** The keyboard button, which the sheet opens from. */
    keysButton?: HTMLButtonElement;
  } = $props();
</script>

<div class="zoomctl">
  <button
    class="btn-ghost"
    data-tip="Zoom out"
    data-kbd="−"
    aria-label="Zoom out"
    onclick={() => onzoom(zoom - ZOOM_STEP)}>−</button
  >
  <button
    class="btn-ghost pct"
    data-tip="Back to 100%"
    data-kbd="0"
    aria-label="Back to 100%"
    onclick={() => onzoom(1)}
  >
    {Math.round(zoom * 100)}%
  </button>
  <button
    class="btn-ghost"
    data-tip="Zoom in"
    data-kbd="+"
    aria-label="Zoom in"
    onclick={() => onzoom(zoom + ZOOM_STEP)}>+</button
  >
  <span class="sep"></span>
  <button
    class="btn-ghost keys"
    data-tip="Keyboard shortcuts"
    data-kbd="?"
    aria-label="Keyboard shortcuts"
    aria-keyshortcuts="?"
    aria-expanded={keysShown}
    bind:this={keysButton}
    onclick={onkeys}
  >
    <!-- A keyboard: two rows of keys and a space bar. -->
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </svg>
  </button>
</div>

<style>
  /* Placed by the table, at the bottom right: never over the piles, which start at the left. */
  .zoomctl {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background: #141a28eb;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 6px 16px #0008;
  }

  button {
    height: 32px;
    min-width: 32px;
    padding: 0 8px;
    border: none;
    border-radius: 8px;
    color: #c9cfdf;
    font-weight: 700;
  }

  .pct {
    min-width: 54px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    width: 1px;
    height: 20px;
    margin: 0 2px;
    background: var(--line-strong);
  }

  .keys {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .keys[aria-expanded='true'] {
    color: var(--sel);
  }
</style>
