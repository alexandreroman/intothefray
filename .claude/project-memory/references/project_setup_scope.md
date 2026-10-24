---
name: "Automated setup scope"
description: "What 'Set up the table' does and what players do by hand: scheme on 1A, no opening hand draw"
type: project
---

# Automated setup scope

"Set up the table" places the villain and the main scheme on its stage
1A face, builds and shuffles the encounter deck (with each hero's
obligation), sets aside nemesis sets, puts each identity in play
(alter-ego face) and shuffles each player deck. The only scenario card
placed in play is an environment the scenario puts into play as it
starts (Criminal Enterprise, Ultron Drones, Public Support). Players do
the rest by hand: they resolve the 1A Setup text, advance the scheme to
1B and place its starting threat, place counters, draw their opening
hand and mulligan. Any other card a Setup text names (Klaw's Defense
Network, Mutagen Formula's Goblin Thralls) stays in the encounter deck.

**Why:** some heroes and cards change the opening draw, so drawing by hand
is simpler and always correct; players resolving the printed 1A Setup
keeps every scenario's setup faithful to the card text.

**How to apply:** never add an automatic opening draw; the Draw… action
covers it. A curated scenario starts its scheme on face 0 and lists only
environments in `start.inPlay`; `packs/packs_test.go` checks both.
