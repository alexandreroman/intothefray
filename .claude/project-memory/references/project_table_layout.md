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
- A scenario deck and its discard pile are drawn smaller (100×140 table
  units, the discard 120 right of its deck), in a frame of their own named
  after the deck.
- A played card (hand key P, card box Play) lands 50 units past the last
  card or pile of its row (past the identity on a fresh row), or in the
  first hole wide enough; setup spaces the villain, the main scheme and the
  cards it puts in play with the same 50 gap from each card's width. 50
  lets two neighbouring portrait cards both be exhausted (turned 15°)
  without overlapping.
- The first player token starts right of the first player's identity,
  50 units past its right edge (clear of it when exhausted), centred on
  its height to the grid: (550, 560) on a row without side piles. The
  active counter starts under its villain card (40 right of the card's
  left edge, 24 below it). A played card avoids every marker, so the first
  player's first played card lands past the token.
- On the server the villain's row is 470 units high and a player's row
  270 (44 units under its cards, enough for an exhausted card and the
  owner frame). The client draws the rows spread evenly over the screen's
  height (`spreadRows`, web/src/table/rows.ts), in both views: the
  villain row and two player rows fill the visible height above the
  resting hand, with the same margin between every row, a 3rd and 4th
  deck included. The pitch is computed in px at zoom 1, so zooming never
  changes it; it stays within 270–470 units, and the villain row is drawn
  at least 310 high so the active counter clears the first player's row.
  Server positions never depend on a viewer's screen.
- Each owner's deck and discard sit in a frame in the seat colour labelled
  with the player's name ("Villain" in purple, as in the game, for the
  encounter piles; the deck's name for a scenario deck); the frame's
  tooltip gives that player's hand count.
- Out-of-play piles (victory display, set-aside) are not drawn on the
  table: chips on their owner's frame open them (see
  [[project_action_bars]]); the villain's chips sit on the first villain
  frame.
- A portrait table card is 140×196 table units, chosen for readability;
  the hand and the preview have their own sizes. Tokens sit inside the
  card: damage, threat and counters pile up from its bottom right corner,
  damage in the corner; a scheme's threat sits in its top right corner.
- On a wide screen the history panel shows at the right; it can be
  collapsed to a slim strip that keeps Undo, remembered per viewer
  (`itf-history-collapsed`). The card preview floats over the play area at
  every width. On a narrow screen the history is hidden and a floating
  button offers Undo ("Undo last action").
- Cards and piles act through their action menu (see
  [[project_action_bars]]).
- While the viewer has not chosen a zoom (`itf-zoom`), screens ≤ 600 px
  wide fit the content width (never above 100%) and wider screens show
  100%, following the width live. The % button reads "Fit to width" at
  ≤ 600 px and "Back to 100%" (key 0) elsewhere. Minimum zoom 30% at
  ≤ 600 px wide, else 50%. Owner names and chips keep ≥ 11 px text at
  any zoom. At ≤ 600 px wide or ≤ 500 px tall, Undo and the zoom control
  form one bar at the bottom right above the resting hand, and hand cards
  are sized from the window.
- Touch mode (no hover, coarse pointer) shows no card preview and no
  keyboard-shortcuts button; bar buttons are 44 px.

**Why:** decided with the user: players add cards as they play, so fixed
things sit on the left and play grows right; one shared surface without
per-player zones keeps the layout simple. One long villain row with
smaller scenario decks keeps every villain on the same band, as the user
chose for several villains. The user wants the decks evenly spaced on
screen, so a two-deck game fits the window; a screen-dependent spacing
belongs to the client's drawing, never to shared positions.

**How to apply:** new fixed table elements go at the start of their
owner's row (server setup positions); the table has no per-player zones.
See [[project_scenario_decks]].
