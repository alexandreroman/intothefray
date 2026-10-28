---
name: "Several decks per player"
description: "1 to 4 deck slots per player; seat = deck; credited seat; hero selector; two hands side by side"
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
  selected in the hero selector. The server checks ownership.
- Undo takes back the player's last burst across all their seats. The
  player has one private view (Look at top / Search), kept at their first
  seat.
- At the table the hero selector (round hero avatars, bottom left) picks
  the selected deck: its hand shows and shared-card actions are credited
  to it. In "All" it lists the viewer's own decks; in "Villain + player"
  it lists every seat and shows the picked seat's row, and another
  player's seat shows their row and no hand, shared-card actions staying
  credited to the last own deck. It shows only with 2 entries or more.
  The Q key and a card dragged to an own hand select that deck; Shift +
  ← / → steps through the selector's entries, round them.
- A player with exactly 2 decks on a wide screen sees both hands side by
  side, in seat order, the same size, about 48 px apart between their
  tilted end cards, in the room between the hero selector and the bottom
  right controls (zoom, Undo). The selected deck's hand is active; the
  other is dimmed and never rises, and the pointer entering it selects
  its deck. A raised hand spreads over the whole room and the other hand
  fades out until it lowers. Each fan glows from below in its player's
  colour. With 1, 3 or 4 decks, or on a small screen, only the selected
  deck's hand shows. A card dropped on any shown hand goes to its own
  deck's hand.
- Owner frames always name the hero ("Sam · Captain Marvel"); history
  lines ("… to Alex (Spider-Man)") and box titles ("Your Spider-Man
  deck") name it only when the player has several decks.

**Why:** decided with the user: one person can play a
multi-handed game alone or alongside friends, and per-deck rules stay
intact.

**How to apply:** per-deck logic keys on the seat; per-person logic
(names, colours, presence, undo, private view) keys on the player. The
full design is in `docs/superpowers/plans/2026-10-19-multi-deck-control.md`
(local, not committed).
