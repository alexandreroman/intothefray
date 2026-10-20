---
name: "Fear No Evil scenarios"
description: "Kingpin is a curated scenario; the five chosen-Underling scenarios stay unsupported until the lobby can pick a villain"
type: project
---

# Fear No Evil scenarios

Fear No Evil has two kinds of scenarios. Kingpin is a classic villain
set with a curated scenario (`packs/curated/scenarios/kingpin.json`:
Kingpin A1 standard, B1 expert, The King's Gambit on 1B, Public Support in
play on its LOW side). Art Museum Heist, The Getaway, Protection Racket,
Stop The Presses! and The Raft Breakout are main scheme sets (kind
`villain`, no villain card) played with a chosen Underling villain:
Bullseye, Electro, Hammerhead, Purple Man or Typhoid Mary, whose sets have
kind `underling`. Those five scenarios are listed as unsupported, and the
underling sets are plain pack sets that the lobby does not offer.

**Why:** a chosen villain needs a lobby choice and setup rules (stages per
difficulty, Typhoid Mary's random side, Protection Racket's per-player
schemes) from the rulebook, which the engine does not model.

**How to apply:** supporting them is a feature of its own (lobby villain
choice, engine setup, curated data), checked against the Fear No Evil
rulebook. See [[reference_card_sources]].
