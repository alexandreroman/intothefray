<script lang="ts">
  /** `image` is the hero face image of the player's identity, from the lobby view. */
  let { image, name, large = false }: { image?: string; name?: string; large?: boolean } = $props();
</script>

{#if image}
  <img class="hero" class:large src={image} alt={name ?? ''} />
{:else}
  <span class="hero" class:large aria-hidden="true">?</span>
{/if}

<style>
  .hero {
    width: 36px;
    height: 48px;
    border-radius: 4px;
    background: #222b44;
    flex: none;
    display: grid;
    place-items: center;
    color: var(--faint);
    object-fit: cover;
    box-shadow: 0 0 0 2px var(--pc, transparent);
  }

  .large {
    width: 54px;
    height: 76px;
    border-radius: 5px;
    box-shadow: none;
  }
</style>
