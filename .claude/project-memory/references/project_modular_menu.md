---
name: "Add a set menu groups modular sets by pack"
description: "Lobby Add a set menu: modular sets under sticky pack names, release order; recommended sets in their pack"
type: project
---

# Add a set menu groups modular sets by pack

- The lobby's "+ Add a set" menu (`modularGroups` in
  `web/src/components/lobby/ScenarioPicker.svelte`) lists the addable
  modular sets under their pack's name, packs in release order
  (`index.packs`), sets in `index.sets` order inside a pack, as the villain
  list groups scenarios.
- A pack with no modular set left to add shows no group.
- Each group is a `role="group"` labelled by its pack name (`.menu .mpk`),
  a sticky heading that is not a button; the set buttons are the only
  focusable items.
- The scenario's recommended sets sit in their own pack, marked
  "★ recommended"; the menu has no group or ordering of its own for them.

**Why:** user decision: the full list is long, and the pack is how players
find a set; the star is enough to spot a recommendation.

**How to apply:** a new kind of addable set, or another long pick list in
the lobby, follows the same pack grouping and heading markup.
