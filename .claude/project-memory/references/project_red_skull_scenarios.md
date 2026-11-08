---
name: "Rise of Red Skull scenarios"
description: "Crossbones, Absorbing Man, Taskmaster, Zola and Red Skull are curated; searches and random setups stay manual"
type: project
---

# Rise of Red Skull scenarios

- The five villains of The Rise of Red Skull (`trors`) are curated
  scenarios: Crossbones, Absorbing Man, Taskmaster, Zola and Red Skull.
  Each has a "Villain" stage (I, II, III) and a "Main scheme" stage with
  every main scheme in stage order; Standard starts on stage I, Expert on
  stage II, the main scheme on its first card, face 0. None is
  self-contained: the lobby offers the modular, Standard and Expert sets.
- Crossbones has an "Experimental Weapons" scenario deck (set
  `exper_weapon`), Red Skull a "Side-scheme" deck (the five side schemes
  of his set but The Red House, which starts in play); both are shuffled
  and are not encounter decks. The side-scheme deck has its own discard
  pile; a discarded weapon goes to the encounter discard pile, as the
  rulebook says (see [[project_discard_destinations]]). Taskmaster sets
  aside his four captive allies, Red Skull The Sleeper.
- Taskmaster's scenario requires the Hydra Patrol set (`sets` in
  `taskmaster.json`): setup shuffles it into the encounter deck, the
  lobby never offers it as a modular set, and it preselects Weapon
  Master, Cerebro's recommendation.
- Manual: Absorbing Man's random starting environment, the Hydra Patrol
  side scheme Taskmaster's Setup has players search for, Zola's Hydra
  Prison and Ultimate Bio-Servants, and bringing weapons and side schemes
  into play (see [[project_scenario_decks]]).
- Campaign mode is out of scope.

**Why:** user decision: as little automation as possible; whatever a
Setup text makes players search for stays manual, as Klaw's Defense
Network does.

**How to apply:** check further scenarios with extra decks against their
rulebook in the same way, as curated data only. See
[[project_scenario_decks]], [[project_set_setup]],
[[project_set_exclude]] and [[project_setup_scope]].
