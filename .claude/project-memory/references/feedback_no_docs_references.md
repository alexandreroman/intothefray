---
name: "Memory notes cite no local specs or plans"
description: "Notes never point to design specs or plans under docs/; they state the decision itself"
type: feedback
---

# Memory notes cite no local specs or plans

Memory notes never mention the design specs or implementation plans of
`docs/` (`docs/superpowers/specs/`, `docs/superpowers/plans/`), by path or
as "the design spec". A note states the decision and its reason itself;
the code and git history carry the rest.

**Why:** `docs/` is gitignored and stays on one machine, so such a
reference is dead for every other reader of the shared memory.

**How to apply:** when writing or updating a note, put the decision that
matters in the note and leave out any pointer to `docs/`. See
[[feedback_timeless_memory]].
