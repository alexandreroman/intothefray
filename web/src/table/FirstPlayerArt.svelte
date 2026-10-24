<!--
  The first player token's art: the theme's image, or a drawn stand-in
  without one (or when the image fails to load). It fills its box: the token
  on the table (MarkerToken.svelte), or a theme's preview in the options.
-->
<script lang="ts">
  import type { Theme } from '../lib/theme';
  import { firstPlayerUrl } from './theme';

  let {
    theme,
  }: {
    /** The theme to draw it in; the stored one by default (the options preview others). */
    theme?: Theme;
  } = $props();

  // Several drawn tokens can show at once (the table's and a ghost): each names its own paths.
  const uid = $props.id();
  const topPathId = `${uid}-top`;
  const bottomPathId = `${uid}-bot`;

  const url = $derived(firstPlayerUrl(theme));
  let broken = $state(false);
</script>

{#if url && !broken}
  <img src={url} alt="First player" draggable="false" onerror={() => (broken = true)} />
{:else}
  <!-- The drawn stand-in: an ink roundel with a spark rim and a four-pointed spark. -->
  <svg viewBox="0 0 64 64" role="img" aria-label="First player">
    <defs>
      <path id={topPathId} d="M12 32a20 20 0 0 1 40 0" />
      <path id={bottomPathId} d="M9.5 32a22.5 22.5 0 0 0 45 0" />
    </defs>
    <circle cx="32" cy="32" r="30" fill="#0d111b" stroke="#ffce3a" stroke-width="3" />
    <path d="M32 20.5l3.1 8.4 8.4 3.1-8.4 3.1-3.1 8.4-3.1-8.4-8.4-3.1 8.4-3.1z" fill="#ffce3a" />
    <text class="fp-text"
      ><textPath href="#{topPathId}" startOffset="50%" text-anchor="middle">FIRST</textPath></text
    >
    <text class="fp-text"
      ><textPath href="#{bottomPathId}" startOffset="50%" text-anchor="middle">PLAYER</textPath
      ></text
    >
  </svg>
{/if}

<style>
  img,
  svg {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    pointer-events: none;
  }

  .fp-text {
    font-family: var(--font);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 7.5px;
    letter-spacing: 1.4px;
    fill: var(--text);
  }
</style>
