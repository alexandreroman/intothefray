<script lang="ts">
  import CardArt from '../CardArt.svelte';

  /** `image` is the hero face image of the player's identity, from the lobby view. */
  let { image, name }: { image?: string; name?: string } = $props();

  // Without an image, the hero's initial stands in for it; without a hero, a question mark.
  const initial = $derived(name ? name.charAt(0).toUpperCase() : '?');
</script>

{#if image}
  <span class="hero"><CardArt src={image} alt={name ?? ''} aspect={1} /></span>
{:else}
  <span class="hero" aria-hidden="true">{initial}</span>
{/if}

<style>
  .hero {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    border: 1px solid #ffffff0f;
    background: var(--panel-2);
    flex: none;
    display: grid;
    place-items: center;
    color: var(--pc, var(--faint));
    font-stretch: 62%;
    font-weight: 900;
    font-style: italic;
    font-size: 22px;
    overflow: hidden;
  }
</style>
