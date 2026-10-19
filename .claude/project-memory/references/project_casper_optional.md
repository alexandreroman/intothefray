---
name: "Optional Casper support"
description: "Casper workspace support is optional; all its wiring lives in .casper.json and scripts/casper.sh"
type: project
---

# Optional Casper support

The project supports Casper workspaces, as an option. The build files
(`Makefile`, `compose.yaml`, `web/vite.config.ts`) never call or mention
Casper: without Casper, `make dev` and the other targets work on their
default ports. All Casper wiring lives in `.casper.json` and
`scripts/casper.sh`: the `setup` hook writes `.env.casper` with the
worktree's ports (web `CASPER_PORT`, server +1, Redis +2). The Casper
commands are **Run** (`scripts/casper.sh run`: the container stack,
`make app-up`) and **Dev** (`scripts/casper.sh dev`: the hot-reload stack,
`make dev`), plus `test`; both load `.env.casper` and publish the URLs to the
info panel. Casper offers no check or build command. Decided 2026-10-19.

**Why:** the project must stay usable, unchanged, by anyone who does not run
Casper.

**How to apply:** put any new Casper behaviour in `scripts/casper.sh` or
`.casper.json`; the build files only take generic, env-driven settings
(`PORT`, `WEB_PORT`, `REDIS_PORT`).
