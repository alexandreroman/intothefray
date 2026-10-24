<!--
  The active counter's art, a sibling of the first player token (FirstPlayerArt.svelte) in each
  theme. With the printed first player token, it is drawn in that token's comic style: a speech
  bubble with a blue border and a tail, its rim in purples, a cream halftone interior and the
  word ACTIVE. Without it, it mirrors the drawn stand-in: an ink roundel with a purple rim, a
  crosshair, and ACTIVE VILLAIN around it. Its purples run from light to deep, top to bottom,
  so that it stands out on the table. It fills its box (MarkerToken.svelte).
-->
<script lang="ts">
  import type { Theme } from '../lib/theme';
  import { firstPlayerUrl } from './theme';

  let {
    theme,
  }: {
    /** The theme to draw it in; the stored one by default. */
    theme?: Theme;
  } = $props();

  // Several tokens can show at once (the table's and a ghost): each names its own defs.
  const uid = $props.id();
  const topPathId = `${uid}-top`;
  const bottomPathId = `${uid}-bot`;
  const dotsId = `${uid}-dots`;
  const fadeId = `${uid}-fade`;
  const borderId = `${uid}-border`;
  const rimId = `${uid}-rim`;
  const letterId = `${uid}-letter`;

  // The comic bubble goes with the printed first player token, whose style it copies.
  const comic = $derived(firstPlayerUrl(theme) !== null);

  // The bubble's outline, the outer edge of its purple rim: an ellipse around the interior's,
  // with a tail at its bottom left. The blue border is its stroke.
  const bubblePath = 'M32.2 68.4Q22 74 11 80Q17 70 16.9 59.5A44.5 33.5 0 1 1 32.2 68.4Z';
</script>

{#if comic}
  <!-- The printed token's proportions (500x419). -->
  <svg viewBox="0 0 100 84" role="img" aria-label="Active counter">
    <defs>
      <pattern id={dotsId} width="2.6" height="2.6" patternUnits="userSpaceOnUse">
        <circle cx="1.3" cy="1.3" r="0.95" fill="#a874ff" />
      </pattern>
      <!-- The halftone fades out towards the top of the interior. -->
      <linearGradient id="{fadeId}-ramp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.35" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#fff" stop-opacity="1" />
      </linearGradient>
      <mask id={fadeId} maskContentUnits="objectBoundingBox">
        <rect width="1" height="1" fill="url(#{fadeId}-ramp)" />
      </mask>
      <linearGradient id={borderId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c6e4ff" />
        <stop offset="1" stop-color="#4f8fdb" />
      </linearGradient>
      <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c79bff" />
        <stop offset="0.5" stop-color="#8a45f0" />
        <stop offset="1" stop-color="#5b1fc4" />
      </linearGradient>
      <linearGradient id={letterId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.1" stop-color="#e2ccff" />
        <stop offset="0.5" stop-color="#9d5cff" />
        <stop offset="0.9" stop-color="#5b1fc4" />
      </linearGradient>
    </defs>
    <path d={bubblePath} class="outline" fill="#2a0a5e" stroke="#2a0a5e" stroke-width="10" />
    <path
      d={bubblePath}
      class="outline"
      fill="url(#{borderId})"
      stroke="url(#{borderId})"
      stroke-width="7.5"
    />
    <path d={bubblePath} fill="url(#{rimId})" stroke="#2a0a5e" stroke-width="1.2" />
    <ellipse cx="51" cy="38" rx="37" ry="26.5" fill="#fff8ec" stroke="#2a0a5e" stroke-width="2.2" />
    <ellipse cx="51" cy="38" rx="35.75" ry="25.25" fill="url(#{dotsId})" mask="url(#{fadeId})" />
    <g transform="rotate(-6 51 38)">
      <text
        class="comic-text"
        x="52.8"
        y="40"
        fill="#2a0a5e"
        textLength="60"
        lengthAdjust="spacingAndGlyphs">ACTIVE</text
      >
      <text
        class="comic-text"
        x="51"
        y="38"
        fill="url(#{letterId})"
        textLength="60"
        lengthAdjust="spacingAndGlyphs">ACTIVE</text
      >
    </g>
  </svg>
{:else}
  <!-- The drawn token: an ink roundel with a purple rim and a crosshair. -->
  <svg viewBox="0 0 64 64" role="img" aria-label="Active counter">
    <defs>
      <path id={topPathId} d="M12 32a20 20 0 0 1 40 0" />
      <path id={bottomPathId} d="M9.5 32a22.5 22.5 0 0 0 45 0" />
      <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d2adff" />
        <stop offset="1" stop-color="#5b1fc4" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="#0d111b" stroke="url(#{rimId})" stroke-width="3.5" />
    <g fill="none" stroke="#c08cff" stroke-width="2.2" stroke-linecap="round">
      <circle cx="32" cy="32" r="8" />
      <path d="M32 19.5v8M32 36.5v8M19.5 32h8M36.5 32h8" />
    </g>
    <circle cx="32" cy="32" r="1.9" fill="#c08cff" />
    <text class="drawn-text"
      ><textPath href="#{topPathId}" startOffset="50%" text-anchor="middle">ACTIVE</textPath></text
    >
    <text class="drawn-text"
      ><textPath href="#{bottomPathId}" startOffset="50%" text-anchor="middle">VILLAIN</textPath
      ></text
    >
  </svg>
{/if}

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .outline {
    stroke-linejoin: round;
  }

  /* Heavy condensed lettering, outlined in black under its fill, as on the printed token. Its
     fill is the markup's: a gradient, or the dark drop shade behind it. */
  .comic-text {
    font-family: var(--font);
    font-stretch: 75%;
    font-weight: 900;
    font-size: 26px;
    text-anchor: middle;
    dominant-baseline: central;
    stroke: #0d111b;
    stroke-width: 4px;
    stroke-linejoin: round;
    paint-order: stroke;
  }

  .drawn-text {
    font-family: var(--font);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 7.5px;
    letter-spacing: 1.4px;
    fill: var(--text);
  }
</style>
