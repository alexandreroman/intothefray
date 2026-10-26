---
name: "Fear No Evil scenarios"
description: "Kingpin and the five Underlings are lobby villains; an Underling's scenario is a main scheme set picked among the modular sets"
type: project
---

# Fear No Evil scenarios

- Kingpin is a classic villain set with a curated scenario
  (`packs/curated/scenarios/kingpin.json`: Kingpin A1 standard, B1 expert,
  The King's Gambit on 1A, Public Support in play on its LOW side).
- The five Underlings (Bullseye, Electro, Hammerhead, Purple Man, Typhoid
  Mary; sets of kind `underling`) are villains of the lobby's villain list,
  each a curated scenario whose `mainSchemes` names the five main scheme
  sets.
- Art Museum Heist, The Getaway, Protection Racket, Stop The Presses! and
  The Raft Breakout are sets of kind `main_scheme` (`"mainScheme": true` in
  `packs/curated/sets.json`). The host picks exactly one in the Modular sets
  section ("+ Add a set", marked "main scheme"); it brings its recommended
  modulars, and the game does not start without it.
- Setup: every villain card of the Underling in the villain pile, the first
  (stage I, card A) on top at both difficulties; the scheme set's main
  scheme in a "Main scheme" stage on 1A, or, for a set of several main
  schemes (Protection Racket's five), all of them in the scenario's
  set-aside pile, where each player takes one; its other cards in the
  encounter deck. Typhoid Mary starts
  with Disturbed Psyche and Establish Trust in play, Stop The Presses! with
  the Daily Bugle. Players do the rest by hand: the Underling's stage,
  Typhoid Mary's random side, the Protection Racket schemes per player, the
  attachments and searches the 1A Setup texts name.

**Why:** user decision: the Underling is the villain players identify
with, and the scheme set is the scenario; stage choice and the scenarios'
special setups stay manual, as the sandbox's setup scope keeps them.

**How to apply:** another scenario played with a chosen scheme set follows
the same model (`mainSchemes` on the villain's curated scenario, the scheme
sets flagged `mainScheme`). See [[project_setup_scope]] and
[[reference_card_sources]].
