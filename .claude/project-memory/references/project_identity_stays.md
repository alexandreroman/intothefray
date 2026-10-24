---
name: "Identity card stays on the table"
description: "A player's identity card never leaves the table, like the card a villain or scheme stage shows"
type: project
---

# Identity card stays on the table

- A player's identity card (hero / alter ego, put in play at setup) never
  leaves the table: no discard, hand, deck, victory display or set-aside,
  by the action menu, a key, a drag or a group. It still moves on the
  table, exhausts, flips, takes tokens and has cards tucked under it.
- The engine marks it at setup (`Card.Identity`); one leave check covers
  identities and stage cards, and the client mirrors it with one helper
  for the menu, the keys and the drag targets.
- A hero's other identity versions (set-aside cards of an identity type,
  such as Ironheart's) are marked at setup; putting one on the table
  makes it the seat's identity and frees the previous one, which becomes
  a version in turn, in the same event (undo restores both).

**Why:** user decision: an identity, like the villain, is
never taken out of play in Marvel Champions.

**How to apply:** any new action that takes a table card away goes
through the engine's leave check; keep the client helper in step.
