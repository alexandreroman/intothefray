---
name: "Lobby layout"
description: "One column: Players (a seat per deck), Scenario (villains in the page, recap), Start; no sticky bar"
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
  always shows 4 seats, two to a row at most: 1 column on a phone, 2 from 600px,
  where a card with several decks takes the whole row, its decks two to a row,
  the second where the next seat's content would start. The viewer's card is
  first and never moves, so their deck slots stay put; then the other players in
  seat order, then free seats. A hole at the end of a row is filled by free
  seats, then by the first later card that fits; else it stays (`layOutSeats`,
  `lib/seatLayout.ts`). A card shows the player's colour (left band in one
  column, top band otherwise), the name and, on the same line, lowercase
  capsules: `you`, `host`, `online` / `offline` (`PlayerView.online`, with its
  dot; only the dot on a narrow phone line), then each deck's hero and deck
  names or `Waiting for a deck`. The viewer's slots are `DeckLoader`s that
  `Lobby.svelte` passes as the `ownSlot` snippet. A slot is one 44px line in
  every state (empty, loading, loaded, changing), so nothing under it moves: the
  field (its label visually hidden, the deck number in the placeholder), the
  square `Load` button (arrow-right icon, a spinner while loading), then
  `Cancel` (undo icon) while changing or the trash on an empty slot of several;
  loaded, the hero line. Only an error adds lines. Free seats are dashed cards
  (`Take this seat` for a spectator). The box header holds `Copy invite link`; a
  refused clipboard shows the link in a selected read-only field.
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
  a scenario is chosen, the recap on two rows: the villain header (art
  120×90, 88×66 on a phone; name and pack beside it, one line each), then,
  under a rule, Difficulty | Modular sets in two equal columns split by a
  vertical rule, so neither resizes as its content changes; their labels and
  first controls sit level. On a phone the host's two settings stack. Every
  settings control is `--ctl` (34px) tall. The host's Difficulty column
  holds the switch, then the set dropdowns stacked in an inner column; in a
  column under 282px wide the dropdowns go under the switch. `Show all
  villains` is centred from 600px, full width on a phone.
- **Scenario**, guest or spectator: no box until the host has chosen; then
  the box shows the recap read only (difficulty as a chip), its two
  settings side by side at every width.
- The host's recap and a guest's box slide open on the first choice
  (Svelte `slide`, 250 ms, `cubicOut`; at once under reduced motion) and
  stay while the host picks others; a viewer who arrives with a scenario
  chosen sees it at once.
- Every later change of the lobby animates, 200 to 250 ms with `cubicOut`,
  instant under reduced motion (`motionMs`) and never as the lobby first
  shows (Svelte's local transitions): a seat card pops in or out (scale
  from 0.96 and fade) while the others glide (`glide` in `lib/motion.ts`,
  a translate-only flip, so a card that changes span never stretches); a
  deck slot unfolds or folds alone, the slots keyed by `lib/slotKeys`
  rather than by index; a slot's form and loaded deck cross-fade in place;
  a set chip pops in or out and the others glide; the packs `Show all
  villains` brings fade in, while a filter shows packs at once.
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
