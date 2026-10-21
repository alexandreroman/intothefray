---
name: "Deck load acknowledgement"
description: "setDeck is acknowledged by a deckSet message with the game version; one deck load at a time in the lobby"
type: project
---

# Deck load acknowledgement

- The server answers a successful `setDeck` with
  `{ "type": "deckSet", "version": N }`, N being the game version that
  holds the deck. The view and the `deckSet` reach the viewer in either
  order.
- Only a `deckSet` matched with a view of version N or more confirms a
  load. A change of the viewer's decks in a view confirms nothing. A
  `deckError`, the lobby error that answers the load, a reconnection or
  the session's end ends the load unconfirmed.
- The lobby runs one deck load at a time: while one is in flight, Load,
  Add a deck and every slot's Remove are blocked.

**Why:** reloading the same deck leaves the view unchanged, and a view can
come from another tab or overtake the error that answers a load, so only
the server's acknowledgement tells that a load went through. Blocking the
other lobby changes keeps the slots from remounting or shifting mid-load.

**How to apply:** close a Change form or clear a deck link only on a
confirmed load, and keep the lobby's slot changes blocked while a load is
in flight.
