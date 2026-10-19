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
- [Tech stack choices](references/project_tech_stack.md) — Go + Redis backend, Svelte SPA on GitHub Pages, path routes, why
- [Product constraints](references/project_constraints.md) — anti-cheat, no images, 24 h expiry, pack scope, v1 limits
- [Card data sources](references/reference_card_sources.md) — marvelcdb and Cerebro APIs and image URLs
- [Automated setup scope](references/project_setup_scope.md) — setup places cards; players draw their own opening hand
- [Replayable board state](references/project_replayable_state.md) — seed at start, full action history, snapshots every 10 actions
- [Moving card stacks](references/project_stack_moves.md) — top card moves the whole stack; a tucked card detaches
- [Optional Casper support](references/project_casper_optional.md) — Casper wiring only in .casper.json and scripts/casper.sh; build files stay generic
- [Caddy as the local web server](references/project_caddy_entry_point.md) — Caddy serves web/dist from disk, single local entry point
- [mise pins the frontend toolchain](references/project_mise_versions.md) — root mise.toml is the only node/pnpm version source
- [Random player name](references/project_player_name.md) — no name prompt; random "Adjective Noun" name stored in itf-name
- [Standard and Expert set setup](references/project_set_setup.md) — Setup-keyword set cards start in play via sets.json; Standard PvP unlisted
- [Per-game card pool](references/project_card_pool.md) — table loads GET /api/games/{id}/cards; SPA ships pack index only
- [No compression in the backend](references/project_no_backend_compression.md) — Go sends HTTP/WS uncompressed; Caddy/CDN compress
- [Visual identity](references/project_visual_identity.md) — Ink & Signal: Archivo, ink palette, split-card logo, full wordmark in bars
- [Table layout](references/project_table_layout.md) — left rail per zone (deck, discard, out of play); side panel has no toggle
- [Provider-neutral UI copy](references/project_provider_neutral_copy.md) — UI says "deck link", names no deck provider
