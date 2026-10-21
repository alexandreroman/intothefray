---
name: "Lobby columns share one height"
description: "Side by side, the Scenario box matches the Players + Your decks column; settings slide in"
type: project
---

# Lobby columns share one height

- The lobby (`web/src/screens/Lobby.svelte`) lays out `.columns` as a grid:
  one column below a 992px window, two side by side from it (944px of
  content: 560px scenario, 24px gap, 360px players). One media query sets
  both the layout and `--villain-rows`, the row count the villain list
  reads.
- Side by side, both columns stretch to the taller one and the Scenario box
  fills its column. The villain list (`.villains` in
  `web/src/components/lobby/ScenarioPicker.svelte`) takes the room left
  (flex basis 0, scrolls) and never shows less than the first pack's name
  and one row of tiles; when that floor and the settings exceed the right
  column, the Scenario box is the taller one.
- Stacked, the host's list shows the first pack's name and two rows of
  tiles, the rest scrolls; a guest's list shows the chosen scenario whole.
- The Difficulty and Modular sets section slides open (Svelte `slide`,
  250 ms, `cubicOut`) when a first scenario is chosen, the list shrinking
  in step, and stays while the host picks others. Under
  `prefers-reduced-motion` it opens at once. Once open, the host's chosen
  tile is scrolled into view (`block: 'nearest'`); a guest's page never
  scrolls.

**Why:** user decision 2026-10-22, so both lobby columns end on one line
and choosing a scenario does not make the Scenario box jump.

**How to apply:** a change to the lobby columns keeps the single media
query as the one switch; anything new in the Scenario box above or below
the list keeps its natural height so the list absorbs the difference.
