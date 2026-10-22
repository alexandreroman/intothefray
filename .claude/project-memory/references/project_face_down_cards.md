---
name: "Single-faced cards flip face down"
description: "Flip toggles any single-faced table card face up and down; deck cards land face down when played"
type: project
---

# Single-faced cards flip face down

- Flip on a single-faced table card, encounter or player-owned, toggles
  it: face up turns face down, face down turns face up, without end.
- A card with several faces turns face up on its current face when face
  down, and shows its next face when face up.
- An identity card and the card a stage shows never turn face down: a
  single-faced identity has no Flip (the server treats it as a no-op),
  and a stage card's card choice replaces Flip.
- Any player may flip any card in play (the server checks no owner for a
  table card); spectators get no card actions. Exhaust stays the default
  action, face down or not.
- A card played out of a player's deck, or out of a side deck that does
  not show its top card (Weather, Labor, Gift), lands face down, tucked
  under a card or not; the player flips it by hand. Out of a hand, a
  discard pile or a face-up side deck (Invocation, Sense), it lands face
  up. Setup placement is face up.
- Face down, a card's code leaves every view, its owner's included, and
  every history line that named it loses its card id (`logViews`).
- A card leaving the table loses its face-down state wherever it goes:
  a hand, a deck, a discard pile, an out-of-play pile.
- History: "turned Hydra Soldier face down", "turned Hydra Soldier face
  up", "played a card face down from their deck" (with a target: "…
  under Rhino"); flipping back within one burst removes the line.

**Why:** user decision of 2026-10-22.

**How to apply:** the rules live in `turnsFaceDown` and `landsFaceDown`
(internal/game) and `canFlip` (web/src/table/actions.ts); keep the
server and the web in step. See also [[project_action_bars]].
