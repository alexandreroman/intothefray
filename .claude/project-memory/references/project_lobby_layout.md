---
name: "Lobby layout"
description: "One column: Players (a seat per deck), Scenario (every villain in the page, recap), Start; no sticky bar"
type: project
---

# Lobby layout

- The lobby (`web/src/screens/Lobby.svelte`) is one column of areas, in
  order: a one-line header (`LOBBY` caption and title), **Players**,
  **Scenario**, **Start**. The page scrolls as a whole: nothing sticks to
  the window and no list scrolls on its own.
- Three width bands, window media queries at 600px and 1100px: the column
  is 100% / 860px / 1120px wide with 16 / 24 / 32px gutters, which the top
  bar follows. Every box shares one side padding per band, so a box's
  title, controls and content share their edges.
- **Players** (`Seats.svelte`): a seat is a deck, as at the table; the grid
  always shows 4 seats in 1 / 2 / 4 columns, packed densely. A player's card
  spans one column per deck, its decks side by side, the second where the
  next seat's content would start. A card shows the player's colour (left
  band in one column, top band otherwise), the name, `Online` / `Offline`
  (`PlayerView.online`; a dot on a phone), `you` and `host`, then each
  deck's hero and deck names or `Waiting for a deck`. The viewer's slots
  are `DeckLoader`s that `Lobby.svelte` passes as the `ownSlot` snippet.
  Free seats are dashed cards (`Take this seat` for a spectator). The box
  header holds `Copy invite link`; a refused clipboard shows the link in a
  selected read-only field.
- Card actions are icon buttons with tooltips: `Add a deck` (plus),
  `Take {name} off this seat` (user-minus), `Leave your seat` (leave),
  `Change deck` (pencil), `Remove deck` (trash). The cross icon closes
  things only (the top bar's Close the lobby, dialogs, a set chip's remove).
- **Scenario**, host (`ScenarioPicker.svelte`): the `Villain` filter, then
  the scenarios as compact rows (40×30 art icon, name), grouped by pack in
  release order, packs in 2 / 3 / 4 CSS columns, never split. The list
  opens on whole packs up to 16 scenarios (`FOLDED_MIN_SCENARIOS`) plus the
  chosen scenario's pack; `Show all villains (N more)` unfolds it for the
  rest of the visit and goes away; a filter query searches every scenario.
  The chosen row is outlined in signal blue with a check; an unsupported one
  is greyed, `aria-disabled`, tip `Not supported yet`. Under the list, once
  a scenario is chosen, the recap: art 120×90, name and pack, Difficulty and
  Modular sets (side by side from 1100px). Every settings control is `--ctl`
  (34px) tall.
- **Scenario**, guest or spectator: no box until the host has chosen; then
  the box shows the recap read only (difficulty as a chip). On a phone its
  two settings sit in the art's and the name's columns (subgrid).
- The host's recap and a guest's box slide open on the first choice
  (Svelte `slide`, 250 ms, `cubicOut`; at once under reduced motion) and
  stay while the host picks others; a viewer who arrives with a scenario
  chosen sees it at once.
- **Start**: a box at the end of the column with the readiness line and,
  for the host, `Set up the table` (full width on a phone).

**Why:** user decisions: the players come first so their connection
shows at a glance; the host picks the villain in the page rather than in a
dialog or a scrolling box, from a short list that opens in full on demand;
the page works the same on phones, tablets and desktops; what does not
apply yet does not show.

**How to apply:** a new lobby setting goes in the recap and uses `--ctl`
controls; a new lobby box uses the shared box padding; a new seat action is
an icon button with a `data-tip`, never a cross. See [[project_multi_deck]],
[[project_modular_menu]] and [[project_truncated_text]].
