---
name: "Several decks per player"
description: "A player owns 1 to 4 deck slots (4 decks in all); a seat is one deck; actions carry a credited seat"
type: project
---

# Several decks per player

- A player controls 1 to 4 decks under one name and one colour; the table
  holds 4 decks in all, and mixed games (several players, any split) are
  allowed. A newcomer gets one slot and is seated only while fewer than 4
  slots exist.
- In the engine a seat is one deck: seats are numbered across players in
  order, then their slots. Areas (`pN`), card and pile owners, rows,
  obligations, nemesis sets and starting threat are all per seat.
- Each action carries the seat it is credited to: the owner of the card
  or pile touched when it is one of the player's seats, else the deck
  selected in the hand switcher. The server checks ownership.
- Undo takes back the player's last burst across all their seats. The
  player has one private view (Look at top / Search), kept at their first
  seat.
- At the table a hand switcher and the Q key pick the hand shown; labels
  read "Alex · Spider-Man" only when the player has several decks.

**Why:** decided with the user on 2026-10-19: one person can play a
multi-handed game alone or alongside friends, and per-deck rules stay
intact.

**How to apply:** per-deck logic keys on the seat; per-person logic
(names, colours, presence, undo, private view) keys on the player. The
full design is in `docs/superpowers/plans/2026-10-19-multi-deck-control.md`
(local, not committed).
