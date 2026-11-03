---
name: "Moving card stacks"
description: "A stack is a chain; new cards go to its end, aligned; the main card moves the whole stack, a tucked card moves alone"
type: project
---

# Moving card stacks

On the table, a stack is a chain: a main card (no parent), then each tucked
card attached to the previous one. Every card has at most one card tucked
directly under it.

A card added to a stack (dropped on any card of it) attaches to the last
card of the chain, whatever card it was dropped on; the drop hint and the
history line name that last card. A main card carries its whole chain and appends it in
order; a tucked card appends alone. There is no way to insert a card in the
middle of a chain.

Positions are automatic and the drop point is ignored: every card of a chain
lies in the main card's column, the i-th tucked card `attachOffsetY` below
the main card, so every card stays readable. The chain takes fresh Zs from
`NextZ` (unique, positive), the main card on top and each card beneath the
previous one, which brings the stack to the top of the table as a move does.

Moving the main card moves the whole stack. Moving a tucked card takes it
alone: the chain closes (the next card attaches to the previous one) and the
cards after the gap move up. Dropping a tucked card on its own stack moves
it to the end of the chain. A tucked card leaving the table (discard, hand,
deck) also goes alone and the chain closes; the main card leaving the table
takes the whole chain, each card to its discard destination.

**Why:** players stack upgrades and attachments on a hero or a villain; a
chain keeps every card readable without hand placement, and an attachment
comes off its host by drag without disturbing the others.

**How to apply:** keep the server's "carried cards" rule (whole chain for a
main card, nothing for a tucked card) and the client's `stackOf` in step;
never make a drag on a tucked card move its host. `layOutStack`
(internal/game/apply.go) is the single place that lays out and orders a
chain; appending to a chain and closing one go through it.
