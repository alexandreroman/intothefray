---
name: "Table layout"
description: "One play surface laid out in rows; owner frames; out-of-play piles reached from owner frame chips"
type: project
---

# Table layout

- The table is one play surface for everyone: one scroller (both axes),
  one zoom. Table cards, piles and the first player token have x, y only;
  hands and private views are keyed by seat ("pN").
- Setup lays the surface out in rows: the villain row first, then one row
  per seated player. Each row starts at the left with deck and discard,
  then the villain or identity and schemes; played cards go to the right.
- The villain's row is taller (470 units, player rows 330): about 1.2
  portrait card heights (244 units, rows on the 10-unit grid) lie empty
  between its cards and the first player's row, so the two read apart.
- Each owner's deck and discard sit in a frame in the seat colour labelled
  with the player's name ("Villain" in purple, as in the game, for the
  encounter piles); the frame's tooltip gives that player's hand count.
- Out-of-play piles (victory display, set-aside) are not drawn on the
  table: chips on their owner's frame open them (see "Action bar
  organisation").
- A portrait table card is 140×196 table units, chosen for readability;
  the hand and the preview have their own sizes. Tokens sit inside the
  card: damage and counters on its lower part, threat on its right side.
- On a wide screen the history panel shows at the right; it can be
  collapsed to a slim strip that keeps Undo, remembered per viewer
  (`itf-history-collapsed`). On a narrow screen the preview is an overlay,
  the history is hidden and a floating button offers Undo ("Undo last
  action").
- Cards and piles act through their action menu (see "Action menu
  organisation").

**Why:** decided with the user on 2026-10-19: players add cards as they
play, so fixed things sit on the left and play grows right; zones and
their splits added complexity without value.

**How to apply:** new fixed table elements go at the start of their
owner's row (server setup positions); never reintroduce per-player zones.
