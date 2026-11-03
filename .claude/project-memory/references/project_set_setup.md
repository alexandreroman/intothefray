---
name: "Standard and Expert set setup"
description: "Setup-keyword cards of Standard/Expert sets start in play from sets.json; encounter set-aside cards (Dreadpool); Standard PvP and the Red Skull campaign sets are unlisted"
type: project
---

# Standard and Expert set setup

The cards of the Standard and Expert sets that carry the "Setup" keyword
start in play automatically, described in `packs/curated/sets.json`:
Formidable Foe (Standard II) on side A in Standard and side B in Expert,
Pursued by the Past (Standard III) on side A at both difficulties. Drawing
Near (Standard III obligation) is an ordinary encounter card and goes into
the encounter deck. Standard PvP (Civil War) is unlisted: the lobby does not
offer it and lobby validation rejects it. The Rise of Red Skull's campaign
sets (Hydra Campaign, Expert Campaign) and Crossbones' Experimental Weapons
deck are unlisted too: they are not modular sets.

An encounter set (modular, standard, expert or main scheme) lists in
`setAside` the cards of the set that setup puts on the encounter set-aside
pile, every copy, out of the encounter deck. Dreadpool (Deadpool pack) sets
aside 44038 to 44042: only Crisis of Infinite Deadpools (44037) goes into the
encounter deck, and it brings the rest out when revealed. The players add the
Dreadpool modular set themselves when someone plays the 'Pool aspect, once
per game: pack data carries no aspect, so no deck triggers it. Cards a source
puts in the wrong set are a separate matter (see [[project_set_exclude]]).

**Why:** these rules come from the card text (marvelcdb, 44037 for
Dreadpool); the PvP set belongs to Civil War's player-vs-player mode, which
the co-op table does not model. A scenario's own "Setup:" instructions stay
manual (see [[project_setup_scope]]).

**How to apply:** add set-level setup cards, set-aside cards or lobby
exclusions as curated data in `sets.json`, never as code, and verify each
against the card text.
