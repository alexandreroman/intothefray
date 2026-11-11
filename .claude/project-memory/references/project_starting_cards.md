---
name: "Starting cards begin in the hand"
description: "Starting-keyword cards go to their seat's hand at setup; flag derived from the English card text; players discard to opt out"
type: project
---

# Starting cards begin in the hand

Setup puts every copy of a deck's Starting cards in that seat's hand, in
deck-list order, owned by the seat and at home in its deck; the deck is
shuffled without them. Each seat's Starting cards go to its own hand. A
player who would rather start without one discards it with the usual
actions: no prompt, no option.

The Starting keyword reads "You may add this card to your hand before
drawing your starting hand": the card comes on top of the normal hand
size. Setup still draws no opening hand (see [[project_setup_scope]]).

The pack flag `starting` comes from the source data, not curated data:
packgen marks a card whose English text (marvelcdb or mc4db `real_text`,
else `text`) opens with "Starting.", past leading HTML tags. The French
text says "Départ.", hence the English text. The Starting cards are the
four Innate upgrades: Innate Reflexes (60038), Innate Aggression (61034),
Innate Perception (61036) and Innate Inspiration (61037);
`packs/packs_test.go` pins that list.

**Why:** players often forget the Starting cards in their deck; the
keyword lets them take the card before the draw, and a card in hand they
do not want costs one discard.

**How to apply:** a new Starting card needs no curated data, only
`make packs`; extend the pinned list in `packs/packs_test.go`.
