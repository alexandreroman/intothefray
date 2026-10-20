---
name: "Moving several cards as a group"
description: "Rubber band selects table cards; a group only moves; one atomic group action"
type: project
---

# Moving several cards as a group

- Selection is a rubber band: a drag on an empty table spot (mouse or pen,
  players only) selects the free table cards it touches. Touch keeps
  native scrolling. Esc, a click on an empty spot, or a press on an
  unselected card, a pile, a hand card or the token clears the selection;
  it only holds cards drawn on the table.
- A group only moves: dragging a selected card carries every selected
  unit, relative positions intact, each stack following its top card
  (see "Moving card stacks"). It drops on the table (no tuck over a card),
  onto a pile valid for every card, or into the hand when every card is
  the player's own. The action bar and keys act on one card.
- The engine has one atomic `group` action: 2 to 99 sub-actions of one
  kind among move, toHand, toDeck (top or bottom), discard and toPile,
  all or nothing. It is one event, one undo step and one history line
  ("discarded 3 cards (…)"). A group of moves is arranging (no line, no
  undo), like a single move.

**Why:** decided with the user on 2026-10-20: moving a hero's play area
or a batch of cards in one gesture, without bulk actions to learn.

**How to apply:** keep the client's `groupAction` and the server's
`resolveGroup` in step; new group-capable kinds need both, a history
line and a replay test. The design is in
`docs/superpowers/plans/2026-10-20-multi-card-select.md` (local, not
committed).
