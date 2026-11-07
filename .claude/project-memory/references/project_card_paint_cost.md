---
name: "Cards are cheap to paint"
description: "Shades not filters, moves on transforms, reads before writes, lazy frame counter, CSS zoom"
type: project
---

# Cards are cheap to paint

- A table card or pile casts its shadow from a `.shade` box 2px inside its
  edge, at z-index -1 under its face: one global `.shade` rule in
  `web/src/styles/tokens.css`, a box-shadow (`--shade-shadow`, defaulting
  to `--card-shadow`, each layer with a 2px spread) with the card's
  corners (`--card-radius`, `--card-radius-land`). The values match three
  stacked `drop-shadow()`s (Chrome takes a drop-shadow's blur as a
  standard deviation, half a box-shadow's). Table cards and piles cast no
  shadow through a CSS `filter`; only a token's small icon (the
  acceleration chevrons, `CounterGlyph.svelte`) carries one, drawn once
  into the card's layer.
- Every card that moves casts its shadow from such a shade too, never a
  filter: the hand's cards, the hand card's drag ghost, the card box's
  reorder ghost (`.tile-ghost` in `CardBox.svelte`) and the flying copies
  (their component sets `--shade-shadow` to `--held-card-shadow`, fitted
  to two stacked drop-shadows, landscape corners for a landscape card),
  and the hand sheet's carousel cards.
  A filter on a moving element is blurred again on every frame, per card.
  An element that does not itself move may carry a filter (the preview art,
  the remote cursors): it is drawn once into its moving parent's layer.
- The shade sits inside the card's edge because a box-shadow is cut away
  inside its own box: cast from the card's box, it lets the card underneath
  show through the anti-aliased edge, a light seam where cards overlap.
- What moves under the hand fan or a drag moves on transform-family
  properties, never on a layout one: a hand card takes its place on the fan
  by `transform: translateX(var(--x))` from a box in the hand's middle,
  turning and scaling about its own middle (`transform-origin:
  calc(50% + var(--x)) 50%`; its `translate` and `scale` are free for a
  card sliding into the hand), every card's drag ghost follows the
  pointer on `translate` from its layer's corner (the hand card's, the
  card box's reorder ghost, the viewer's own table ghosts, landed ones
  included, and other players' ghosts, which glide on a `translate`
  transition), and the notices and the preview follow the sliding top bar
  on `translate`. A ghost's `scale` (lift) and `rotate` (sway, or the card
  box ghost's fixed tilt) play about its own middle; an exhausted ghost
  keeps its `transform` tilt.
- Reads of the page come before writes, so that a frame lays out once: a
  view's motions measure everything they start from (origins, new places,
  own transforms, pile boxes, player colours) before any of them starts
  (`TableMotion.animate`), and a drag measures its grab before it writes to
  the drag layer, whose sway is written only while it moves.
- The page is measured at every frame only while something is drawn from
  it. The arrows' frame
  counter (`motion.frame`) ticks only while an effect reads it
  (`createSubscriber`), and the table reads it only while arrows can be
  drawn: some lie on the table, or the viewer picks one. With nothing to
  draw, the arrows read nothing of the page. What a pointer move or a frame
  writes is skipped when it equals what shows: the drop hint, the outlined
  drop target (`interaction.dropOn`), the arrow paths.
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
on both table themes and at every zoom. On a low-end Android tablet, the
hand fan and drag and drop stutter when a moving card carries a filter (the
GPU blurs it again on every frame, per card), when a move plays on a layout
property (`left`, `top`: every frame or pointer move lays the page out
again), or when a read follows a write within a frame (a forced layout).

**How to apply:** give a new table element, or a card that moves, a
box-shadow or a shade, not a filter; move it on transform-family
properties; read the page before writing to it; round card art with a
border radius. Measure paint changes in the real app (Chrome tracing:
main-thread style, layout, paint, layerize, and GPU-process work), not with
`pnpm bench`, which times script only. See [[project_view_immutable]].
