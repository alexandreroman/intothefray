---
name: "Face-down cards"
description: "Flip toggles a single-faced table card face up and down; Play from a hidden deck lands face up, a drag face down"
type: project
---

# Face-down cards

- Flip on a single-faced table card, encounter or player-owned, toggles
  it: face up turns face down, face down turns face up, without end.
- A card with several faces turns face up on its current face when face
  down, and shows its next face when face up.
- An identity card and the card a stage shows never turn face down: a
  single-faced identity has no Flip (the server treats it as a no-op).
  Flip on the card a stage shows turns it over, never changes it: a card
  with several faces (a main scheme's 1A/1B, a villain such as Spiral)
  shows its next face, cycling, through the stage choice; a single-faced
  one (a villain stage such as Crossbones I) has no Flip. "Change
  card…" (V) sits beside it and is the way to another stage card.
- Any player may flip any card in play (the server checks no owner for a
  table card); spectators get no card actions. Exhaust stays the default
  action, face down or not.
- Out of a player's deck, or out of a side deck that does not show its
  top card (Weather, Labor, Gift), the Play command (a box tile's Play, in
  a Search or Top X box) puts a card in play face up, its history line
  naming it, tucked under a card or not. A drag and drop from such a deck,
  to the table or onto a card, lands the card face down; the player may
  flip it by hand. A card revealed on such a deck lands face up (see
  [[project_deck_reveal]]). Out of a hand, a discard pile or a face-up
  side deck (Invocation, Sense), it lands face up. Setup placement is face
  up.
- Face down, a card's code leaves every view, its owner's included, and
  every history line that named it loses its card id (`logViews`).
- A card leaving the table loses its face-down state wherever it goes:
  a hand, a deck, a discard pile, an out-of-play pile.
- History: "turned Hydra Soldier face down", "turned Hydra Soldier face
  up", "played a card face down from their deck" (with a target: "…
  under Rhino"); flipping back within one burst removes the line.

**Why:** user decision: a hidden deck keeps its cards secret until a
player chooses to show one. Play is explicit, the card played becomes
visible; a drag and drop leaves the card as it was, face down.

**How to apply:** the rules live in `turnsFaceDown` (action.go) and
`landsFaceDown` (apply.go) in internal/game, and in `canFlip`
(web/src/table/actions.ts); keep the server and the web in step. The
Play command sends `faceUp` on its play action (`playAction` in
web/src/table/boxes.ts), which `applyPlay` honours; drags send none.
`faceDownPlayEvent` (narrate.go) words a face-down play without naming
the card, and `logViews` (view.go) drops the card ids of face-down cards
from the history. See also [[project_action_bars]].
