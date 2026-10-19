# intothefray

Into The Fray: an online card table for Marvel Champions, played
in the browser, solo or multiplayer, as a pure sandbox (no rules
automation).

See [README.md](README.md) for full documentation.

## Tech stack

- Backend: Go (standard library `net/http`, WebSocket),
  stateless, scaled horizontally
- Shared state: Redis (in memory, game state + pub/sub)
- Frontend: TypeScript, Svelte 5 + Vite, static SPA served
  separately (GitHub Pages)
- Card data: per-pack JSON files generated from marvelcdb and
  Cerebro, plus hand-curated scenario files

## Build & run

```bash
make dev          # Redis + Caddy in containers, Air, web build
make test         # go test -race -shuffle=on ./...
make check        # tests, web-check, then golangci-lint
make build        # bin/intothefray
make web-install  # pnpm install --frozen-lockfile in web/
make web-check    # svelte-check, eslint + prettier, vitest
make web-build    # production build into web/dist/
```

## Modules

- `cmd/intothefray/` — server entry point (HTTP, `/healthz`), and the
  `healthcheck` subcommand that backs the container healthcheck
- `cmd/packgen/` — card pack generator, run with `make packs`
- `internal/config/` — configuration from environment variables
- `internal/decks/` — deck import from marvelcdb
- `internal/game/` — pure game engine (lobby, setup, actions, undo, views)
- `internal/server/` — HTTP API, game creation, WebSocket endpoint,
  cross-instance fan-out (hub)
- `internal/store/` — Redis game store and game event pub/sub
- `internal/pack/` — card pack schema (types) and catalog
- `internal/packgen/` — generator internals (fetch, marvelcdb, cerebro,
  build, images, curated, report, write)
- `packs/` — `curated/` hand-written scenarios, card overrides and set
  data (`sets.json`: cards a set starts in play, sets kept out of the
  lobby), `dist/` generated JSON (committed, never edited by hand), and the
  `embed` package that loads it
- `web/` — Svelte 5 + Vite SPA (standalone pnpm project; screens, lib,
  components, table: the table with its rendering, interactions,
  boxes, presence and animations)
- `web/Caddyfile` — Caddy config of the web app (dev and containers):
  serves `web/dist` with a history fallback to `index.html`, proxies
  `/api/*` and `/ws/*`, answers `/healthz`
- `mise.toml` — pinned node and pnpm versions (local and CI)
- `scripts/` — optional Casper workspace support (`casper.sh`:
  per-worktree ports, info panel)
- `.casper.json` — optional Casper workspace config (scripts and hooks)
- `.github/workflows/` — `pages.yml` publishes `web/` to GitHub Pages
- `Dockerfile` — container image of the server
- `compose.yaml` — local stack: Redis (in memory), the app service and
  the web service (Caddy serving `web/dist`)

## Agents

Use the following agents (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) for all code tasks:

- **code-writer** — for ANY task that writes,
  modifies, or refactors code. This includes
  one-line fixes, import changes, visibility
  tweaks, and adding assertions. Never edit
  source files directly — always delegate to
  this agent.
- **code-reviewer** — for read-only code review
  before merging or when investigating issues.

## Memory

At the start of every conversation, read
`.claude/project-memory/MEMORY.md` to load
project context from previous conversations.

Use the **project-memory** skill (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) proactively — without being asked — whenever
the conversation reveals project decisions, deadlines,
team context, external references, workflow preferences,
or corrective feedback worth persisting across
conversations.

**Important:** Always use the **project-memory**
skill to persist information. Never use the built-in
auto-memory system (`~/.claude/projects/.../memory/`)
for project decisions or context — it is local and
not shared with the team.

## Conventions

- Line length limits for readability:
  - Text / Markdown: 80 columns max
  - Code: 120 columns max
- Follow standard Markdown conventions: blank line
  before and after headings, blank line before and
  after lists, fenced code blocks with a language tag
- Always use the latest LTS or stable version of
  languages, frameworks, and libraries. Check the
  official documentation or use available tools
  (e.g. context7) to verify current versions before
  choosing a dependency.
- All project text is in English: code, comments,
  docs, UI, commit messages.
- Never commit `docs/` (design specs, plans,
  prototypes): it is gitignored and stays local.
- The design lives in `docs/superpowers/specs/`, the
  implementation plans in `docs/superpowers/plans/`;
  read them before changing behaviour.
