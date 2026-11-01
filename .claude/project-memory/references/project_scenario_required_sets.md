---
name: "Scenario required sets"
description: "Curated scenario `sets` names encounter sets its rules require besides the villain set; setup adds them, the lobby never offers them"
type: project
---

# Scenario required sets

- A curated scenario's `sets` lists the encounter sets the main scheme's
  "Contents" line requires besides the villain set and the Standard and
  Expert sets (Taskmaster: Hydra Patrol). Setup puts them in the classic
  encounter deck as it does a modular set, with their Setup-keyword cards
  in play. The lobby does not offer them as modular sets, and a game
  config naming one as a modular set is invalid.
- The modular sets the "Contents" line names come from the Cerebro
  recommendations, which the lobby preselects.

**Why:** a required set is part of the scenario, not a host choice;
Cerebro's recommendations cover only the modular sets.

**How to apply:** when adding a scenario, read its 1A "Contents" line:
required sets go in `sets`, a set the scenario uses as its own deck goes in
`decks` (Crossbones' Experimental Weapons). See
[[project_red_skull_scenarios]] and [[project_scenario_decks]].
