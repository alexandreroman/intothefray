---
name: "Scenario decks and several villains"
description: "Curated scenario decks, any number of villain stages, a movable active counter turned by hand; The Wrecking Crew uses them"
type: project
---

# Scenario decks and several villains

- A curated scenario describes its own decks (`decks` in the scenario
  file): built from sets or card lists, shuffled or in order, with or
  without a discard pile, and either an encounter deck (dealt from, boosts
  dealt from, revealed) or not. They belong to the scenario, not a seat:
  pile ids `enc:<key>` / `encd:<key>` for encounter decks, `sdeck:<key>` /
  `sdisc:<key>` for the others. A card returns to its own deck's discard.
  An encounter scenario deck replaces the classic encounter deck.
- A scenario has any number of villain and main scheme stages. A stage can
  be laid out with a scenario deck (`deck`), and an in-play card with a
  stage (`with`), so each villain sits with its deck and side scheme.
- The active counter is a movable marker, like the first player token:
  dragged by hand, animated for everyone, no history line and no Undo.
  `active` names the stage it starts under. Nothing moves it
  automatically: the rotation stays manual.
- A self-contained scenario uses only its own cards: the lobby offers no
  modular, Standard or Expert set, and setup adds no obligation and no
  nemesis set.
- The Wrecking Crew (`wrecking_crew.json`) is the first user: four
  villains, each with its own encounter deck, discard pile and side
  scheme, Breakout last, the active counter under Wrecker, self-contained.

**Why:** user decision: generic building blocks rather than a one-off
case, so that Sinister Six, Four Horsemen, Tower Defense and the
scenarios with extra decks (Crossbones, Red Skull, Thanos, M.O.D.O.K.,
Spiral, Mansion Attack, Morlock Siege, Future Past) need curated data
only, or data plus small additions. The app is a sandbox with no rules
automation; the Wrecking Crew rules insert states the setup.

**How to apply:** add a scenario with extra decks or several villains as
curated data, never as per-scenario code, checked against its rules
insert. A non-encounter scenario deck has no drag source on the table:
its first curated user may need one. See [[project_setup_scope]] and
[[project_table_layout]].
