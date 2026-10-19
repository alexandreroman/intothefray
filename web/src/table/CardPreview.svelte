<!--
  The large picture of the hovered card: its face, or its back when hidden.
  Without a card, the frame is empty and says how to fill it. Shown over the
  table, at its top right corner.
-->
<script lang="ts" module>
  import type { Back } from '../lib/types';

  /** What the preview frame shows. */
  export type Preview =
    | { kind: 'face'; images: string[]; name: string; landscape: boolean }
    | { kind: 'back'; back: Back };
</script>

<script lang="ts">
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';

  let {
    preview,
    snug = false,
  }: {
    preview: Preview | null;
    /** The frame takes the card's own shape, landscape included, rather than a portrait slot. */
    snug?: boolean;
  } = $props();
</script>

<div class="frame" class:empty={!preview} class:snug aria-label="Card preview" role="figure">
  {#if !preview}
    <div class="hint">Hover a card<br />to see it here</div>
  {:else if preview.kind === 'back'}
    <div class="art">
      <CardBack back={preview.back} />
    </div>
  {:else}
    <div class="art" class:land={preview.landscape}>
      <CardFace images={preview.images} name={preview.name} landscape={preview.landscape} />
    </div>
  {/if}
</div>

<style>
  /* Fixed size: a portrait card fills it, a landscape one sits in its middle. */
  .frame {
    width: 100%;
    aspect-ratio: 5 / 7;
    display: grid;
    place-items: center;
    border-radius: 14px;
  }

  .frame.snug {
    aspect-ratio: auto;
  }

  /* Only the empty frame is outlined: a shown card keeps its cut corners clear. */
  .frame.empty {
    border: 1px dashed var(--line-strong);
  }

  .hint {
    color: var(--faint);
    font-size: 13px;
    text-align: center;
    padding: 12px;
  }

  .art {
    position: relative;
    width: 100%;
    aspect-ratio: 5 / 7;
    filter: drop-shadow(0 10px 24px #00000073);
  }

  .art.land {
    aspect-ratio: 7 / 5;
  }
</style>
