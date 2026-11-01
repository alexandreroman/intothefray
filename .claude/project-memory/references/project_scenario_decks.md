---
name: "Scenario decks and several villains"
description: "Curated scenario decks kept apart from the classic encounter deck, several villain stages, a manual active counter; Wrecking Crew, Crossbones, Red Skull"
type: project
---

# Scenario decks and several villains

- A curated scenario describes its own decks (`decks` in the scenario
  file): built from sets or card lists, shuffled or in order, with a
  `discard` rule (see [[project_discard_destinations]]), and either an
  encounter deck (dealt from, boosts dealt from, revealed) or not. They
  belong to the scenario, not a seat: pile ids `enc:<key>` / `encd:<key>`
  for encounter decks, `sdeck:<key>` / `sdisc:<key>` for the others. An
  encounter scenario deck replaces the classic encounter deck.
- A non-encounter scenario deck belongs to nobody: any player drags it. The drag
  plays its top card face up where it lands, tucked under the card it is dropped
  on (one action, as a side deck's top): a play naming the `sdeck:` pile.
  Dropped on the pile its cards are discarded to, it discards the top card;
  dropped back on the deck, it does nothing; no hand takes it. The dragging
  player sees the card's back until it lands and turns over; the others see the
  back travel with the drag, then the card enter from the deck and turn over.
- A card revealed on a scenario deck lies over it: a press there drags
  that card, which moves or attaches as any table card does.
- A scenario has any number of villain and main scheme stages. A stage can
  be laid out with a scenario deck (`deck`), and an in-play card with a
  stage (`with`), so each villain sits with its deck and side scheme.
- The active counter is a movable marker, like the first player token:
  dragged by hand, animated for everyone, no history line and no Undo.
  `active` names the stage it starts under. Nothing moves it
  automatically: the rotation stays manual.
- The cards a scenario deck takes (its sets' cards and its listed cards)
  stay out of the classic encounter deck, so a villain-set card a deck
  lists exists once, in that deck.
- A self-contained scenario uses only its own cards: the lobby offers no
  modular, Standard or Expert set, and setup adds no obligation and no
  nemesis set.
- The Wrecking Crew (`wrecking_crew.json`) is the first user: four
  villains, each with its own encounter deck, discard pile and side
  scheme, Breakout last, the active counter under Wrecker, self-contained.
  Crossbones and Red Skull use non-encounter decks next to the classic
  encounter deck (see [[project_red_skull_scenarios]]).

**Why:** user decision: generic building blocks rather than a one-off
case, so that Sinister Six, Four Horsemen, Tower Defense and the
scenarios with extra decks (Crossbones, Red Skull, Thanos, M.O.D.O.K.,
Spiral, Mansion Attack, Morlock Siege, Future Past) need curated data
only, or data plus small additions. The app is a sandbox with no rules
automation; the Wrecking Crew rules insert states the setup.

**How to apply:** add a scenario with extra decks or several villains as
curated data, never as per-scenario code, checked against its rules
insert. See [[project_setup_scope]] and
[[project_table_layout]]; stage changes follow
[[project_stage_carry_over]].
