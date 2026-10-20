<!--
  A card back: the theme's image, or a drawn back when the theme has none
  (or when the image fails to load). A side deck's own back (Labor, Gift,
  Sense) is the classic back with the deck's name captioned at its bottom.
-->
<script lang="ts">
  import type { Back } from '../lib/types';
  import { backUrl } from './theme';

  let {
    back,
    label = '?',
    caption,
  }: {
    back: Back;
    /** What a drawn back says in its middle. */
    label?: string;
    /** The name of the side deck whose own back this is ("Labor"), written at its bottom. */
    caption?: string;
  } = $props();

  const NAMES: Record<Back, string> = {
    player: 'Player card back',
    encounter: 'Encounter card back',
    villain: 'Villain card back',
  };

  const url = $derived(backUrl(back));
  let broken = $state(false);
</script>

<!-- The back itself; `name` is its accessible name, empty when the caption's frame has it. -->
{#snippet art(name: string)}
  {#if url && !broken}
    <img src={url} alt={name} onerror={() => (broken = true)} />
  {:else}
    <div class="back {back}" role={name ? 'img' : undefined} aria-label={name || undefined}>
      {label}
    </div>
  {/if}
{/snippet}

{#if caption}
  <div class="captioned" role="img" aria-label="{caption} card back">
    {@render art('')}
    <span class="caption" aria-hidden="true">{caption.toUpperCase()}</span>
  </div>
{:else}
  {@render art(NAMES[back])}
{/if}

<style>
  img,
  .back,
  .captioned {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    pointer-events: none;
    clip-path: var(--card-cut);
  }

  /* The whole printed back shows, as a face does (CardFace.svelte). */
  img {
    object-fit: fill;
  }

  /* Ink with an inner frame: the frame's colour tells a player card from an encounter one. */
  .back {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 1px;
    color: var(--muted);
    background: var(--bg);
    border: 1px solid var(--line-strong);
    box-shadow:
      inset 0 0 0 7px var(--bg),
      inset 0 0 0 8px var(--frame);
  }

  /* The caption lies over the back, inside its cut. */
  .captioned {
    position: relative;
  }

  /* White capitals on a dark label: readable on every back image and on the drawn backs. */
  .caption {
    position: absolute;
    left: 50%;
    bottom: 9%;
    transform: translateX(-50%);
    /* As wide as the label, never past the card's edges. */
    max-width: calc(100% - 16px);
    box-sizing: border-box;
    /* A little more room after the label than before it. */
    padding: 4px 11px 4px 8px;
    border-radius: 4px;
    background: #000000b8;
    color: #fff;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 1px;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }

  .player {
    --frame: color-mix(in srgb, var(--p1) 45%, transparent);
  }

  /* The prototype draws no villain back: villain cards share the encounter one. */
  .encounter,
  .villain {
    --frame: #ff443873;
  }
</style>
