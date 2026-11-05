---
name: "Automated setup scope"
description: "What 'Set up the table' does and what players do by hand: scheme on 1A, no threat, no opening hand draw"
type: project
---

# Automated setup scope

"Set up the table" places the villains and the main scheme on their stage
1A face, builds and shuffles the encounter deck (with each hero's
obligation) and the scenario's own decks, sets aside nemesis sets, puts
each identity in play (alter-ego face) and shuffles each player deck. The
scenario cards placed in play are the environments the scenario puts into
play as it starts (Criminal Enterprise, Ultron Drones, Public Support) and
the side schemes its printed setup puts in play (the Wrecking Crew's four
signature side schemes, The Red House). Setup places no threat and no
token on any card. Players do the rest by hand: they resolve the 1A Setup
text, advance the scheme to 1B, place the starting threat of every scheme
in play, place counters, draw their opening hand and mulligan. Any other
card a Setup text names (Klaw's Defense Network, Mutagen Formula's Goblin
Thralls) stays in the encounter deck.

**Why:** some heroes and cards change the opening draw, so drawing by hand
is simpler and always correct; players resolving the printed 1A Setup
keeps every scenario's setup faithful to the card text. Placing threat is a
player action by project principle: the table is a sandbox with no rules
automation. The Wrecking Crew insert places the side schemes before play
begins.

**How to apply:** never add an automatic opening draw or automatic threat;
the Draw… and token actions cover them, and the cards' `startingThreat`
data is informational. A curated scenario starts its scheme on face 0 and
lists only environments, side schemes and attachments laid out `with` a
stage (Ronan's Universal Weapon) in `start.inPlay`; `packs/packs_test.go`
checks both. See [[project_scenario_decks]].
