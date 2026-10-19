---
name: "Random player name"
description: "Players are never asked for a name; a random one is generated, stored and reused"
type: project
---

# Random player name

The app never asks the player for a name. Starting or joining a game uses
the name stored in the browser (`itf-name`); when none is stored, a random
"Adjective Noun" name (e.g. "Brave Falcon") is generated, stored as
`itf-name` and reused next time. The player changes it in Options
(decided 2026-10-19).

**Why:** typing a name before playing is friction a sandbox table does not
need.

**How to apply:** get the name through `playerName()` in
`web/src/lib/names.ts`; keep every generated name within the server's
24-rune limit (`maxNameRunes`) and free of Marvel character names.
