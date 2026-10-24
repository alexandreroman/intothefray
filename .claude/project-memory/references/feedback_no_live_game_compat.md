---
name: "No compatibility for games in progress"
description: "Action and history changes ignore games in progress and their replay; the simplest design wins"
type: feedback
---

# No compatibility for games in progress

A change to an action, its fields or its meaning takes the simplest design.
Games in progress and their recorded histories need not keep replaying the
same way: no compatibility fields, defaults chosen for old histories, or
migration code.

**Why:** games are short-lived (24 h expiry, see [[project_constraints]]),
so keeping old histories replayable is not worth the extra code.

**How to apply:** design action changes for the code as it is, not for
histories already stored in Redis. The recorded replays under
`internal/game/testdata/replays/` are tests, not live games: update or
regenerate them alongside the change (see [[project_replayable_state]]).
