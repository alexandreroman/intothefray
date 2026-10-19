<script lang="ts">
  /** `image` is the hero face image of the player's identity, from the lobby view. */
  let { image, name, large = false }: { image?: string; name?: string; large?: boolean } = $props();

  // Without an image, the hero's initial stands in for it; without a hero, a question mark.
  const initial = $derived(name ? name.charAt(0).toUpperCase() : '?');
</script>

{#if image}
  <img class="hero" class:large src={image} alt={name ?? ''} />
{:else}
  <span class="hero" class:large aria-hidden="true">{initial}</span>
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
    /* A hero card is portrait: the square keeps its art, under the title bar. */
    object-fit: cover;
    object-position: 50% 30%;
  }

  .large {
    width: 64px;
    height: 64px;
    font-size: 30px;
  }
</style>
