---
name: "Hand card sizes"
description: "Raised hand cards are 80 % of the preview's card (65 % on a tablet); the resting hand shows the base card at 82 %"
type: project
---

# Hand card sizes

- The raised (open) hand's cards are 80 % of the portrait card the preview
  (`.peek`) shows at the current window size, 65 % on a tablet (touch mode
  outside dock mode: about 233 × 326 at 1180 × 820), never smaller than the
  base card, and on a small screen never taller than half the window with
  the hand's padding (`raisedHandCard`, its `tablet` option).
- The base card defines the resting look: 185 × 259 px on a wide screen,
  140 × 196 at ≤ 900 px wide, and on a small screen a quarter of the
  window's width, 64 to 151 px, capped by half its height.
- The resting hand draws the raised cards as large as the base card at
  `HAND_REST_SCALE` (82 %), on the base card's fan, and drops them so that
  they show as tall a part as the base card dropped by its base drop
  (140 px on a wide screen; on a small screen, and on a narrow touch
  screen, the same share of its card, `smallHandDrop`: about 70 px of the
  narrow card shows on a tablet upright, a finger's target)
  (`handRestScale`, `restingFanPositions`, `handRestDrop` in
  `web/src/table/layout.ts`). The small-screen controls clear the strip
  `restingStrip` gives for the base card.
- The preview shows at most a 358 px wide portrait card (a 380 px frame;
  520 px for a landscape card), within 45 % of the table and the
  window's height.
- Under a mouse or a pen, a hovered hand card pops at `scale(1.3)`, 31 px
  up; the pop and the preview's own size are independent of the hand.
- On a tablet, a finger hovers nothing: no hovered card pops, only the card
  selected by a tap, at `TOUCH_POP_SCALE` (1.15). It leaves its sag on the
  arc: its lowest corner rests on the hand's bottom padding line, and a
  tilted end card moves in to stay within the fan's room, so that the whole
  card shows in the window at any slot (`touchPop` in
  `web/src/table/layout.ts`).
- At every width, a raised hand's fan spreads from the hands' room's left
  edge (past the hero selector when it shows) to the table's right edge,
  over the bottom right controls (under the veil while it is raised),
  less the hand's 18 px side padding, centred in that room (see
  [[project_multi_deck]]). Its pitch is the widest that keeps the drawn
  fan, tilted end cards included, within that width, and at most the card
  less 40 px (`filledFanPositions`). Its cards shrink so that each shows
  at least a quarter of its width (`FILLED_FAN_MIN_SHOW`,
  `filledHandCard`), never below the base card. The room is what the
  table has, so a table narrowed by the history panel counts as narrow.
  The resting hand keeps to the hands' room and looks the same at every
  width.
- In dock mode the hand is not drawn as a fan: it opens from the dock as
  a carousel sheet (see [[project_touch_phone_table]]). These sizes apply
  to the fan.

**Why:** decided with the user: the raised hand is for
reading cards, so it follows the preview's size, while the resting hand
stays a compact strip out of the way. On a tablet the raised hand stays out
of the table's way, hence the smaller share, and a selected card shows
whole, hence its smaller pop placed inside the window. The preview keeps
its own size (at most a 358 px wide card) rather than growing with large
screens. On a narrow screen, room matters more than size: the user wants
the raised hand to use the screen's width and accepts smaller cards to keep
each one readable.

**How to apply:** `previewCardWidth` mirrors `.peek`'s CSS; change both
together, and size hand changes through the base and raised cards.
