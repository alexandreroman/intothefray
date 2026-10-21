---
name: "Card box lists fade at their scrolling edges"
description: "Scrolling card lists fade out where more cards lie beyond an edge (scrollFade)"
type: project
---

# Card box lists fade at their scrolling edges

- The card list of every card box (`.mgrid` in `web/src/table/CardBox.svelte`)
  fades to transparent over 32px at an edge only while more cards lie beyond
  it: no fade at the top when scrolled to the top, none at the bottom when
  scrolled to the bottom, none when the list fits.
- The `{@attach scrollFade}` attachment (`web/src/lib/scrollFade.ts`) sets
  `data-scroll-fade` to the faded edges ("top", "bottom", both or none) on
  scroll, resize and child list changes; `web/src/styles/tokens.css` draws
  the fade with `mask-image` driven by `@property` lengths that transition
  (none under `prefers-reduced-motion`).
- The dragged tile and the tile context menu sit outside the list, out of the
  mask.

**Why:** user decision 2026-10-22, so cards come and go with a fade as the
list scrolls.

**How to apply:** another scrolling list that should fade its edges adds
`{@attach scrollFade}`; anything that must not fade stays outside it.
