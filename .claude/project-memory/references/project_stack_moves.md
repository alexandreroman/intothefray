---
name: "Moving card stacks"
description: "A stack is a chain; new cards go to its end, offset down-right, the first under a scheme centred on it; the main card moves the whole stack, a tucked card moves alone"
type: project
---

# Moving card stacks

On the table, a stack is a chain: a main card (no parent), then each tucked
card attached to the previous one. Every card has at most one card tucked
directly under it.

A card added to a stack (dropped on any card of it) attaches to the last
card of the chain, whatever card it was dropped on; the drop hint, its
outline and the history line name the stack's main card. A main card carries
its whole chain and appends it in order; a tucked card appends alone. There
is no way to insert a card in the middle of a chain.

A card from outside the table joins a stack the same way, in one action
(one undo step): a hand card or a pile's top card is played under it; the
top card of a deck dropped on a card is too. A player's main deck plays it
face down, a side deck or a non-encounter scenario deck as a plain drop
would. An encounter deck (classic or scenario) deals it face down, tucked,
to the player a deal at that spot goes to (`dealRecipient`); the history
line names the stack's main card.

Positions are automatic and the drop point is ignored: each tucked card lies
down and to the right of the previous one, `attachOffsetX` (10) right and
`attachOffsetY` (20) below, so every card stays readable. Under a main card
that shows a scheme face up (main scheme, side scheme or player side
scheme), the first tucked card is centred on it on both axes, as players lay
a card on a scheme, but never past the table's top or left edge
(coordinates stay at 0 or more); the cards after it keep the usual offset
from the card before them. The server knows each face's size and whether it
is a scheme from `Card.Shapes`, filled at setup from the catalog, and sizes a
card as the client draws it (face down: a portrait back). A flip or a stage
change of a stacked card places its stack again, Zs untouched. The client does
not predict that spot: a drop lands where it was let go and slides to the
server's layout. The chain takes fresh Zs from `NextZ` (unique, positive),
the main card on top and each card beneath the previous one, which brings
the stack to the top of the table as a move does.

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
