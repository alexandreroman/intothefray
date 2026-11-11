---
name: "Hero side decks"
description: "Hero extra decks are curated side decks of their own set only; Invocation own discard, Sense bottom, others none; set-aside cards"
type: project
---

# Hero side decks

A hero's fixed extra decks (marvelcdb set kind `hero_special`) are side decks,
configured in `packs/curated/sets.json` (`side`: label, top card faceup,
`discard` rule). The generator links each one to the hero of the same pack whose
set code prefixes the set code, in the printed order of the cards. Setup
shuffles them and places them after the hero's discard, with a minimum gap
before the identity. A side deck takes only the cards of its own set
(`Card.SideDeck`, set at setup). Doctor Strange's Invocation deck has its own
discard pile (`"own"`); Daredevil's Sense deck takes its discarded cards at its
bottom (`"bottom"`); Weather, Labor and Gift have the rule `"none"` (see
[[project_discard_destinations]]). The Invocation and Sense decks show their top
card faceup to everyone; the others lie facedown. Every side deck has a back of
its own (`back` in `side`), and the generator rejects a curated side deck
without one: every card of the set gets that classic back
(encounter for Gift, player for the others), captioned at the bottom with the
deck's name, since no source hosts an image of the printed one. The
cards a hero set lists in `setAside` (Iceman's Frostbite, Valkyrie's Death-Glow,
Rogue's Touched, Ironheart's other versions) go to the player's set-aside pile.
A hero set's `inPlay` (one list per difficulty, the same at both) names the
fixed cards its identity's Setup puts in play: one copy each starts face up
in the player's row, right of the identity, out of the deck however many the
deck list names (Spectrum's Gamma, Photon and Pulsar; players turn them face
down by hand). A Setup that lets the player choose stays manual: Storm picks
her starting Weather card by hand.

**Why:** the rules give a dedicated discard only to the Invocation deck;
Sense cards return under their deck (Matt Murdock), Weather supports are
swapped with a support of the player's choice and are permanent, Gift
and Labor cards never enter a deck, a discard pile or a hand. One back
for the whole deck keeps its face-down top card hidden: a card with a back
of its own would show which card lies on top. Face and placement come from
the FFG rules inserts and marvelcdb card text.

**How to apply:** add a new hero's extra deck or set-aside cards as
curated data in `sets.json`, never as per-hero code, and verify each
against the card text and the hero's rules insert.
