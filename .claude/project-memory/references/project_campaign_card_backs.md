---
name: "Campaign player cards have the player back"
description: "packgen backOf: faction campaign + player card type (ally, event, resource, support, upgrade) gets the player back"
type: project
---

# Campaign player cards have the player back

- `backOf` (`internal/packgen/build/cards.go`) gives a card of faction
  `campaign` whose type is ally, event, resource, support or upgrade the
  player back, before the set-type rule: The Market (gmw), Hydra
  Campaign (trors), the Mutant Genesis team sets, SHIELD Tech, and the
  campaign cards of Mad Titan's Shadow, Age of Apocalypse and NeXt
  Evolution. Player side schemes keep the set-type rule.
- marvelcdb files these cards under sets of type `modular`; only the
  faction tells them apart from encounter cards.

**Why:** these cards go into player decks and are printed with the
player back; a deck that lists them shows them with that back.

**How to apply:** check a new campaign box's player cards against this
rule when it is generated. See [[reference_card_sources]].
