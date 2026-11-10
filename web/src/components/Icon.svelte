<script lang="ts" module>
  export type IconName =
    | 'sliders'
    | 'back'
    | 'eye'
    | 'fullscreen'
    | 'exit-fullscreen'
    | 'cross'
    | 'pencil'
    | 'villain-players'
    | 'villain-player'
    | 'check'
    | 'arrow-right'
    | 'undo'
    | 'history'
    | 'reload'
    | 'ready-all'
    | 'trophy'
    | 'hourglass'
    | 'star'
    | 'sandbox'
    | 'players'
    | 'link'
    | 'info'
    | 'dice'
    | 'plus'
    | 'copy'
    | 'megaphone'
    | 'user-minus'
    | 'leave'
    | 'trash'
    | 'share';
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();

  // Stroke icons on a 24x24 grid, drawn with currentColor. A caller changes their size and stroke width
  // with CSS: the stroke-width attribute gives way to any style. data-icon names the drawing, so a test
  // can tell which one a control shows. The cross closes things only (bars, dialogs, chips).
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  data-icon={name}
>
  {#if name === 'sliders'}
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
  {:else if name === 'pencil'}
    <!-- A pencil, writing towards the bottom left. -->
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  {:else if name === 'villain-players'}
    <!-- A horned villain, and the players under it: every row of the table. -->
    <circle cx="12" cy="7" r="2.6" fill="currentColor" fill-opacity=".35" />
    <path d="M10.2 5.1 9.2 2.6M13.8 5.1l1-2.5" />
    <circle cx="6.5" cy="15.2" r="2.4" />
    <circle cx="17.5" cy="15.2" r="2.4" />
    <path d="M2.5 21.5a4 4 0 0 1 8 0M13.5 21.5a4 4 0 0 1 8 0" />
  {:else if name === 'villain-player'}
    <!-- The same villain over one player: the villain's row and one player's. -->
    <circle cx="12" cy="7" r="2.6" fill="currentColor" fill-opacity=".35" />
    <path d="M10.2 5.1 9.2 2.6M13.8 5.1l1-2.5" />
    <circle cx="12" cy="15.2" r="2.4" />
    <path d="M7.5 21.5a4.5 4.5 0 0 1 9 0" />
  {:else if name === 'check'}
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  {:else if name === 'arrow-right'}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if name === 'undo'}
    <!-- A hooked arrow going back. -->
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  {:else if name === 'history'}
    <!-- A clock face. -->
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  {:else if name === 'reload'}
    <!--
      A browser's Reload: an arrow going clockwise almost all the way round, its head at the top
      right. Cut at three quarters, the circle reads as a C.
    -->
    <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6l1.5 1.5" />
    <path d="M19.5 3v4.5H15" />
  {:else if name === 'ready-all'}
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
  {:else if name === 'hourglass'}
    <!-- An hourglass, its sand run down: set-aside cards wait to come into play later. -->
    <path
      d="M11 12C11 15.5 7 16.5 7 21h10c0-4.5-4-5.5-4-9z"
      fill="currentColor"
      fill-opacity=".18"
      stroke="none"
    />
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3C7 7.5 11 8.5 11 12S7 16.5 7 21M17 3c0 4.5-4 5.5-4 9s4 4.5 4 9" />
  {:else if name === 'star'}
    <!-- A five-pointed star: a scenario's own out-of-play area, such as The Collection. -->
    <path
      d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      fill="currentColor"
      fill-opacity=".18"
    />
  {:else if name === 'sandbox'}
    <!-- A card, and another one fanned out behind it: cards to move freely. -->
    <rect x="4" y="5" width="11" height="15" rx="2" />
    <path d="M18 7.5l2 .6-3.4 12-6.3-1.8" />
  {:else if name === 'players'}
    <!-- A person, and another one behind. -->
    <circle cx="9" cy="8" r="3.2" />
    <path
      d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M16 5.2a3.2 3.2 0 0 1 0 5.8M18 14.4c1.4.7 2.3 2.4 2.6 4.6"
    />
  {:else if name === 'link'}
    <!-- Two chain links. -->
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  {:else if name === 'info'}
    <!-- An "i" in a circle. -->
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  {:else if name === 'dice'}
    <!-- A die showing four. -->
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'copy'}
    <!-- A sheet in front of another one. -->
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  {:else if name === 'megaphone'}
    <!-- A megaphone calling to the right: its cone, the mouthpiece behind, the handle under it, a sound. -->
    <path d="M7 9l10-4.5v14L7 14z" />
    <path d="M7 9H5.5a2.5 2.5 0 0 0 0 5H7" />
    <path d="M8.4 14.6 9.8 20h2.8l-1.2-4.4" />
    <path d="M20 9a4.5 4.5 0 0 1 0 5" />
  {:else if name === 'user-minus'}
    <!-- A person, and a minus beside them: a player taken off their seat. -->
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21c0-4 3-7 7-7s7 3 7 7" />
    <path d="M16 11h6" />
  {:else if name === 'leave'}
    <!-- An arrow going out of a door, to the left. -->
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  {:else if name === 'trash'}
    <!-- A bin with its lid. -->
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  {:else if name === 'share'}
    <!-- iOS's Share: an arrow rising out of a box open at the top. -->
    <path d="M9 9.5H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2" />
    <path d="M12 2.5v12M8.5 6 12 2.5 15.5 6" />
  {:else if name === 'back'}
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
