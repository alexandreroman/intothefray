<!--
  The table's action icons, copied from the prototype's <symbol>s: stroke
  icons on a 24 × 24 grid, drawn with currentColor.
-->
<script lang="ts" module>
  export type IconName =
    | 'exhaust'
    | 'flip'
    | 'discard'
    | 'stage-pick'
    | 'bottom'
    | 'shuffle'
    | 'token'
    | 'move'
    | 'trophy'
    | 'hourglass';
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
  {#if name === 'exhaust'}
    <!-- A card standing (faint, dashed) and the same card lying on its side. -->
    <rect x="3" y="2.5" width="9" height="13" rx="1.5" stroke-dasharray="2 2.2" opacity=".55" />
    <rect x="7" y="11" width="14" height="9.5" rx="1.5" fill="currentColor" fill-opacity=".18" />
  {:else if name === 'flip'}
    <!-- A card with its vertical axis, and a curved arrow above: it turns over. -->
    <rect x="6.5" y="8.5" width="11" height="14" rx="1.6" />
    <path d="M12 7v17" opacity=".6" />
    <path d="M5 5.5Q12 1.5 19 5.5" />
    <path d="M16 6 19 5.5 18 2.7" />
  {:else if name === 'discard'}
    <!-- A bin. -->
    <path d="M4 7h16" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v5.5M14 11v5.5" />
  {:else if name === 'stage-pick'}
    <!-- A hand of cards fanned out, the middle one picked. -->
    <path d="M7.5 7.7 6 7.3a1.4 1.4 0 0 0-1.7 1L2.3 17.1a1.4 1.4 0 0 0 1 1.7l3.2.8" opacity=".55" />
    <path d="M16.5 7.7 18 7.3a1.4 1.4 0 0 1 1.7 1l2 8.8a1.4 1.4 0 0 1-1 1.7l-3.2.8" opacity=".55" />
    <rect x="7.5" y="4.5" width="9" height="15" rx="1.5" fill="currentColor" fill-opacity=".18" />
  {:else if name === 'bottom'}
    <!-- A stack of cards seen side-on, and an arrow sliding a card in underneath it. -->
    <g stroke="none" fill="currentColor">
      <rect x="2.5" y="3.5" width="12" height="2.6" rx="1.3" opacity=".5" />
      <rect x="2.5" y="7.6" width="12" height="2.6" rx="1.3" opacity=".5" />
      <rect x="2.5" y="11.7" width="12" height="2.6" rx="1.3" opacity=".5" />
      <rect x="2.5" y="17" width="12" height="3" rx="1.5" />
    </g>
    <path d="M21.5 11.5v3.5a3.5 3.5 0 0 1-3.5 3.5h-1.5" stroke-width="1.7" />
    <path d="M18.8 16 16.3 18.5 18.8 21" stroke-width="1.7" />
  {:else if name === 'token'}
    <!-- A round token, and a "+" beside it: add one. -->
    <circle cx="9.5" cy="14" r="6.5" fill="currentColor" fill-opacity=".18" />
    <circle cx="9.5" cy="14" r="3" opacity=".6" />
    <path d="M18.5 2.5v6M15.5 5.5h6" />
  {:else if name === 'move'}
    <!-- A card, and an arrow leaving it to the right. -->
    <rect x="2.5" y="5" width="9" height="13" rx="1.5" fill="currentColor" fill-opacity=".18" />
    <path d="M9 11.5h12" />
    <path d="M17.5 8 21 11.5 17.5 15" />
  {:else if name === 'trophy'}
    <!-- A cup on a stand: the victory display. -->
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" fill="currentColor" fill-opacity=".18" />
    <path d="M8 6H5a2 2 0 0 0 2 4h1" />
    <path d="M16 6h3a2 2 0 0 1-2 4h-1" />
    <path d="M12 13v4" />
    <path d="M8 20h8" />
    <path d="M10 17h4" />
  {:else if name === 'hourglass'}
    <!-- An hourglass: set-aside cards wait to come into play later. -->
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />
  {:else}
    <!-- Shuffle: two crossing arrows. -->
    <path d="M3 7h3.5c3 0 4.5 10 8 10H20" />
    <path d="M3 17h3.5c1.4 0 2.4-2 3.3-4.2" />
    <path d="M13.2 9.2C14 8 14.8 7 16 7h4" />
    <path d="M17.5 4.5 20 7l-2.5 2.5" />
    <path d="M17.5 14.5 20 17l-2.5 2.5" />
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
