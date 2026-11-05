<!--
  The illustration of a card, cut out of its face (lib/cardArt.ts): the card image is zoomed and
  moved inside a clipped box onto its art window (a character's by default), so that neither its
  title nor its text shows.
  It fills its parent, whose aspect it must be told. A parent zooms the art by setting --art-zoom
  (a scale, 1 by default), e.g. on hover.
-->
<script lang="ts">
  import { artFrame, type ArtWindow } from '../lib/cardArt';

  let {
    src,
    alt = '',
    aspect,
    artWindow,
    loading,
    onerror,
  }: {
    src: string;
    alt?: string;
    /** The box's width over its height. */
    aspect: number;
    /** Where the art lies on the face: a hero's or a villain's when not told (artWindowFor). */
    artWindow?: ArtWindow;
    loading?: 'lazy' | 'eager';
    /** The image failed to load: the parent may try another URL. */
    onerror?: () => void;
  } = $props();

  const frame = $derived(artFrame(aspect, artWindow));

  function percent(fraction: number): string {
    return `${(fraction * 100).toFixed(2)}%`;
  }
</script>

<span class="art">
  <img
    {src}
    {alt}
    {loading}
    {onerror}
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
    /* The box's centre is the art window's centre (artFrame), so the zoom stays on the art. The
       parent's own clip trims the scaled box. */
    transform: scale(var(--art-zoom, 1));
    transition: transform 0.2s ease-out;
  }

  /* Scans are not all exactly 5:7: cover trims the difference rather than stretch the art. */
  img {
    position: absolute;
    display: block;
    max-width: none;
    object-fit: cover;
  }
</style>
