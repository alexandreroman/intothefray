<script lang="ts">
  type Name = 'cards' | 'sliders' | 'back' | 'eye' | 'fullscreen' | 'exit-fullscreen' | 'cross';

  let { name }: { name: Name } = $props();

  // Stroke icons on a 24x24 grid, drawn with currentColor.
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'cards'}
    <rect x="3" y="5" width="9" height="13" rx="1.5" transform="rotate(-8 7.5 11.5)" />
    <rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(8 15.5 11.5)" />
  {:else if name === 'sliders'}
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  {:else if name === 'eye'}
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === 'fullscreen'}
    <!-- Four corners pointing outwards. -->
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  {:else if name === 'exit-fullscreen'}
    <!-- Four corners pointing inwards. -->
    <path d="M4 9h5V4M15 4v5h5M20 15h-5v5M9 20v-5H4" />
  {:else if name === 'cross'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else}
    <!-- An arrow pointing left. -->
    <path d="M19 12H5M11 6l-6 6 6 6" />
  {/if}
</svg>

<style>
  svg {
    width: 1.25em;
    height: 1.25em;
    flex: none;
  }
</style>
