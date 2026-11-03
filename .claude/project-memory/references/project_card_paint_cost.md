---
name: "Table cards are cheap to paint"
description: "Card shadows are inset box-shadows, image corners a border radius; the surface zooms with CSS zoom"
type: project
---

# Table cards are cheap to paint

- A table card or pile casts its shadow from a `.shade` box 2px inside its
  edge, at z-index -1 under its face: a box-shadow (`--card-shadow`, each
  layer with a 2px spread) with the card's corners (`--card-radius`,
  `--card-radius-land`). The values match three stacked `drop-shadow()`s
  (Chrome takes a drop-shadow's blur as a standard deviation, half a
  box-shadow's). Table cards and piles carry no CSS `filter`.
- The shade sits inside the card's edge because a box-shadow is cut away
  inside its own box: cast from the card's box, it lets the card underneath
  show through the anti-aliased edge, a light seam where cards overlap.
- Card images (CardFace, CardBack) round their corners with `border-radius`
  (`--card-radius`), never a `clip-path`.
- The surface zooms with CSS `zoom` (`--z`): layout is a few percent of a
  zoom step's work, and every pointer to table-unit conversion, the `--lu`
  name lines and the touch hit areas rely on it.
- `contain` on cards and piles brings no measurable gain: a token change
  already relayouts little.

**Why:** on a busy table (133 cards), the drop-shadow filters drew every
card offscreen: the GPU work of hovering or dragging was about 9× higher,
of scrolling about 20× (with the clip-path corners), all with the same look
on both table themes and at every zoom.

**How to apply:** give a new table element a box-shadow or a shade, not a
filter; round card art with a border radius. Measure paint changes in the
real app (Chrome tracing: main-thread style, layout, paint, layerize, and
GPU-process work), not with `pnpm bench`, which times script only. See
[[project_view_immutable]].
