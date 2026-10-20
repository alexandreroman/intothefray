<!--
  A card back: the theme's image, or a drawn back when the theme has none
  (or when the image fails to load). A side deck's own back is always drawn,
  with the deck's name on it.
-->
<script lang="ts">
  import type { Back } from '../lib/types';
  import { backUrl } from './theme';

  let {
    back,
    label = '?',
    side,
  }: {
    back: Back;
    /** What the drawn back says, but for a side back, which says its deck's name. */
    label?: string;
    /** The name of the side deck a 'side' back belongs to ("Labor"), undefined while unknown. */
    side?: string;
  } = $props();

  const NAMES: Record<Exclude<Back, 'side'>, string> = {
    player: 'Player card back',
    encounter: 'Encounter card back',
    villain: 'Villain card back',
  };

  const name = $derived(back === 'side' ? `${side ?? 'Side'} card back` : NAMES[back]);
  const text = $derived(back === 'side' ? (side?.toUpperCase() ?? '?') : label);
  const url = $derived(backUrl(back));
  let broken = $state(false);
</script>

{#if url && !broken}
  <img src={url} alt={name} onerror={() => (broken = true)} />
{:else}
  <div class="back {back}" role="img" aria-label={name}>{text}</div>
{/if}

<style>
  img,
  .back {
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

  .player {
    --frame: color-mix(in srgb, var(--p1) 45%, transparent);
  }

  /* The prototype draws no villain back: villain cards share the encounter one. */
  .encounter,
  .villain {
    --frame: #ff443873;
  }

  /* A side deck's own back: a frame of its own, apart from the player and encounter ones. */
  .side {
    --frame: color-mix(in srgb, var(--villain) 60%, transparent);
  }
</style>
