---
name: "Moving card stacks"
description: "Dragging the top card moves the whole stack; dragging a tucked card detaches it"
type: project
---

# Moving card stacks

On the table, cards tucked under another card form a stack. Moving the top
card (the one the others are tucked under) moves the whole stack. Moving a
tucked card detaches it, together with anything tucked under it. Spec 5.2
states this rule (decided 2026-10-19).

**Why:** players must be able to take an attachment off its host by drag,
and still move a hero with all its upgrades in one gesture.

**How to apply:** keep the server's `move` (card plus its descendants,
parent cleared) and the client's `stackOf` in step; never make a drag on a
tucked card move its host.
