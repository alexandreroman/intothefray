<!--
  The large picture of the hovered card's face, in the card's own shape, landscape included.
  Shown over the table, in a corner of the play area.
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
    hidden = false,
  }: {
    preview: Preview;
    /** Drawn as it fades out: no longer content, out of the accessibility tree. */
    hidden?: boolean;
  } = $props();
</script>

<div
  class="frame"
  aria-label={hidden ? undefined : 'Card preview'}
  role={hidden ? undefined : 'figure'}
  aria-hidden={hidden || undefined}
>
  <div class="art" class:land={preview.landscape}>
    <CardFace images={preview.images} name={preview.name} landscape={preview.landscape} />
  </div>
</div>

<style>
  .frame {
    width: 100%;
    display: grid;
    place-items: center;
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
