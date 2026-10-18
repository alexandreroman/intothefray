<script lang="ts">
  type Name = 'cards' | 'sliders' | 'back';

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
  {:else}
    <path d="M15 5l-7 7 7 7" />
  {/if}
</svg>

<style>
  svg {
    width: 1.25em;
    height: 1.25em;
    flex: none;
  }
</style>
