<!--
  The active counter's art: a round token in the villain purple, drawn, with
  the word ACTIVE. It fills its box (MarkerToken.svelte); one drawing in both
  themes, the purple and the ink being readable on the table of either.
-->
<script lang="ts">
  // Static art: nothing to compute.
</script>

<svg viewBox="0 0 64 64" role="img" aria-label="Active counter">
  <circle cx="32" cy="32" r="30" fill="var(--villain)" stroke="#0d111b" stroke-width="3" />
  <circle
    cx="32"
    cy="32"
    r="25"
    fill="none"
    stroke="#0d111b"
    stroke-opacity="0.45"
    stroke-width="1.5"
  />
  <text class="active-text" x="32" y="32" text-anchor="middle" dominant-baseline="central"
    >ACTIVE</text
  >
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .active-text {
    font-family: var(--font);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.04em;
    fill: #0d111b;
  }
</style>
