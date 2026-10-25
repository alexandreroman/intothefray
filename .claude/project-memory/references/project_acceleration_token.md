---
name: "Acceleration token"
description: "Token \"acc\": manual, stacking, menu and pill only, Fray red chip with an upward double chevron beside the threat"
type: project
---

# Acceleration token

- "acc" is a card token (`Card.Tokens`, action kind `token`), label
  "Acceleration": players put one on the main scheme when the encounter
  deck runs out, and tokens stack. Bookkeeping only: no rules effect, and
  it can go on any card in play.
- Token order: dmg, thr, gen, acc, in `tokenNames`
  (internal/game/apply.go) and `TOKENS` (web/src/table/actions.ts).
- It has no keyboard shortcut and no keys sheet entry: the "Add a token"
  submenu ("Acceleration (2)") and the − / + token pill reach it.
- Its chip is Fray red (#FF4438), brighter than damage, with an upward
  double chevron before its count. It sits beside the threat: to its left
  in a scheme's top right corner (threat in the corner), to its right in
  the middle of any other card; without threat it takes the threat's
  place.
- History, naming the card: "added 2 acceleration tokens to …", "removed
  1 acceleration token from …"; merged: "set acceleration tokens on … to
  3".

**Why:** user decision: the acceleration rule stays manual, as a token
like damage, threat and counters.

**How to apply:** see [[project_stat_modifiers]] for keeping the server
and web counter lists in step.
