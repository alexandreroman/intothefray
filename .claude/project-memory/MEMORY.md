# Project Memory

> When a new decision **contradicts** an existing
> memory note, do NOT silently override it.
> Instead: surface the conflict, quote the
> existing memory, explain how the new decision
> differs, and ask for explicit confirmation
> before updating. **Do NOT take any action** —
> no tool calls, no file writes — until confirmed.

> **Note wording** — state permanent facts in the
> present tense. A note read out of context must
> not reveal what it replaces or what just
> happened. Ban narration markers: "now", "no
> longer", "previously / used to", "reverses /
> replaces", "kept", "changed to", "reintroduce",
> "the user asked to". Phrase prohibitions
> positively ("the API is versioned under /v2"),
> not as the negation of a former state. Test:
> remove the note from its context — if a sentence
> only makes sense knowing the prior state,
> rewrite it.

- [Project objective](references/project_objective.md) — browser sandbox table for Marvel Champions, no rules
- [Name and license](references/project_name_license.md) — intothefray, Go module path, Apache-2.0
- [Tech stack choices](references/project_tech_stack.md) — Go + Redis backend, Svelte SPA on GitHub Pages, why
- [Product constraints](references/project_constraints.md) — anti-cheat, no images, 24 h expiry, pack scope, v1 limits
- [Card data sources](references/reference_card_sources.md) — marvelcdb and Cerebro APIs and image URLs
- [Automated setup scope](references/project_setup_scope.md) — setup places cards; players draw their own opening hand
- [Replayable board state](references/project_replayable_state.md) — seed at start, full action history, snapshots every 10 actions
- [Moving card stacks](references/project_stack_moves.md) — top card moves the whole stack; a tucked card detaches
- [Optional Casper support](references/project_casper_optional.md) — Casper wiring only in .casper.json and scripts/casper.sh; build files stay generic
