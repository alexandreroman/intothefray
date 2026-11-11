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
- [Tech stack choices](references/project_tech_stack.md) — Go + Redis backend, Svelte SPA on GitHub Pages, path routes (/g/?id=), why
- [Product constraints](references/project_constraints.md) — anti-cheat, images on img.intothefray.xyz, 24 h expiry, pack scope, accepted limits
- [Card image CDN](references/project_image_cdn.md) — img.intothefray.xyz is the only image origin; filled by intothefray-img `make publish`; AVIF
- [Card data sources](references/reference_card_sources.md) — marvelcdb primary, mc4db fallback; fr.marvelcdb names; image sources.json
- [Automated setup scope](references/project_setup_scope.md) — scheme on 1A, environments and printed side schemes placed, no threat
- [Replayable board state](references/project_replayable_state.md) — seed at start, full action history, snapshots every 10 actions
- [Moving card stacks](references/project_stack_moves.md) — chain down-right, first card on a scheme centred; a deck top dropped on a card joins it
- [Optional Casper support](references/project_casper_optional.md) — wiring in .casper.json, casper.sh; export .env.casper before make
- [Caddy as the local web server](references/project_caddy_entry_point.md) — Caddy serves web/dist from disk, single local entry point
- [mise pins the frontend toolchain](references/project_mise_versions.md) — root mise.toml pins node/pnpm; package.json engines is a floor
- [Random player name](references/project_player_name.md) — no name prompt; random "Adjective Noun" name in itf-name; 16 chars, no emoji
- [Standard and Expert set setup](references/project_set_setup.md) — Setup-keyword cards in play via sets.json; Dreadpool set aside; unlisted sets
- [Cards excluded from a set](references/project_set_exclude.md) — sets.json `exclude` drops a source's misfiled card (Shang-Chi 10098)
- [Villains from another set](references/project_set_villains.md) — sets.json `villains`, `imageCard`: Marauders images for NeXt Evolution
- [Hero side decks](references/project_hero_side_decks.md) — own set only; Invocation "own", Sense "bottom", others "none"; set-aside, in-play hero cards
- [Per-game card pool](references/project_card_pool.md) — table loads GET /api/games/{id}/cards; SPA ships pack index only
- [Card image preload](references/project_image_preload.md) — browser-native: low-priority Image per pool face; immutable CDN cache
- [Compression: HTTP by the proxy, WebSocket by the backend](references/project_no_backend_compression.md) — WebSocket deflate, no context takeover
- [Visual identity](references/project_visual_identity.md) — Ink & Signal: Archivo, ink palette, wordmark; primary button: rounded, yellow hover ring
- [Table layout](references/project_table_layout.md) — rows, owner frames, out-of-play chips; 112×157 table cards; one villain row; markers
- [First player token needs two heroes](references/project_first_player_token.md) — none in a one-hero game; counts seats, not players
- [Provider-neutral UI copy](references/project_provider_neutral_copy.md) — UI says "deck link", names no deck provider
- [Top bar alignment](references/project_top_bar_alignment.md) — bar edges follow the content column; history buttons under End game
- [Several decks per player](references/project_multi_deck.md) — 1–4 deck slots; seat = deck; credited seat; hero selector; two hands side by side
- [Hero selector look and animation](references/project_hero_selector.md) — avatars, hand counts, current hero named only, fixed width, 0.3 s switch
- [Truncated text shows a tooltip](references/project_truncated_text.md) — ellipsis text gets a full-text tooltip via use:overflowTip
- [Animated switches and card art thumbnails](references/project_switches_card_art.md) — switches slide (selectionIndicator); thumbnails use CardArt
- [CI scope](references/project_ci_scope.md) — ci.yml checks Go, web, Docker; on main: image, Pages, backend; no packs sync, no Dependabot
- [Moving several cards as a group](references/project_group_moves.md) — rubber band; drag or menu acts on the group; one atomic group action
- [Localized card names and images](references/project_localized_cards.md) — localized overrides per face and index; Options offers French (CDN)
- [French name sources](references/project_french_name_sources.md) — curated > mc4db FR > fr.marvelcdb > cgbuilder; cgbuilder non-fatal
- [Fear No Evil scenarios](references/project_fear_no_evil_scenarios.md) — Kingpin, Underlings as villains; scheme set; Art, Bugle, Spine aside
- [Green Goblin scenarios](references/project_green_goblin_scenarios.md) — Risky Business, Mutagen Formula curated; Goblin Thralls by hand
- [Galaxy's Most Wanted scenarios](references/project_galaxys_most_wanted_scenarios.md) — five scenarios curated; Milano, Power Stone placed
- [Mad Titan's Shadow scenarios](references/project_mad_titans_shadow_scenarios.md) — five curated; Infinity Stone deck; Loki's pick manual
- [Scenario out-of-play areas](references/project_scenario_areas.md) — curated `areas` (The Collection): public pile, star chip before victory
- [Campaign player card backs](references/project_campaign_card_backs.md) — faction campaign + player card type gets the player back
- [Rise of Red Skull scenarios](references/project_red_skull_scenarios.md) — five villains curated; weapons and side-scheme decks; searches manual
- [Scenario decks and several villains](references/project_scenario_decks.md) — deck cards out of the classic deck; several villains
- [Discard destinations](references/project_discard_destinations.md) — owner's discard by default; "own", "bottom", "none"; side decks own set only
- [Stage change carry-over](references/project_stage_carry_over.md) — villain keeps all but damage, main scheme only acceleration
- [Scenario required sets](references/project_scenario_required_sets.md) — `sets` adds required encounter sets (Hydra Patrol); never modular
- [Action menu organisation](references/project_action_bars.md) — click opens the menu; hand by drag and keys; chips; touch: inspector sheet
- [Identity card stays on the table](references/project_identity_stays.md) — identity never leaves the table, like a stage card
- [Compact top bar hides on scroll](references/project_top_bar_auto_hide.md) — ≤600px wide or ≤500px tall: hides on scroll down; not in dock mode
- [Every change of place animates](references/project_card_move_animations.md) — cards travel, turn, tilt; lift 1.06, drag sway ±6°, settle on drop
- [Presence message budget](references/project_presence_budget.md) — none while alone; 150 ms throttle, 3-unit dead zone, events at once
- [Deployment architecture](references/project_deployment.md) — Pages behind the Cloudflare proxy, VPS at api.intothefray.xyz; CI deploys all
- [Commit reporting](references/project_commit_reporting.md) — GET /api/version, VITE_COMMIT, Options shows app and server commits
- [Cards set aside by a deck card](references/project_deck_set_aside.md) — curated `setAside` in cards.json: the Linked player cards of a deck card
- [Escape in fullscreen](references/project_escape_in_fullscreen.md) — Escape-closing layers preventDefault; lib/fullscreen locks Escape (Chromium)
- [Fullscreen on iPad and the Home Screen app](references/project_ipad_fullscreen.md) — iPad: no Fullscreen, Home Screen banner; installed: Reload
- [Deck load acknowledgement](references/project_deck_load_ack.md) — deckSet acks setDeck with a version; only it confirms a load; one load at a time
- [Stat modifier tokens](references/project_stat_modifiers.md) — signed ATK/THW/DEF/SCH/REC/HP per card; menu + pill, no keys; ±99
- [Retaliate status carries a value](references/project_retaliate_status.md) — count = Retaliate X; key R; tab "Retaliate 2"
- [Acceleration token](references/project_acceleration_token.md) — token "acc": menu and pill only; Fray red, upward double chevron, by the threat
- [Hand card sizes](references/project_hand_sizes.md) — raised: 80 % of the preview (tablet 65 %); boxes alike, ≤ 160 px, 3 rows if tall; resting 82 %
- [Scrolling lists fade at their edges](references/project_scroll_fade.md) — card boxes, Add a set menu, What's new: scrollFade
- [Lobby layout](references/project_lobby_layout.md) — one column: Players (seat per deck, 32px .btn-icon tools), Scenario, Start
- [Add a set menu groups by pack](references/project_modular_menu.md) — sets under sticky pack names; ★ in their pack; name filter field
- [Close is the main button of a card box](references/project_card_box_close.md) — Close is primary in every card box footer; other buttons secondary
- [Face-down cards](references/project_face_down_cards.md) — Flip toggles single-faced cards, turns stage cards over; hidden-deck Play lands face up
- [Revealed card is its deck's top card](references/project_deck_reveal.md) — encounter, scenario, own hidden decks reveal; top card; drags landscape
- [No compatibility for games in progress](references/feedback_no_live_game_compat.md) — action changes ignore stored histories; simplest design
- [Memory notes carry no dates](references/feedback_timeless_memory.md) — timeless notes: decisions and reasons, no dates
- [Immutable views](references/project_view_immutable.md) — raw view, reused card objects, byId; one CardView redraw per moved card
- [Cards are cheap to paint](references/project_card_paint_cost.md) — shades not filters, moves on transforms, reads before writes, CSS zoom
- [Text scales with CSS zoom on iOS](references/project_ios_zoom_text.md) — html text-size-adjust: none, else iOS Safari keeps text unzoomed
- [About screen](references/project_about_screen.md) — /about: Apache-2.0, card data credits, fan disclaimer; no tech stack
- [Documentation layout](references/project_docs_layout.md) — short README, DEVELOPMENT.md for contributors, CLAUDE.md essentials; details in notes
- [Notes cite no local specs or plans](references/feedback_no_docs_references.md) — never point to docs/ specs or plans; state the decision
- [README home page screenshot](references/project_readme_screenshot.md) — refresh .github/images/home.webp when the home page changes; recipe
- [On-screen keyboard keeps the UI in sight](references/project_touch_keyboard.md) — visibleArea: dialogs and menus; 16 px fields; no focus on touch
- [Search fields offer no autocomplete](references/project_search_fields.md) — filters: autocomplete=off, spellcheck=false, no autosave; one matcher
- [What's new](references/project_whats_new.md) — Home dialog, unread dot + one-time banner; hand-written player-facing entries; no count
- [Share previews and SEO](references/project_share_previews.md) — build-written meta; invite /g/?id=<id> is a real page; og images; sitemap: home
- [Table press releases focus](references/project_press_releases_focus.md) — press blurs a button; pointerBlur on chrome; (hover: hover); a finger rests nowhere
- [Games in progress counter](references/project_games_in_progress.md) — game:<id>:info keys; /api/stats counts and lists live games; Home capsule
- [The page is frozen under a dialog](references/project_dialog_scroll_lock.md) — openModal() (dialogs, modal sheets) locks html scroll; offset kept
- [Pile counts step aside during animations](references/project_pile_count_hush.md) — badge fades out while a pile animates; back with final count
- [Touch and phone table](references/project_touch_phone_table.md) — inspector tiles; hold; tablet table pinch; phone dock, page pinch
- [Card counts use one capsule](references/project_count_capsule.md) — piles, dock, hand sheet, hero selector: .count-pill
- [No button alone on a line](references/project_no_lone_button.md) — buttonGrid: 1 full, pairs, 3 in a row if ≥96 px, odd: last full
- [Full-bleed favicon](references/project_favicon.md) — one opaque icon for tabs and search; favicon.ico first; maskable icons: 40 % safe zone
- [A press shows the hover's look](references/project_press_looks.md) — no tap highlight; :active = hover look, rounded; own-feedback elements none
- [Count dialog takes typed digits](references/project_count_dialog.md) — "How many cards?": digits typed, no text field
- [Pages end with their content](references/project_page_height.md) — dvh or fixed inset 0; absolute boxes in columns need a positioned row
- [Dialogs take the focus without a focus ring](references/project_dialog_focus.md) — quiet focus on open, focusOnOpen; menus: focusAfterPress
- [Home Screen status bar](references/project_home_screen_status_bar.md) — fullscreen manifest; data-installed; --status-room; 100lvh
