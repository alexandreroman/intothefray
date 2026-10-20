---
name: "Identity card stays on the table"
description: "A player's identity card never leaves the table, like the card a villain or scheme stage shows"
type: project
---

# Identity card stays on the table

- A player's identity card (hero / alter ego, put in play at setup) never
  leaves the table: no discard, hand, deck, victory display or set-aside,
  by bar, key, drag or group. It still moves on the table, exhausts,
  flips, takes tokens and has cards tucked under it.
- The engine marks it at setup (`Card.Identity`); one leave check covers
  identities and stage cards, and the client mirrors it with one helper
  for the bar, the keys and the drag targets.

**Why:** user decision of 2026-10-20: an identity, like the villain, is
never taken out of play in Marvel Champions.

**How to apply:** any new action that takes a table card away goes
through the engine's leave check; keep the client helper in step.
