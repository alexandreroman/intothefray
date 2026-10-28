---
name: "Hand card sizes"
description: "Raised hand cards are 80 % of the preview's card; the resting hand shows the base card at 82 %"
type: project
---

# Hand card sizes

- The raised (open) hand's cards are 80 % of the portrait card the preview
  (`.peek`) shows at the current window size, never smaller than the base
  card, and on a small screen never taller than half the window with the
  hand's padding.
- The base card defines the resting look: 185 × 259 px on a wide screen,
  140 × 196 at ≤ 900 px wide, and on a small screen a quarter of the
  window's width, 64 to 151 px, capped by half its height.
- The resting hand draws the raised cards as large as the base card at
  `HAND_REST_SCALE` (82 %), on the base card's fan, and drops them so that
  they show as tall a part as the base card dropped by its base drop
  (`handRestScale`, `restingFanPositions`, `handRestDrop` in
  `web/src/table/layout.ts`). The small-screen controls clear the strip
  `restingStrip` gives for the base card.
- The preview shows at most a 358 px wide portrait card (a 380 px frame;
  520 px for a landscape card), within 45 % of the table and the
  window's height.
- A hovered hand card pops at `scale(1.3)`; the pop and the preview's own
  size are independent of the hand.
- With two hands side by side, a raised hand spreads over 90 % of the
  hands' room (`RAISED_FAN_SHARE`), centred in it (see
  [[project_multi_deck]]).

**Why:** decided with the user: the raised hand is for
reading cards, so it follows the preview's size, while the resting hand
stays a compact strip out of the way. The preview keeps its own size
(at most a 358 px wide card) rather than growing with large screens.

**How to apply:** `previewCardWidth` mirrors `.peek`'s CSS; change both
together, and size hand changes through the base and raised cards.
