---
name: "Discard destinations"
description: "A card goes to its home deck's discard: owner's pile, or \"own\" / \"bottom\" / \"none\"; side decks take only their own cards"
type: project
---

# Discard destinations

- A discarded card goes to its owner's discard pile: the encounter discard
  pile for a card owned by nobody, the player's discard pile for a player
  card. A side deck or a scenario deck departs from that only through its
  curated `discard` rule:
  - `"own"`: the deck has its own discard pile (Doctor Strange's
    Invocation, Red Skull's side-scheme deck, each Wrecking Crew encounter
    deck).
  - `"bottom"`: a discarded card goes to the bottom of its deck
    (Daredevil's Sense). Discard is offered (X, Backspace), and a card of
    it tucked under a card leaving the table goes to the bottom of its deck
    too.
  - `"none"`: its cards are never discarded; Discard is not offered, and
    a card of it tucked under a card leaving the table goes to the bottom
    of its deck (Storm's Weather, Hercules' Labor and Gift).
  - no rule: the owner's discard pile (Crossbones' Experimental Weapons:
    a weapon goes to the encounter discard pile, and Shuffle back of that
    pile takes it into the encounter deck).
- Discard 1/X from a deck follows the same rule: on a `"bottom"` deck it
  moves the top cards under the deck, one after another.
- A card keeps its home wherever it is discarded: Top of deck returns a
  weapon to the Experimental Weapons deck.
- A card's home is the deck it was last put into. A hero side deck takes
  only the cards of its own set (`Card.SideDeck`, set at setup), wherever
  they have been: a Sense card shuffled into the player's deck may return
  to the Sense deck, a player card of another set never enters it. Every
  other deck (a player's deck, the encounter deck, a scenario deck) takes
  any card of its owner: a player's cards go to that player's decks, cards
  owned by nobody to the encounter and scenario decks. A drag onto the deck
  puts the card on top (`toDeck` with `pile`), a Sense card included; the
  deck becomes its home, so its discard follows that deck's rule: a modular
  side scheme shuffled into Red Skull's side-scheme deck is discarded to
  that deck's discard pile. A deck other than the card's home takes a drop
  only right over it, and a card lying on it (a revealed card) takes the
  drop instead; the home deck takes a drop near it too, except a deck's own
  top card, which returns only when dropped right over the deck (see
  [[project_action_bars]]).
- A scenario with its own encounter decks has no classic encounter discard
  pile, so each of its decks states `"own"` or `"none"` (checked by the
  pack generator). `"bottom"` is a side deck rule only; the generator
  rejects it on a scenario deck.

**Why:** user decision: one default rule with declared exceptions, each
exception backed by the official rules: The Rise of Red Skull rulebook
(weapons in play are part of the encounter deck; the side-scheme deck has
its own discard pile), the Storm insert (Weather supports are Permanent,
only swapped with a support of the player's choice from the Weather deck),
the Hercules insert (Gift and Labor cards never enter a deck, a discard
pile or a hand), Matt Murdock (a Sense upgrade leaving play goes to the
bottom of the Sense deck). A side deck holds the cards of one set only, as
at a real table.

**How to apply:** give a new side deck or scenario deck a `discard` rule
only when its rules name a destination other than the owner's discard
pile, as curated data. In code, each side and scenario deck pile records
its destination (`Pile.Discard`, set at setup: its own id for "bottom",
empty for "none"), read by `discardPileID`, `discardOf` and `discardTo`
(internal/game/apply.go) and mirrored by `deckDiscardOf` / `discardPileOf`
(web/src/table/actions.ts). `checkTakes` (apply.go) and `deckTakes`
(actions.ts) hold the side deck rule. See [[project_hero_side_decks]],
[[project_scenario_decks]] and [[project_red_skull_scenarios]].
