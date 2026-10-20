<!--
  The table's icons, copied from the prototype's <symbol>s: stroke icons on a
  24 × 24 grid, drawn with currentColor.
-->
<script lang="ts" module>
  export type IconName = 'ready-all' | 'trophy' | 'hourglass';
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
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
  {#if name === 'ready-all'}
    <!--
      Exhaust the other way round: the card tilted to the right as exhausted (faint, dashed) turns
      back to the left, counter-clockwise, and stands filled; a second card behind it says "all".
    -->
    <rect
      x="13"
      y="8.5"
      width="8"
      height="11.5"
      rx="1.5"
      transform="rotate(25 17 14.25)"
      stroke-dasharray="2 2.2"
      opacity=".55"
    />
    <rect x="6" y="3.5" width="8.5" height="12.5" rx="1.5" opacity=".55" />
    <rect x="3" y="6.5" width="8.5" height="12.5" rx="1.5" fill="currentColor" fill-opacity=".18" />
    <path d="M20.5 6.5Q18.5 2.2 14 2.6" />
    <path d="M15.8 1 14 2.6 15.6 4.4" />
  {:else if name === 'trophy'}
    <!-- A cup on a stand: the victory display. -->
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" fill="currentColor" fill-opacity=".18" />
    <path d="M8 6H5a2 2 0 0 0 2 4h1" />
    <path d="M16 6h3a2 2 0 0 1-2 4h-1" />
    <path d="M12 13v4" />
    <path d="M8 20h8" />
    <path d="M10 17h4" />
  {:else}
    <!-- An hourglass, its sand run down: set-aside cards wait to come into play later. -->
    <path
      d="M11 12C11 15.5 7 16.5 7 21h10c0-4.5-4-5.5-4-9z"
      fill="currentColor"
      fill-opacity=".18"
      stroke="none"
    />
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3C7 7.5 11 8.5 11 12S7 16.5 7 21M17 3c0 4.5-4 5.5-4 9s4 4.5 4 9" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 20px;
    height: 20px;
    flex: none;
  }
</style>
