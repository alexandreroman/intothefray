<script lang="ts">
  import { cardByCode, imageUrls } from '../../lib/catalog';

  let { code, name, large = false }: { code?: string; name?: string; large?: boolean } = $props();

  let image = $state<string | null>(null);

  /** The first image of the identity's hero face (face 0 when it has none). */
  async function heroImage(identity: string): Promise<string | null> {
    const info = await cardByCode(identity);
    const faces = info?.card.faces ?? [];
    const face = faces.find((f) => f.type === 'hero') ?? faces[0];
    return face ? (imageUrls(face)[0] ?? null) : null;
  }

  $effect(() => {
    image = null;
    if (!code) {
      return;
    }
    // A late answer for a previous code must not overwrite the current one.
    let current = true;
    heroImage(code)
      .then((url) => {
        if (current) {
          image = url;
        }
      })
      .catch(() => {}); // The "?" stays: the packs could not be loaded.
    return () => {
      current = false;
    };
  });
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
