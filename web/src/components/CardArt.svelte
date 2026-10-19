<!--
  The illustration of a hero or villain card, cut out of its face (lib/cardArt.ts): the card
  image is zoomed and moved inside a clipped box so that neither its title nor its text shows.
  It fills its parent, whose aspect it must be told.
-->
<script lang="ts">
  import { artFrame } from '../lib/cardArt';

  let {
    src,
    alt = '',
    aspect,
    loading,
  }: {
    src: string;
    alt?: string;
    /** The box's width over its height. */
    aspect: number;
    loading?: 'lazy' | 'eager';
  } = $props();

  const frame = $derived(artFrame(aspect));

  function percent(fraction: number): string {
    return `${(fraction * 100).toFixed(2)}%`;
  }
</script>

<span class="art">
  <img
    {src}
    {alt}
    {loading}
    style:width={percent(frame.width)}
    style:height={percent(frame.height)}
    style:left={percent(frame.left)}
    style:top={percent(frame.top)}
  />
</span>

<style>
  .art {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Scans are not all exactly 5:7: cover trims the difference rather than stretch the art. */
  img {
    position: absolute;
    display: block;
    max-width: none;
    object-fit: cover;
  }
</style>
