---
name: "Optional Casper support"
description: "Casper workspace support is optional; all its wiring lives in .casper.json and scripts/casper.sh"
type: project
---

# Optional Casper support

The project supports Casper workspaces, as an option. The build files
(`Makefile`, `compose.yaml`, `web/Caddyfile`, `web/vite.config.ts`) never
call or mention Casper: without Casper, `make dev` and the other targets
work on their default ports. All Casper wiring lives in `.casper.json` and
`scripts/casper.sh`: the `setup` hook writes `.env.casper` with the
worktree's ports (web `CASPER_PORT`, server +1, Redis +2) and its instance
name `APP_INSTANCE` (the branch, sanitized; the directory name when
detached). The Casper
commands are **Run** (`scripts/casper.sh run`: the whole stack in
containers — web, server, Redis — declared in `compose.yaml`, via
`make app-up`) and **Dev** (`scripts/casper.sh dev`: the hot-reload stack,
`make dev`), and only those; both load `.env.casper` and publish the URLs to
the info panel. Decided 2026-10-19.

**Why:** the project must stay usable, unchanged, by anyone who does not run
Casper.

**How to apply:** put any new Casper behaviour in `scripts/casper.sh` or
`.casper.json`; the build files only take generic, env-driven settings
(`PORT`, `WEB_PORT`, `REDIS_PORT`, `APP_INSTANCE`). A value set in `.env`
or `.env.local` wins over `.env.casper`.

## Instance name in the tab title

`APP_INSTANCE` is a generic, optional build-time variable holding only an
instance name (`dev`, a branch name). Set, the tab title reads
`Into The Fray (<name>)`; unset or blank, it reads `Into The Fray`
(production and GitHub Pages builds). Vite exposes it through
`envPrefix: ['VITE_', 'APP_INSTANCE']`; `web/src/lib/title.ts` builds the
title, set in `main.ts`. Decided 2026-10-20.
