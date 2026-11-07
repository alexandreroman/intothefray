---
name: "Card image preload"
description: "The table lets the browser preload the first image URL of every pool card face, at low priority"
type: project
---

# Card image preload

- Once the pool is loaded (see [[project_card_pool]]), the table creates
  an `Image` with `fetchPriority = 'low'` for the first URL of every face
  of every pool card, in the viewer's card language (localized images
  first, see [[project_localized_cards]]). Nothing else: the browser
  handles concurrency, priorities and caching. No progress indicator.
- Nothing is preloaded when `navigator.connection.saveData` is on.
  Leaving the table clears the `src` of the images still loading.
- Card images come from the image CDN (see [[project_image_cdn]]), with
  content-addressed URLs and `Cache-Control: public, max-age=31536000,
  immutable`: once fetched, an image stays in the browser cache with no
  revalidation. `web/index.html` preconnects to
  `https://img.intothefray.xyz`. English and French images are both
  cached this way.
- The inspector (`CardSheet.svelte`) has images decoded ahead with
  `Image.decode()` (`web/src/lib/decodeImage.ts`): the first URL of the
  face a Flip turns the shown card to, at low priority, as it opens or
  shows another card; and the new side's first URL as soon as the view
  brings it, the turn holding the card edge-on for that decode, 150 ms at
  most. Only faces the view gives the viewer are decoded, never a hidden
  card's.

**Why:** a card whose image is not cached shows empty until it downloads.
The simplest, browser-native solution is preferred over
a custom queue, priority batches or a registry of failed URLs.

**How to apply:** keep the preload to plain `Image` objects; a face whose
first URL fails still falls back in `CardFace`, which may flicker once.
