<!--
  The large picture of the hovered card's face (a card back has none).
  Without a card, the frame is empty and says how to fill it. Shown over the
  table, in a corner of the play area.
-->
<script lang="ts" module>
  /** The face the preview frame shows. */
  export interface Preview {
    images: string[];
    name: string;
    landscape: boolean;
  }
</script>

<script lang="ts">
  import CardFace from './CardFace.svelte';

  let {
    preview,
    snug = false,
    hidden = false,
  }: {
    preview: Preview | null;
    /** The frame takes the card's own shape, landscape included, rather than a portrait slot. */
    snug?: boolean;
    /** Drawn as it fades out: no longer content, out of the accessibility tree. */
    hidden?: boolean;
  } = $props();
</script>

<div
  class="frame"
  class:empty={!preview}
  class:snug
  aria-label={hidden ? undefined : 'Card preview'}
  role={hidden ? undefined : 'figure'}
  aria-hidden={hidden || undefined}
>
  {#if !preview}
    <div class="hint">Hover a card<br />to see it here</div>
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
