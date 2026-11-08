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
  /* 44px in a seat, 40px on a phone. */
  .hero {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    border: 1px solid #ffffff0f;
    background: var(--panel-2);
    flex: none;
    display: grid;
    place-items: center;
    color: var(--pc, var(--faint));
    font-weight: 900;
    font-size: 18px;
    overflow: hidden;
  }

  @media (max-width: 599px) {
    .hero {
      width: 40px;
      height: 40px;
    }
  }
</style>
