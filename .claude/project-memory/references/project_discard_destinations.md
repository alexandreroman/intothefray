---
name: "Discard destinations"
description: "A discarded card goes to its owner's discard pile unless its side or scenario deck declares \"own\" or \"none\""
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
  - `"none"`: its cards are never discarded; Discard is not offered, and
    a card of it tucked under a card leaving the table goes to the bottom
    of its deck (Storm's Weather, Daredevil's Sense, Hercules' Labor and
    Gift).
  - no rule: the owner's discard pile (Crossbones' Experimental Weapons:
    a weapon goes to the encounter discard pile, and Shuffle back of that
    pile takes it into the encounter deck).
- Discard 1/X from a deck follows the same rule.
- A card keeps its home wherever it is discarded: Top of deck returns a
  weapon to the Experimental Weapons deck.
- A scenario with its own encounter decks has no classic encounter discard
  pile, so each of its decks states `"own"` or `"none"` (checked by the
  pack generator).

**Why:** user decision: one default rule with declared exceptions, each
exception backed by the official rules: The Rise of Red Skull rulebook
(weapons in play are part of the encounter deck; the side-scheme deck has
its own discard pile), the Storm insert (Weather supports are Permanent,
only swapped with the Weather deck), the Hercules insert (Gift and Labor
cards never enter a deck, a discard pile or a hand), Matt Murdock (a Sense
upgrade leaving play goes to the bottom of the Sense deck).

**How to apply:** give a new side deck or scenario deck a `discard` rule
only when its rules name a destination other than the owner's discard
pile, as curated data. In code, each side and scenario deck pile records
its destination (`Pile.Discard`, set at setup, empty for "none"), read by
`discardPileID` and `discardOf` (internal/game/apply.go) and mirrored by
`deckDiscardOf` / `discardPileOf` (web/src/table/actions.ts). See
[[project_hero_side_decks]], [[project_scenario_decks]] and
[[project_red_skull_scenarios]].
