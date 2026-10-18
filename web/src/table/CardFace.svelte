<!--
  A card image that tries each URL in turn, and shows a dark placeholder with
  the card name once none is left. Crops the corners with the uniform card cut.
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
</script>

{#if url === undefined}
  <div class="placeholder">{name}</div>
{:else if rotated}
  <span class="land-in-portrait"><img src={url} alt={name} onerror={tryNext} /></span>
{:else}
  <img class:land={landscape} src={url} alt={name} onerror={tryNext} />
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

  img {
    object-fit: cover;
    backface-visibility: hidden;
  }

  img.land {
    clip-path: var(--card-cut-land);
  }

  .placeholder {
    display: grid;
    place-items: center;
    padding: 8px;
    background: #0b0f18;
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
</style>
