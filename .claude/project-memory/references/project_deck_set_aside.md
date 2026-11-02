---
name: "Cards set aside by a deck card"
description: "A player card's setAside in curated cards.json puts those cards on the seat's set-aside pile at setup"
type: project
---

# Cards set aside by a deck card

A player card can list, in `packs/curated/cards.json` (`setAside`, keyed by
the card's code, not a face code), the cards a deck containing it puts
aside at setup. Setup puts every catalog copy of them on the seat's
set-aside pile, owned by the seat and at home in its deck, whether or not
the deck list names them; listed copies never enter the deck. Each seat with
such a card gets its own copies. The generator fails when a set-aside code
is unknown, when `setAside` sits on a face code, or when a card lists itself.

Cards with a `setAside` list:

- Specialized Training (43021): the four Specialist upgrades (43034-43037)
- New Recruits (49020): the New allies Surge, Anole, Bling! and Indra
  (49033-49036)
- Show of Empathy (51017): Redemption (51036)
- Captain America upgrade (53023): Captain America's Shield (53034)

The last three are the Linked player cards. Under the Linked keyword, a
Linked card never goes in a deck and is set aside at the start of the game
when the card named in its parentheses is in a player's deck. The Trickster
Takeover allies (55063-55066) are linked to encounter minions, not to a
player card, so this mechanism does not cover them.

**Why:** marvelcdb deck lists often forget set-aside cards that the card
text needs ("chooses 1 set-aside SPECIALIZATION upgrade", "1 set-aside copy
of Redemption").

**How to apply:** add another such card as curated data in `cards.json`,
never as per-card code, and verify it against the card text.
