---
name: "Cards set aside by a deck card"
description: "A player card's setAside in curated cards.json puts those cards on the seat's set-aside pile at setup"
type: project
---

# Cards set aside by a deck card

A player card can list, in `packs/curated/cards.json` (`setAside`, keyed by
the card's code, not a face code), the cards a deck containing it puts
aside at setup.
Specialized Training (43021) lists the four Specialist upgrades
(43034-43037). Setup puts every catalog copy of them on the seat's
set-aside pile, owned by the seat and at home in its deck, whether or not
the deck list names them; listed copies never enter the deck. Each seat with
such a card gets its own copies. The generator fails when a set-aside code
is unknown, when `setAside` sits on a face code, or when a card lists itself.

**Why:** marvelcdb deck lists often forget set-aside cards that the card
text needs ("chooses 1 set-aside SPECIALIZATION upgrade").

**How to apply:** add another such card as curated data in `cards.json`,
never as per-card code, and verify it against the card text.
