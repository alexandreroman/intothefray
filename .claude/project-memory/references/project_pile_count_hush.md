---
name: "Pile counts step aside during animations"
description: "A table pile's count fades out while its pile animates, back with the final count"
type: project
---

# Pile counts step aside during animations

- A table pile's count badge (`PileView.svelte`) fades out (opacity only,
  0.12 s) while an animation plays on the pile: a card flying to it or out
  of it (`fly`, `under`, `arrive`, `draw`, `drawAway`), a card entering
  the table from it (`enter`), a riffle (`shuffle`) or a top card turning
  face up (`reveal`). The viewer's own drop leaves its source pile in
  sight: its copy starts from the landed ghost, and the pile already
  counted the card out during the drag. `settle` and `move` hush nothing.
  Out-of-play chips keep their count.
- While hidden, the badge keeps the number it showed as the fade began and
  is `aria-hidden`. It fades back in with the final count once the last
  thing on the pile has ended: every view playing on it, landed or
  stopped.
- `motion.isHushed(pile)` holds it: a per-view refcount taken in
  `animate()` before the new view is drawn (`hushedPiles`), released once
  what plays on the pile settles (`playsOn`: its flights' endings,
  `#ended`, and its riffle, reveal or slide), or at once when nothing
  plays on it, a newer view takes over, or anything throws. Reduced
  motion plays only the glow, so no count hides.

**Why:** decided with the user: the badge gets in the way of the cards
flying over the pile, and a number changing as it fades out reads as a
glitch. Opacity only, to keep table piles cheap to paint (see
[[project_card_paint_cost]]).

**How to apply:** a new animation on a table pile lists the pile in
`hushedPiles` and hands what it plays to `playsOn` in `animate()` (a
flight through the local `launch`), so the count comes back when it
ends. See [[project_card_move_animations]].
