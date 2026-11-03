---
name: "First player token needs two heroes"
description: "A one-hero game has no first player token; the count is of seats (decks), not players"
type: project
---

# First player token needs two heroes

- The first player token exists only in a game with two heroes or more.
  A game with exactly one seat (one deck) has none: the table state holds
  no position for it (`Table.FirstPlayer` is nil), the view omits
  `firstPlayer`, the table draws no token, no tooltip, no drag target,
  and a played card has no token to avoid.
- The count is of seats, not players: one player holding two decks has a
  first player token (see [[project_multi_deck]]).
- Setup places the token beside the first seat's identity (see
  [[project_table_layout]]); a marker move naming it in a one-hero game
  is invalid, like the active counter in a scenario without one.

**Why:** decided with the user: with a single hero the first player never
changes, so the token is clutter.

**How to apply:** treat `firstPlayer` as optional everywhere, like the
active counter (`markerPoint`, `MARKERS`).
