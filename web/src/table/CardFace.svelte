<!--
  A card image that tries each URL in turn, and shows a dark placeholder with
  the card name once none is left. Crops the corners with the uniform card cut.
  Some images of landscape cards are stored portrait, the card turned a quarter
  counter-clockwise: once loaded, such an image is turned back to fit.
-->
<script lang="ts">
  let {
    images,
    name = '',
    landscape = false,
    rotated = false,
  }: {
    images: string[];
    name?: string;
    /** The image is landscape: crop it with the landscape cut. */
    landscape?: boolean;
    /** A landscape image turned a quarter to fit a portrait slot. */
    rotated?: boolean;
  } = $props();

  // Failures are counted per images array, so a new array starts again from its first URL.
  // Raw state: a deep proxy would wrap the array and break the identity check.
  let failures = $state.raw<{ of: string[] | null; count: number }>({ of: null, count: 0 });
  const failed = $derived(failures.of === images ? failures.count : 0);
  const url = $derived(images[failed]);

  function tryNext(): void {
    failures = { of: images, count: failed + 1 };
  }

  // The image of a landscape card, as it loaded: stored portrait, it shows the card already
  // turned a quarter counter-clockwise. Kept with its URL: another URL is measured again.
  let measured = $state.raw<{ url: string; portrait: boolean } | null>(null);
  const sideways = $derived(
    (landscape || rotated) && measured !== null && measured.url === url && measured.portrait,
  );

  function measure(event: Event, loadedUrl: string): void {
    const img = event.currentTarget as HTMLImageElement;
    measured = { url: loadedUrl, portrait: img.naturalWidth < img.naturalHeight };
  }
</script>

{#if url === undefined}
  <div class="placeholder">{name}</div>
{:else if rotated && sideways}
  <!-- Turned a quarter counter-clockwise already: just as the portrait slot draws a landscape card. -->
  <img src={url} alt={name} onerror={tryNext} onload={(event) => measure(event, url)} />
{:else if rotated}
  <span class="land-in-portrait">
    <img src={url} alt={name} onerror={tryNext} onload={(event) => measure(event, url)} />
  </span>
{:else if sideways}
  <span class="portrait-in-land">
    <img src={url} alt={name} onerror={tryNext} onload={(event) => measure(event, url)} />
  </span>
{:else}
  <img
    class:land={landscape}
    src={url}
    alt={name}
    onerror={tryNext}
    onload={(event) => measure(event, url)}
  />
{/if}

<style>
  img,
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
    clip-path: var(--card-cut);
  }

  /*
    The whole printed card shows, its bottom line included: scans are a hair off the 5:7 slot,
    and covering it would cut their edges. Stretched by a percent or two, nothing is lost.
  */
  img {
    object-fit: fill;
    backface-visibility: hidden;
  }

  img.land {
    clip-path: var(--card-cut-land);
  }

  .placeholder {
    display: grid;
    place-items: center;
    padding: 8px;
    background: var(--bg);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    overflow: hidden;
  }

  /* The slot is portrait: the image is sized landscape, then turned a quarter. */
  .land-in-portrait {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    clip-path: var(--card-cut);
  }

  .land-in-portrait img {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 140%;
    height: 71.43%;
    transform: translate(-50%, -50%) rotate(-90deg);
    clip-path: none;
  }

  /* The slot is landscape and the image portrait: sized portrait, then turned a quarter clockwise. */
  .portrait-in-land {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    clip-path: var(--card-cut-land);
  }

  .portrait-in-land img {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 71.43%;
    height: 140%;
    transform: translate(-50%, -50%) rotate(90deg);
    clip-path: none;
  }
</style>
