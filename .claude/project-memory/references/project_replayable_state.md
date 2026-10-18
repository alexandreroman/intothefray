---
name: "Replayable board state"
description: "Game seed at start, full action history, periodic snapshots; replayable board-state tests"
type: project
---

# Replayable board state

Every game is replayable. A seed is chosen when the game starts and all
randomness derives from it (setup and each recorded action). Every action
that changes the board state is recorded in the history, which also powers
undo. A snapshot of the board state is taken every 10 actions as a safety
net. The seed and the resolved history stay on the server: they would
reveal hidden information (deck orders).

**Why:** undo stays correct across players, and the long-term goal is a
suite of replayable board-state tests (recorded setup + actions → expected
state) that keeps the project stable.

**How to apply:** never introduce randomness or state changes outside the
recorded actions; add regression scenarios as recorded replays under
`internal/game/testdata/replays/`.
