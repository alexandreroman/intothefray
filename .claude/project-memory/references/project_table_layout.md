---
name: "Table layout"
description: "One play surface laid out in rows; owner frames; out-of-play piles reached from owner frame chips"
type: project
---

# Table layout

- The table is one play surface for everyone: one scroller (both axes),
  one zoom. Table cards, piles and the markers (first player token, active
  counter) have x, y only; hands and private views are keyed by seat
  ("pN").
- Setup lays the surface out in rows: the villain row first, then one row
  per seated player. Each row starts at the left with deck and discard,
  then the villain or identity and schemes; played cards go to the right.
- The villain row walks left to right: the classic encounter deck and its
  discard, then each stage in the scenario's order, each after the
  scenario deck it is linked to and followed by the cards in play with it,
  then the other cards in play. A scenario with several villains stays on
  this one long row (Wrecking Crew: four villain groups, Breakout last).
- A scenario deck and its discard pile take the size and spacing of the
  classic encounter piles (112×157 table units, the discard 130 right of
  its deck), in a frame of their own named after the deck. A curated deck
  marked `compact` is drawn 80×112, its discard 100 right of it: only The
  Wrecking Crew's four encounter decks, which share the villain row.
- A played card (hand key P, card box Play) lands 40 units past the last
  card or pile of its row (past the identity on a fresh row), or in the
  first hole wide enough; setup spaces the main scheme and the cards it
  puts in play with the same 40 gap from each card's width, and lays a
  villain 50 past the piles before it, rounded up to the 10-unit grid. 40
  lets two neighbouring portrait cards both be exhausted (turned 15°)
  without overlapping. A player's deck lies at x 0, its discard at 130,
  side piles 130 apart, the identity (and a classic villain) at 300, a
  classic main scheme at 460.
- The first player token (two heroes or more, see
  [[project_first_player_token]]) starts right of the first player's identity,
  or of the last card its hero's set starts in play after it (Spectrum's
  energy forms, 40 apart), 40 units past its right edge (clear of it when
  exhausted), centred on the identity's height to the grid: (460, 510) on a
  row without side piles or in-play cards. The
  active counter starts under its villain card (20 right of the card's
  left edge, 23 below it, its top at 210). A played card avoids every
  marker, so the first player's first played card lands past the token.
- On the server the villain's row is 440 units high, its cards ending at
  187: the 253 units under them hold a row of cards (157 high) with room
  around it, between the villain and the first player. A player's row is
  220 (33 units under its cards, enough for an exhausted card and the
  owner frame). The client draws the rows spread evenly over the screen's
  height (`spreadRows`, web/src/table/rows.ts), in both views: the
  villain row and two player rows fill the visible height above the
  resting hand, with the same margin between every row, a 3rd and 4th
  deck included. With a single deck, the villain row and its one player
  row fill it: the villain row is drawn as high as leaves the player row's
  220 at the bottom (270–440); a game with 2+ decks keeps the two-row
  spacing in "Villain + player" too. The pitch is computed in px at zoom
  1, so zooming never changes it; it stays within 220–440 units, and the
  villain row is drawn at least 270 high so the active counter clears the
  first player's row. Server positions never depend on a viewer's screen.
  On a tablet (touch mode outside dock mode) the villain row is always
  drawn at its full 440, its band of cards never squeezed; a window
  short of height scrolls.
- Drops snap a card's corner to the 10-unit grid (`GRID`), the dots drawn
  10 apart. On a tablet, a finger being less precise than a mouse, the
  step is 20 (`TABLET_GRID` in web/src/table/grid.ts): x on multiples of
  20, y on 10 plus multiples of 20, which keeps a dropped card in line
  with the setup's (x 300 and 460, y 30 and 470); the dots and the rows'
  drawn pitch follow that step.
- Each owner's deck and discard sit in a frame in the seat colour labelled
  with the player's name ("Villain" in purple, as in the game, for the
  encounter piles; the deck's name for a scenario deck); the frame's
  tooltip gives that player's hand count.
- Out-of-play piles (scenario areas, victory display, set-aside) are not
  drawn on the table: chips on their owner's frame open them (see
  [[project_action_bars]]); the villain's chips sit on the first villain
  frame, in that order (see [[project_scenario_areas]]).
- A portrait table card is 112×157 table units (landscape 157×112, double
  cards 157×224 and 224×157), small enough for much of the play to fit on
  screen at 100 %. The size lives in table units, on the server and the
  client alike: the gaps, the rows and the setup positions are sized from
  it, never a display scale. The hand and the preview have their own
  sizes. Everything drawn on a table card or pile (tokens, status and
  modifier tabs, count pill) is sized for that card. Tokens sit
  inside the card: damage, threat and counters pile up from its bottom
  right corner, damage in the corner; a scheme's threat sits in its top
  right corner. The owner names, out-of-play chips, the first player token
  and the active counter have sizes of their own.
- On a wide screen the history panel shows at the right; it can be
  collapsed to a slim strip that keeps Undo, remembered per viewer
  (`itf-history-collapsed`). The card preview floats over the play area at
  every width. On a narrow screen the history is hidden and a floating
  button offers Undo ("Undo last action"); in touch mode a History button
  beside it opens the history sheet (see [[project_touch_phone_table]]).
- Cards and piles act through their action menu (see
  [[project_action_bars]]).
- While the viewer has not chosen a zoom (`itf-zoom`), a window up to
  600 px wide fits its content plus one empty card slot (152 units) at its
  right (never above 100%) and wider screens show 100%, following the
  width live. The % button reads "Fit to width" at
  ≤ 600 px and "Back to 100%" (key 0) elsewhere. Minimum zoom 30% at
  ≤ 600 px wide, else 50%. Owner names and chips keep ≥ 11 px text at
  any zoom. At ≤ 600 px wide or ≤ 500 px tall, the zoom control (with
  the floating Undo when the history panel is hidden, ≤ 900 px wide)
  forms one bar at the bottom right above the resting hand, and hand
  cards are sized from the window. Dock mode (a small touch screen) has
  its own fixed zoom and no zoom control (see
  [[project_touch_phone_table]]).
- Touch screens and phones adapt this layout (see
  [[project_touch_phone_table]]).

**Why:** decided with the user: players add cards as they play, so fixed
things sit on the left and play grows right; one shared surface without
per-player zones keeps the layout simple. One long villain row keeps every
villain on the same band, as the user chose for several villains; scenario
decks read as encounter piles at full size, and only a row of several
villains with a deck each (The Wrecking Crew) needs compact decks to fit.
The user wants the decks evenly spaced on screen, so a two-deck game fits
the window; a screen-dependent spacing belongs to the client's drawing,
never to shared positions. The user wants a row of cards to fit between
the villain and the players, for every player alike.

**How to apply:** new fixed table elements go at the start of their
owner's row (server setup positions); the table has no per-player zones.
See [[project_scenario_decks]].
