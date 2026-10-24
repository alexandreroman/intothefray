---
name: "Stat modifier tokens"
description: "Signed per-card modifiers on ATK, THW, DEF, SCH, REC, HP: bookkeeping only, menu and pill, no keys"
type: project
---

# Stat modifier tokens

- A card in play carries signed stat modifiers (`Card.Mods`, action kind
  `modifier`) on "atk", "thw", "def", "sch", "rec" and "hp" (hit
  points, badge "HP"), in that order: the printed stat column, then HP.
  They are bookkeeping only: no rules effect.
- A modifier is clamped to ±99 and deleted at 0; like tokens and
  statuses, modifiers are cleared when the card leaves the table.
- The card menu has an "Add a modifier" submenu (+1 per stat, a
  separator, −1 per stat) with no keyboard shortcuts; its −1 entries
  start a negative modifier.
- Each non-zero modifier shows as a badge ("+1 ATK", "−2 DEF", real
  minus U+2212), negatives in Fray red. On a portrait card the badges
  stand in a column out of the bottom-left edge, clear of the stats
  printed along the top left; on a portrait scheme, on the right edge
  between its corner tokens; on a landscape card, in a row along the
  bottom from the left corner. A column holds at most five badges (the
  room between a scheme's corner tokens, clear of a portrait card's
  printed stats): with all six, HP starts a second column beside the
  bottom badge.
- A badge opens the − / + pill, which steps the value by one and closes
  when it reaches 0, as it does for a token.
- History: "gave Rhino −2 ATK"; merged: "set the DEF modifier on Rhino to
  +2", or "cleared the DEF modifier on Rhino" at 0.

**Why:** user design: players need to record stat changes
such as a hero's +1 DEF or a villain's −1 ATK.

**How to apply:** keep `modifierNames` (internal/game/apply.go) and
`MODIFIERS` (web/src/table/actions.ts) in step; a new counter kind
mirrors every place `ActToken` and the counter target kinds are handled.
