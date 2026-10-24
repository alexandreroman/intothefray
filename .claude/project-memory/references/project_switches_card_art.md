---
name: "Animated switches and card art thumbnails"
description: "Every switch slides its selection indicator; hero and villain thumbnails show only the card's art"
type: project
---

# Animated switches and card art thumbnails

- Every switch (a control where one option is selected) has a selection
  indicator that slides from the old option to the new one in 0.2 s, with
  no slide on first render and none under `prefers-reduced-motion`. The
  logic is the `use:selectionIndicator` action
  (`web/src/lib/selectionIndicator.ts`, styles in `styles/tokens.css`);
  pill switches use `components/Segmented.svelte`.
- Hero and villain thumbnails show only the illustration of the card:
  `components/CardArt.svelte` zooms the card image onto the art window
  (`ART_LEFT`, `ART_RIGHT`, `ART_TOP`, `ART_BOTTOM` in
  `web/src/lib/cardArt.ts`), clear of the stat column, the title bar and
  the text box.
- A villain tile the host can pick zooms its art (scale 1.07, 0.2 s
  ease-out) on hover and keyboard focus, via the `--art-zoom` custom
  property that `CardArt` reads; disabled tiles, hero thumbnails and
  `prefers-reduced-motion` get no zoom.

**Why:** user decisions, for a livelier and cleaner UI.

**How to apply:** a new switch adds a `data-indicator` child and
`use:selectionIndicator` (or uses `Segmented`); a new card thumbnail
uses `CardArt` with its box aspect.
