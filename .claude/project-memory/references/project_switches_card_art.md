---
name: "Animated switches and card art thumbnails"
description: "Switches slide their selection indicator in 0.2 s; hero and villain thumbnails show only the card's art"
type: project
---

# Animated switches and card art thumbnails

- Every switch (a control where one option is selected) has a selection
  indicator that slides from the old option to the new one in 0.2 s, with
  no slide on first render and none under `prefers-reduced-motion`. The
  logic is the `use:selectionIndicator` action
  (`web/src/lib/selectionIndicator.ts`, styles in `styles/tokens.css`);
  pill switches use `components/Segmented.svelte`. The hero selector has
  its own switch (see [[project_hero_selector]]).
- A switch option shows no browser tap highlight on a touch screen
  (`-webkit-tap-highlight-color: transparent` on `[data-indicator] ~ button`
  in `styles/tokens.css`, and on the hero selector's entries): the sliding
  indicator is the feedback. So does a villain row of the lobby's list
  (`.vrow`), whose chosen outline and wash are the feedback. Other buttons
  keep the browser's highlight.
- Hero and villain thumbnails show only the illustration of the card:
  `components/CardArt.svelte` zooms the card image onto the art window
  (`ART_LEFT`, `ART_RIGHT`, `ART_TOP`, `ART_BOTTOM` in
  `web/src/lib/cardArt.ts`), clear of the stat column, the title bar and
  the text box.

**Why:** user decisions, for a livelier and cleaner UI.

**How to apply:** a new switch adds a `data-indicator` child and
`use:selectionIndicator` (or uses `Segmented`); a new card thumbnail
uses `CardArt` with its box aspect.
