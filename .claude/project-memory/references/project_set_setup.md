---
name: "Standard and Expert set setup"
description: "Setup-keyword cards of Standard/Expert sets start in play from curated sets.json; Standard PvP is unlisted"
type: project
---

# Standard and Expert set setup

The cards of the Standard and Expert sets that carry the "Setup" keyword
start in play automatically, described in `packs/curated/sets.json`:
Formidable Foe (Standard II) on side A in Standard and side B in Expert,
Pursued by the Past (Standard III) on side A at both difficulties. Drawing
Near (Standard III obligation) is an ordinary encounter card and goes into
the encounter deck. Standard PvP (Civil War) is unlisted: the lobby does not
offer it and lobby validation rejects it.

**Why:** these rules come from the card text (marvelcdb); the PvP set
belongs to Civil War's player-vs-player mode, which the co-op table does not
model. A scenario's own "Setup:" instructions stay manual (see
`project_setup_scope.md`).

**How to apply:** add set-level setup cards or lobby exclusions as curated
data in `sets.json`, never as code, and verify each against the card text.
