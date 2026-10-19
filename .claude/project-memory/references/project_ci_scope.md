---
name: "CI scope"
description: "ci.yml checks Go, web and Docker; pages.yml verifies on its own; no packs sync check, no Dependabot"
type: project
---

# CI scope

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`,
in three jobs: `go` (build, vet, race tests, golangci-lint pinned to the
local version), `web` (svelte-check, lint, vitest, build) and `docker`
(image build without push, `compose.yaml` and Caddyfile validation).
Decided 2026-10-20.

- `pages.yml` is standalone: it runs its own web verification before
  deploying, independent of the CI workflow.
- CI does not compare `packs/dist` with `packs/curated`: packgen fetches
  marvelcdb and Cerebro over the network (`packs/.cache` is gitignored).
- The Caddyfile is validated through the compose `web` service, so the
  Caddy version is pinned in `compose.yaml` only.
- Action and dependency updates are manual (no Dependabot).

**Why:** keep CI fast and deterministic, with no network-dependent job,
and keep each tool version in a single file.

**How to apply:** when bumping golangci-lint locally, bump the
`version:` of the lint step in `ci.yml` too; do not add a packs
regeneration job or Dependabot config without asking.
