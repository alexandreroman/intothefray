<!--
  A card back: the theme's image, or a drawn back when the theme has none
  (or when the image fails to load).
-->
<script lang="ts">
  import type { Back } from '../lib/types';
  import { backUrl } from './theme';

  let { back, label = '?' }: { back: Back; label?: string } = $props();

  const NAMES: Record<Back, string> = {
    player: 'Player card back',
    encounter: 'Encounter card back',
    villain: 'Villain card back',
  };

  const url = $derived(backUrl(back));
  let broken = $state(false);
</script>

{#if url && !broken}
  <img src={url} alt={NAMES[back]} onerror={() => (broken = true)} />
{:else}
  <div class="back {back}" role="img" aria-label={NAMES[back]}>{label}</div>
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

  img {
    object-fit: cover;
  }

  .back {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 1px;
    color: #fff;
  }

  .player {
    background: repeating-linear-gradient(45deg, #1d3f8f, #1d3f8f 8px, #234a9f 8px, #234a9f 16px);
    border: 3px solid #0e1f47;
  }

  /* The prototype draws no villain back: villain cards share the encounter one. */
  .encounter,
  .villain {
    background: repeating-linear-gradient(45deg, #6b2a8f, #6b2a8f 8px, #7a3299 8px, #7a3299 16px);
    border: 3px solid #351447;
  }
</style>
