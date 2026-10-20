---
name: "Spectators have no stage button"
description: "Spectators get no action on the villain and main scheme cards"
type: project
---

# Spectators have no stage button

Spectators get no action menu on the villain and main scheme cards: the
"Change card…" box opens for players only, and always offers the choice.

**Why:** product decision for the spectator view.

**How to apply:** keep `spectatorActions` returning nothing for cards in
play; the stage box needs no read-only variant.
