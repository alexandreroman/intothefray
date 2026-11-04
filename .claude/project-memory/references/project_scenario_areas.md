---
name: "Scenario out-of-play areas"
description: "Curated `areas` give a scenario shared public out-of-play piles (The Collection): star chip before the victory display"
type: project
---

# Scenario out-of-play areas

- A curated scenario's `areas` (`[{"key", "label"}]`, validated by
  packgen: keys and labels present and unique) gives it shared
  out-of-play piles, `area:<key>` of kind `scenarioArea`, owned by
  nobody, public and face up. Infiltrate the Museum declares The
  Collection.
- Any card, player or encounter, goes there by hand ("Move to"); a card
  keeps its owner and home, so Discard from the area follows
  [[project_discard_destinations]]. History names the pile by its label.
- Each area is a chip with a star icon on the villain's frame, before
  the victory display chip: areas (by label), Victory display, Set-aside
  cards. "Move to" lists the areas in the same place, before "Victory
  display". Chips take no drops, like every out-of-play chip.
- The label is curated in English and shown untranslated, as scenario
  deck and pile labels are.

**Why:** user decision: a generic curated building block rather than
per-scenario code, reusable by other boxes; the star is a generic icon
for any scenario area, listed first as the scenario's own pile.

**How to apply:** declare another shared game area as an `areas` entry;
a private or per-player area needs an extension. See
[[project_table_layout]] and [[project_action_bars]].
