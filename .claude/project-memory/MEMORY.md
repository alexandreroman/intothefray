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
- [Product constraints](references/project_constraints.md) — anti-cheat, images on img.intothefray.xyz, 24 h expiry, pack scope, accepted limits
- [Card image CDN](references/project_image_cdn.md) — img.intothefray.xyz is the only image origin; filled by intothefray-img `make publish`; AVIF
- [Card data sources](references/reference_card_sources.md) — marvelcdb primary, mc4db fallback; fr.marvelcdb names; image sources.json
- [Automated setup scope](references/project_setup_scope.md) — scheme on 1A, environments and printed side schemes placed, no threat
- [Replayable board state](references/project_replayable_state.md) — seed at start, full action history, snapshots every 10 actions
- [Moving card stacks](references/project_stack_moves.md) — top card moves the whole stack; a tucked card detaches; new tucks go under the stack
- [Optional Casper support](references/project_casper_optional.md) — wiring only in .casper.json and scripts/casper.sh; APP_INSTANCE names the tab
- [Caddy as the local web server](references/project_caddy_entry_point.md) — Caddy serves web/dist from disk, single local entry point
- [mise pins the frontend toolchain](references/project_mise_versions.md) — root mise.toml is the only node/pnpm version source
- [Random player name](references/project_player_name.md) — no name prompt; random "Adjective Noun" name in itf-name; 16 chars, no emoji
- [Standard and Expert set setup](references/project_set_setup.md) — Setup-keyword cards in play via sets.json; Dreadpool set aside; unlisted sets
- [Cards excluded from a set](references/project_set_exclude.md) — sets.json `exclude` drops a source's misfiled card (Shang-Chi 10098)
- [Villains from another set](references/project_set_villains.md) — sets.json `villains`, `imageCard`: Marauders images for NeXt Evolution
- [Hero side decks](references/project_hero_side_decks.md) — curated side decks, Invocation "own" discard, others "none"; set-aside hero cards
- [Per-game card pool](references/project_card_pool.md) — table loads GET /api/games/{id}/cards; SPA ships pack index only
- [Card image preload](references/project_image_preload.md) — browser-native: low-priority Image per pool face; immutable CDN cache
- [Compression: HTTP by the proxy, WebSocket by the backend](references/project_no_backend_compression.md) — WebSocket deflate, no context takeover
- [Visual identity](references/project_visual_identity.md) — Ink & Signal: Archivo, ink palette, wordmark; primary button: rounded, yellow hover ring
- [Table layout](references/project_table_layout.md) — rows, owner frames, out-of-play chips; 112×157 table cards; one villain row; markers
- [First player token needs two heroes](references/project_first_player_token.md) — none in a one-hero game; counts seats, not players
- [Provider-neutral UI copy](references/project_provider_neutral_copy.md) — UI says "deck link", names no deck provider
- [Top bar alignment](references/project_top_bar_alignment.md) — bar edges follow each screen's content column; table: icons 8px from window edge
- [Several decks per player](references/project_multi_deck.md) — 1–4 deck slots; seat = deck; credited seat; hero selector; two hands side by side
- [Hero selector look and animation](references/project_hero_selector.md) — avatars, hand counts, current hero named only, fixed width, 0.3 s switch
- [Truncated text shows a tooltip](references/project_truncated_text.md) — ellipsis text gets a full-text tooltip via use:overflowTip
- [Animated switches and card art thumbnails](references/project_switches_card_art.md) — switches slide (selectionIndicator); thumbnails use CardArt
- [CI scope](references/project_ci_scope.md) — ci.yml checks Go, web, Docker; on main: image, Pages, backend; no packs sync, no Dependabot
- [Moving several cards as a group](references/project_group_moves.md) — rubber band; drag or menu acts on the group; one atomic group action
- [Localized card names and images](references/project_localized_cards.md) — localized overrides per face and index; Options offers French (CDN)
- [French name sources](references/project_french_name_sources.md) — curated > mc4db FR > fr.marvelcdb > cgbuilder; cgbuilder non-fatal
- [Fear No Evil scenarios](references/project_fear_no_evil_scenarios.md) — Kingpin, Underlings as villains; scenario = main scheme set
- [Green Goblin scenarios](references/project_green_goblin_scenarios.md) — Risky Business, Mutagen Formula curated; Goblin Thralls by hand
- [Rise of Red Skull scenarios](references/project_red_skull_scenarios.md) — five villains curated; weapons and side-scheme decks; searches manual
- [Scenario decks and several villains](references/project_scenario_decks.md) — deck cards out of the classic deck; several villains
- [Discard destinations](references/project_discard_destinations.md) — owner's discard by default; "own" or "none"; a deck takes any card of its owner
- [Stage change carry-over](references/project_stage_carry_over.md) — villain keeps all but damage, main scheme only acceleration
- [Scenario required sets](references/project_scenario_required_sets.md) — `sets` adds required encounter sets (Hydra Patrol); not offered as modulars
- [Action menu organisation](references/project_action_bars.md) — click opens the action menu; hand plays by drag and keys; out-of-play chips
- [Identity card stays on the table](references/project_identity_stays.md) — identity never leaves the table, like a stage card
- [Compact top bar hides on scroll](references/project_top_bar_auto_hide.md) — ≤600px wide or ≤500px tall: hides on scroll down, back on scroll up
- [Every change of place animates](references/project_card_move_animations.md) — cards travel, turn to their landing side, tilt; hover survives turns
- [Presence message budget](references/project_presence_budget.md) — none while alone; 150 ms throttle, 3-unit dead zone, events at once
- [Deployment architecture](references/project_deployment.md) — Pages, VPS at api.intothefray.xyz; CI: image, Pages, backend; images after publish
- [Commit reporting](references/project_commit_reporting.md) — GET /api/version, VITE_COMMIT, Options shows app and server commits
- [Cards set aside by a deck card](references/project_deck_set_aside.md) — curated `setAside` in cards.json: Specialists, Linked player cards
- [Escape in fullscreen](references/project_escape_in_fullscreen.md) — Escape-closing layers preventDefault; lib/fullscreen locks Escape (Chromium)
- [Deck load acknowledgement](references/project_deck_load_ack.md) — deckSet acks setDeck with a version; only it confirms a load; one load at a time
- [Stat modifier tokens](references/project_stat_modifiers.md) — signed ATK/THW/DEF/SCH/REC/HP per card; menu + pill, no keys; ±99
- [Retaliate status carries a value](references/project_retaliate_status.md) — count = Retaliate X; key R; tab "Retaliate 2"
- [Acceleration token](references/project_acceleration_token.md) — token "acc": menu and pill only; Fray red, upward double chevron, by the threat
- [Hand card sizes](references/project_hand_sizes.md) — raised: 80 % of the preview, fills the table on narrow screens; resting: base card at 82 %
- [Scrolling lists fade at their edges](references/project_scroll_fade.md) — card box lists, lobby villain list: {@attach scrollFade}
- [Lobby columns share one height](references/project_lobby_columns.md) — side by side, Scenario box fills its column; settings slide in
- [Add a set menu groups by pack](references/project_modular_menu.md) — sets under sticky pack names; ★ in their pack; name filter field
- [Close is the main button of a card box](references/project_card_box_close.md) — Close is primary in every card box footer; other buttons secondary
- [Face-down cards](references/project_face_down_cards.md) — Flip toggles single-faced cards, turns stage cards over; hidden-deck Play lands face up
- [Revealed card is its deck's top card](references/project_deck_reveal.md) — encounter and own hidden decks reveal; top card; tokens; dragged landscape
- [No compatibility for games in progress](references/feedback_no_live_game_compat.md) — action changes ignore stored histories; simplest design
- [Memory notes carry no dates](references/feedback_timeless_memory.md) — timeless notes: decisions and reasons, no dates
- [Immutable views](references/project_view_immutable.md) — raw view, reused card objects, byId; one CardView redraw per moved card
- [Table cards are cheap to paint](references/project_card_paint_cost.md) — inset box-shadow shade, border-radius corners, CSS zoom
- [About screen](references/project_about_screen.md) — /about: Apache-2.0, card data credits, fan disclaimer; no tech stack
- [Documentation layout](references/project_docs_layout.md) — short README, DEVELOPMENT.md for contributors, CLAUDE.md essentials; details in notes
- [Notes cite no local specs or plans](references/feedback_no_docs_references.md) — never point to docs/ specs or plans; state the decision
- [README home page screenshot](references/project_readme_screenshot.md) — refresh .github/images/home.webp when the home page changes; recipe
- [Search fields offer no autocomplete](references/project_search_fields.md) — filters: autocomplete=off, spellcheck=false, no autosave; tested
- [What's new](references/project_whats_new.md) — Home dialog, unread dot + one-time banner; hand-written gameplay-only entries; no count
