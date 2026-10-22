---
name: "Single-faced encounter cards flip face down"
description: "Flip toggles a single-faced encounter card face up and face down; other cards keep cycling faces"
type: project
---

# Single-faced encounter cards flip face down

- Flip on a single-faced encounter card (owner `NoOwner`, -1 in the web)
  toggles it: face up turns face down, face down turns face up, without
  end. Face down, its code leaves every view again.
- A card with several faces (encounter or player) turns face up on its
  current face when face down, and shows its next face when face up.
- A player's single-faced card has no Flip (the server treats it as a
  no-op). The card a stage shows has no Flip: its card choice replaces
  it, and the server never turns it face down.
- History: "turned Hydra Soldier face up", "turned Hydra Soldier face
  down"; flipping back within one burst removes the line.

**Why:** user decision of 2026-10-22: an encounter card can be turned
face down again at any time, as on a real table.

**How to apply:** the rule lives in `resolveFlip` / `turnsFaceDown`
(internal/game/action.go) and `canFlip` (web/src/table/actions.ts);
keep both in step. See also [[project_action_bars]].
