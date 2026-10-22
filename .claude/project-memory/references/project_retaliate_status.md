---
name: "Retaliate status carries a value"
description: "Status \"retaliate\": its count is the card's Retaliate X value; key R, tab \"Retaliate 2\""
type: project
---

# Retaliate status carries a value

- "retaliate" is a card status (`Card.Status`, action kind `status`)
  whose count is the card's Retaliate value X: several sources add up,
  as the keyword does in the game. Bookkeeping only: no rules effect.
- Status order: stunned, confused, tough, retaliate, locked, in
  `statusNames` (internal/game/apply.go) and both `STATUSES` lists
  (web/src/table/actions.ts, CardView.svelte).
- R on a card in play adds one, Shift + R takes one off; the keys sheet
  lists it with the other statuses. R on a pile is Reveal.
- Its teal tab always shows the value: "Retaliate 1", "Retaliate 2";
  the other statuses read "Tough", "Tough ×2".
- All five status tabs stay on the card: a portrait card's column holds
  four above the middle, the fifth starts a second column inward; a
  landscape card's row wraps downwards; a portrait scheme's left column
  holds all five.
- History: "added 1 retaliate to Rhino"; merged: "set retaliate on Rhino
  to 2".

**Why:** user decision of 2026-10-22: Retaliate is a keyword with a value
("Retaliate 1"), not a status card like Stunned or Tough.

**How to apply:** a status whose count is a value gets its own tab text
in `statusText` (CardView.svelte); see also [[project_stat_modifiers]].
