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
worktree's ports (web `CASPER_PORT`, server +1, Redis +2), and `casper run`
(`scripts/casper.sh run`) loads it, publishes the URLs to the info panel and
starts `make dev`. Decided 2026-10-19.

**Why:** the project must stay usable, unchanged, by anyone who does not run
Casper.

**How to apply:** put any new Casper behaviour in `scripts/casper.sh` or
`.casper.json`; the build files only take generic, env-driven settings
(`PORT`, `WEB_PORT`, `REDIS_PORT`).
