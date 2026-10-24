---
name: "Revealed card is its deck's top card"
description: "Reveal on the encounter deck, own decks and face-down side decks; a revealed card counts as its deck's top card"
type: project
---

# Revealed card is its deck's top card

- Reveal puts a deck's top card face up on the table, lying on that deck
  (`OnPile`), visible to all. It exists on the encounter deck (default
  action, `reveal` names no pile), on a player's own deck and on an own
  side deck that hides its top card (Labor, Gift, Weather): there it
  sends `pile`, comes right after Draw X, and Draw 1 stays the default.
  A side deck showing its top card (Invocation, Sense) has no Reveal.
- Only the deck's owner reveals a player deck; one revealed card per deck
  at a time.
- On every deck, the encounter deck included, a revealed card counts
  strictly as the deck's top card for every deck action: Draw 1 / X,
  Discard 1 / X, Deal, Top X, Search, Shuffle (and shuffles into the
  deck), playing the top, putting a card on top, every count limit and
  the menu header's count.
- Played as the deck's top (a deck-top play, or Play from a Search box),
  the revealed card lands face up and its history line names it; every
  other card played from a hidden deck lands face down.
- A Top X reorder of a deck with a revealed card takes that card back
  into the deck, face down, wherever the reorder puts it. Such a reorder
  is a tracked, undoable action with a line ("put X back into their
  deck") and gives the reordered cards new ids, as a shuffle does, so
  nobody can follow the revealed card into the deck. A reorder with no
  revealed card only arranges the deck: no line, no undo, same ids.
- A revealed card is not in play: it is neither exhausted (Ready all
  leaves it out) nor given tokens, statuses or modifiers; the server
  refuses those actions on it (`inPlayCard`), and its menu has no
  Exhaust and no token, status or modifier submenus, their keys doing
  nothing on it. Its menu keeps Flip, Discard, Move to and the arrow.
- On a player's own deck or side deck, the revealed card's menu starts
  with Draw (W, default): a draw of 1 from that deck (`pile` = its deck),
  which takes the revealed card. Other players, and a card revealed on
  the encounter deck, get no Draw.
- A Flip that turns a revealed card face down puts it back on top of its
  deck ("put X back on top of their deck"); a flip to another face keeps
  it revealed.
- History: "revealed Rhino" on the encounter deck; "revealed X from their
  deck" / "… from their Labor deck" on a player's deck.

**Why:** user decision: a revealed card stands for its deck's top card,
so every deck action treats it as such.

**How to apply:** one generic rule in internal/game: `coveredFor`
(apply.go) puts the revealed cards back on top of the deck an action acts
on (`actedDeck`), in a copy of the table, for both resolve
(`resolveOnTable`) and apply; views and a deck-top play use `deckCards`,
and `applyPlay` plays a revealed card as it lies. `resolveReorderTop`
records the renames of a reorder that takes a revealed card back. On the
web, `deckCount` (actions.ts) counts the revealed card in count limits and
in the pile menu header. See also [[project_face_down_cards]] and
[[project_action_bars]].
