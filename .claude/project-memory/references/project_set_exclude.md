---
name: "Cards excluded from a set"
description: "sets.json `exclude` takes a card a source misfiles out of its set; the card stays in the pack as a set-less card"
type: project
---

# Cards excluded from a set

- A curated set's `exclude` (`packs/curated/sets.json`) lists cards a
  source puts in the wrong set. The generated set leaves them out; the
  pack keeps each such card, with no set and the back a set-less card of
  its faction has, so a deck that names it still loads.
- The generator fails when an excluded card is not in the set in the
  source data (marvelcdb, completed by mc4db).
- Taskmaster's set excludes 10098, marvelcdb's player-side copy of the
  captive ally Shang-Chi 04098: the box holds one Shang-Chi, the encounter
  card 04098.

**Why:** marvelcdb lists 10098 in the Taskmaster set, which would put a
fifth captive ally in the scenario; the user chose a curated exclusion
over setting the duplicate aside with the others.

**How to apply:** fix a source's set membership with `exclude`, never by
editing `packs/dist/`; check the box contents first. See
[[project_set_setup]] and [[project_red_skull_scenarios]].
