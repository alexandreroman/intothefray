---
name: "Hero side decks"
description: "Hero extra decks are curated side decks; only Invocation has a discard; set-aside hero cards go to the set-aside pile"
type: project
---

# Hero side decks

A hero's fixed extra decks (marvelcdb set kind `hero_special`) are side
decks, configured in `packs/curated/sets.json` (`side`: label, top card
faceup, own discard). The generator links each one to the hero of the same
pack whose set code prefixes the set code, in the printed order of the
cards. Setup shuffles them facedown between the hero's discard and
identity. Only Doctor Strange's Invocation deck has its own discard pile
and a faceup top card. The Labor, Gift and Sense decks have a back of their
own (`back` in `side`): every card of the set gets that classic back
(player for Labor and Sense, encounter for Gift), captioned at the bottom
with the deck's name, since no source hosts an image of the printed one.
A side
card with no side discard is never discarded: Discard is not offered, and
when it is tucked under a card that leaves the table it goes to the bottom
of its side deck. A card dropped on
the lower half of its home deck goes to the bottom. The cards a hero set
lists in `setAside` (Iceman's Frostbite, Valkyrie's Death-Glow, Rogue's
Touched, Ironheart's other versions) go to the player's set-aside pile.
Storm's starting Weather card and other heroes' Setup permanents stay
manual.

**Why:** the rules give a dedicated discard only to the Invocation deck;
Sense cards return under their deck, Labors go to the victory display,
Gifts are permanent. Face and placement come from the FFG rules inserts
and marvelcdb card text.

**How to apply:** add a new hero's extra deck or set-aside cards as
curated data in `sets.json`, never as per-hero code, and verify each
against the card text and the hero's rules insert.
