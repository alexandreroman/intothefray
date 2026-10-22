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
- [Product constraints](references/project_constraints.md) — anti-cheat, images never stored or proxied, 24 h expiry, pack scope, v1 limits
- [Card data sources](references/reference_card_sources.md) — marvelcdb primary, mc4db fallback cards; Cerebro, fr.marvelcdb, mc4db image URLs
- [Automated setup scope](references/project_setup_scope.md) — setup places cards; players draw their own opening hand
- [Replayable board state](references/project_replayable_state.md) — seed at start, full action history, snapshots every 10 actions
- [Moving card stacks](references/project_stack_moves.md) — top card moves the whole stack; a tucked card detaches
- [Optional Casper support](references/project_casper_optional.md) — Casper wiring only in .casper.json and scripts/casper.sh; APP_INSTANCE names the tab
- [Caddy as the local web server](references/project_caddy_entry_point.md) — Caddy serves web/dist from disk, single local entry point
- [mise pins the frontend toolchain](references/project_mise_versions.md) — root mise.toml is the only node/pnpm version source
- [Random player name](references/project_player_name.md) — no name prompt; random "Adjective Noun" name in itf-name; 16 chars, no emoji
- [Standard and Expert set setup](references/project_set_setup.md) — Setup-keyword set cards start in play via sets.json; Standard PvP unlisted
- [Hero side decks](references/project_hero_side_decks.md) — curated side decks, only Invocation has a discard; set-aside hero cards
- [Per-game card pool](references/project_card_pool.md) — table loads GET /api/games/{id}/cards; SPA ships pack index only
- [Card image preload](references/project_image_preload.md) — browser-native: low-priority Image per pool face, no custom queue
- [Compression split](references/project_no_backend_compression.md) — HTTP: proxy compresses; WebSocket: permessage-deflate, no takeover
- [Visual identity](references/project_visual_identity.md) — Ink & Signal: Archivo, ink palette, split-card logo, full wordmark in bars
- [Table layout](references/project_table_layout.md) — one surface in rows, owner frames, out-of-play via owner frame chips
- [Provider-neutral UI copy](references/project_provider_neutral_copy.md) — UI says "deck link", names no deck provider
- [Top bar alignment](references/project_top_bar_alignment.md) — bar edges follow each screen's content column; table: icons 8px from window edge
- [Several decks per player](references/project_multi_deck.md) — 1 to 4 deck slots per player, 4 in all; seat = deck; credited seat
- [Truncated text shows a tooltip](references/project_truncated_text.md) — ellipsis text gets a full-text tooltip via use:overflowTip
- [Animated switches and card art](references/project_switches_card_art.md) — switches slide via selectionIndicator; thumbnails use CardArt
- [Spectators cannot change the stage card](references/project_spectator_stage.md) — no action on villain/main scheme cards for spectators
- [CI scope](references/project_ci_scope.md) — ci.yml checks Go, web, Docker; on main: image, Pages, backend; no packs sync, no Dependabot
- [Moving several cards as a group](references/project_group_moves.md) — rubber band selection; drag or menu Discard / Move to on the group; one atomic group action
- [Localized card names and images](references/project_localized_cards.md) — localized overrides per face and index entry; Options language, English default
- [Fear No Evil scenarios](references/project_fear_no_evil_scenarios.md) — Kingpin curated; chosen-Underling scenarios unsupported
- [Action menu organisation](references/project_action_bars.md) — click opens the action menu; hand plays by drag and keys; out-of-play chips
- [Identity card stays on the table](references/project_identity_stays.md) — identity never leaves the table, like a stage card
- [Compact top bar hides on scroll](references/project_top_bar_auto_hide.md) — ≤600px wide or ≤500px tall: hides on scroll down, back on scroll up
- [Every change of place animates](references/project_card_move_animations.md) — cards travel origin to destination; hidden ones as backs; unseen hands subtle
- [Presence message budget](references/project_presence_budget.md) — none while alone; moves every 150 ms, 3-unit dead zone, events at once; Redis free tier
- [Deployment architecture](references/project_deployment.md) — Pages at intothefray.xyz, VPS at api.intothefray.xyz; CI: image, then Pages, then backend
- [Commit reporting](references/project_commit_reporting.md) — GET /api/version, VITE_COMMIT, Options shows app and server commits
- [Cards set aside by a deck card](references/project_deck_set_aside.md) — curated `setAside` in cards.json (Specialized Training → Specialists)
- [Escape in fullscreen](references/project_escape_in_fullscreen.md) — Escape-closing layers preventDefault; lib/fullscreen locks Escape (Chromium)
- [Deck load acknowledgement](references/project_deck_load_ack.md) — deckSet acks setDeck with a version; only it confirms a load; one load at a time
- [Stat modifier tokens](references/project_stat_modifiers.md) — signed ATK/THW/DEF/SCH/REC/HP per card; menu + pill, no keys; ±99
- [Retaliate status carries a value](references/project_retaliate_status.md) — count = Retaliate X; key R; tab "Retaliate 2"
- [Hand card sizes](references/project_hand_sizes.md) — raised: 80 % of the preview card; resting: base card at 82 %, its fan and height
- [Scrolling lists fade at their edges](references/project_scroll_fade.md) — card box lists, lobby villain list: {@attach scrollFade}
- [Lobby columns share one height](references/project_lobby_columns.md) — side by side, Scenario box fills its column; settings slide in
- [Close is the main button of a card box](references/project_card_box_close.md) — Close is primary in every card box footer; other buttons secondary
- [Face-down cards](references/project_face_down_cards.md) — Flip toggles single-faced cards; cards played from a hidden deck land face down
