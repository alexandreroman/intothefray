---
name: "Random player name"
description: "Players are never asked for a name; a random one is generated, stored and reused"
type: project
---

# Random player name

The app never asks the player for a name. Starting or joining a game uses
the name stored in the browser (`itf-name`); when none is stored, a random
"Adjective Noun" name (e.g. "Brave Falcon") is generated, stored as
`itf-name` and reused next time. The player changes it in Options.

A player name holds at most 16 characters (code points): the server cuts
it to `maxNameRunes` in `internal/game/lobby.go`, the source of truth, and
the web app mirrors it with `MAX_NAME_LENGTH` in `web/src/lib/names.ts`
(input `maxlength`, name cut when stored and when read back).

A player name holds no emoji. Both sides strip the same runes before the
length cut: Unicode categories So, Cf and Me, variation selectors and skin
tone modifiers (`cleanName` in `lobby.go` and in `names.ts`); the Options
input drops them as the player types. A name left blank is invalid.

**Why:** typing a name before playing is friction a sandbox table does not
need.

**How to apply:** get the name through `playerName()` in
`web/src/lib/names.ts`; keep every generated name within 16 characters
(adjectives up to 7 letters, nouns up to 8) and free of Marvel character
names.
