---
name: "Moving card stacks"
description: "Dragging the top card moves the whole stack; dragging a tucked card detaches it"
type: project
---

# Moving card stacks

On the table, cards tucked under another card form a stack. Moving the top
card (the one the others are tucked under) moves the whole stack. Moving a
tucked card detaches it, together with anything tucked under it. Spec 5.2
states this rule.

A card tucked under another by a drag lies where it was dropped (grid
snapped, behind its host, `placed` on attach and play); the fixed tucked
offset applies only to tucks without a drop point.

A newly tucked card (with what it carries) goes beneath the host's whole
stack: the host and every card tucked under it, directly or not. It takes
the lowest Z of that stack; without a drop point it lies in the host's
column, 20 below the lowest card of that stack, so every card stays
readable. A tuck gives the host's whole tree fresh Zs from `NextZ` (unique,
positive) in stacking order, which brings it to the top of the table as a
move does.

**Why:** players must be able to take an attachment off its host by drag,
and still move a hero with all its upgrades in one gesture.

**How to apply:** keep the server's `move` (card plus its descendants,
parent cleared) and the client's `stackOf` in step; never make a drag on a
tucked card move its host. `tuckUnder` and `restack`
(internal/game/apply.go) are the single place that orders a stack's Zs.
