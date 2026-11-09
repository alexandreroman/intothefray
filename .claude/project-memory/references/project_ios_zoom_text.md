---
name: "Text scales with CSS zoom on iOS"
description: "html sets text-size-adjust: none: iOS Safari's text size adjustment keeps text unzoomed under CSS zoom"
type: project
---

# Text scales with CSS zoom on iOS

- The root `html` rule (`web/src/styles/tokens.css`) sets
  `-webkit-text-size-adjust: none` and `text-size-adjust: none`.
- iOS and iPadOS Safari's text size adjustment, at `auto` (the default) or
  `100%`, keeps text at its unzoomed size under a CSS `zoom` while the boxes
  zoom: `getComputedStyle` reports the font size divided by the zoom, and the
  glyphs draw at the unzoomed size. With `none`, text follows the zoom as in
  Chrome and desktop Safari, where every value scales it.
- Every text under a CSS zoom relies on it: the table's zoom (`--z`, pinch
  zoom and the dock scale), the piles' `--scale`, the drag layer, and the
  inspector's counters, zoomed to the card's face (`CardCounters.svelte`).

**Why:** measured on an iPad (iPadOS 26.6) against Chrome and desktop
Safari 27.2: the inspector's tokens, status tabs and modifier badges, and
every table text at a zoom other than 100 %, drew a font far too small for
their chips (WebKit bugs 272339, 313905). The zoom itself stays: it keeps
cards cheap to paint (see [[project_card_paint_cost]]).

**How to apply:** keep the declarations on `html`; check text under a new
CSS zoom on a real iOS device (Web Inspector: compare the computed font size
with the declared one, or snapshot the page); see
[[project_touch_phone_table]] for the inspector.
