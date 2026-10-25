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
- Cerebro R2 and marvelcdb send no `Cache-Control` (only `ETag` and
  `Last-Modified`), so the browser cache relies on heuristic freshness
  (about 10% of the file's age), enough for a game. mc4db's French image
  URLs answer a placeholder with `Cache-Control: no-store`, one reason
  French is not offered (see [[project_localized_cards]]).

**Why:** a card whose image is not cached shows empty until it downloads.
The simplest, browser-native solution is preferred over
a custom queue, priority batches or a registry of failed URLs.

**How to apply:** keep the preload to plain `Image` objects; a face whose
first URL fails still falls back in `CardFace`, which may flicker once.
