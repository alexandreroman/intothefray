---
name: "Green Goblin scenarios"
description: "Risky Business and Mutagen Formula are curated; Criminal Enterprise starts in play, Goblin Thralls are manual"
type: project
---

# Green Goblin scenarios

The Green Goblin pack (`gob`) has two curated scenarios, both on stage I
in Standard and stage II in Expert, with the main scheme on its 1A face:

- Risky Business (`packs/curated/scenarios/risky_business.json`): Norman
  Osborn 02001-02003 on their Norman Osborn face, Hostile Takeover 02004
  then Corporate Acquisition 02005, and the Criminal Enterprise
  environment (02006, face 0) in play. Players place its 2 per hero
  infamy counters.
- Mutagen Formula (`packs/curated/scenarios/mutagen_formula.json`): Green
  Goblin 02014-02016, Unleashing the Mutagen 02017 then Mutagen Cloud
  02018, nothing in play. The Goblin Thralls the 1A setup engages with
  each player stay in the encounter deck: players take them by hand.

**Why:** the curated format places a fixed list of cards in the villain
row and keeps every copy of a placed card out of the encounter deck; a
card per player, engaged with that player, is beyond it. The user chose
manual Thralls over an engine extension.

**How to apply:** automating per-player engaged minions is a feature of
its own (curated field, engine setup, copy counting). See
[[project_setup_scope]].
