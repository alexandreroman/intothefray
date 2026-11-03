---
name: "Villains from another set"
description: "sets.json `villains` gives a villain set without villain card the villains of other sets: lobby image, no own entry"
type: project
---

# Villains from another set

- A curated set's `villains` (`packs/curated/sets.json`) names the villain
  sets whose villains its scenario uses, for a villain set that holds no
  villain card. Morlock Siege and On the Run (NeXt Evolution) name
  `marauders`, the seven Marauders 40070–40076.
- The named sets get no lobby scenario entry; the scenario takes its image
  from their lowest-code villain card (Arclight 40070).
- The field leaves the scenario unsupported: it adds no setup, and the
  lobby lists it as not playable.
- The generator fails when the set naming villains is not a villain,
  leader or underling set (a `mainScheme` set included), or when a named
  set is unknown, of another kind, or the set itself.

**Why:** a curated scenario file with `covers` would make the scenario
playable, and those scenarios have no curated setup.

**How to apply:** use `villains` for an unplayable scenario whose
villains live in another set; write a scenario file with `covers` once
its setup is curated. See [[project_set_setup]] and
[[project_scenario_decks]].
