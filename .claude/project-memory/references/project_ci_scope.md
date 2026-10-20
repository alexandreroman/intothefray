---
name: "CI scope"
description: "ci.yml checks Go, web and Docker, publishes the image on main; pages.yml verifies on its own; no packs sync check, no Dependabot"
type: project
---

# CI scope

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
Three jobs check every run: `go` (build, vet, race tests, golangci-lint
pinned to the local version), `web` (svelte-check, lint, vitest, build)
and `docker` (`linux/amd64` image build without push, `compose.yaml` and
Caddyfile validation). Decided 2026-10-20.

- A fourth job, `publish`, runs on a push to `main` only, after the
  three others pass: it pushes `ghcr.io/alexandreroman/intothefray`
  (`linux/amd64`, tags = full commit SHA and `main`) with `GITHUB_TOKEN`,
  sharing the gha cache with `docker`, then sends the `deploy-app`
  dispatch to `intothefray-infra` (see [[project_deployment]]). Pull
  requests build the image without pushing it.
- `pages.yml` runs its own web verification before deploying,
  independent of the CI workflow; it runs on the `backend-deployed`
  dispatch or by hand.
- CI does not compare `packs/dist` with `packs/curated`: packgen fetches
  marvelcdb and Cerebro over the network (`packs/.cache` is gitignored).
- The Caddyfile is validated through the compose `web` service, so the
  Caddy version is pinned in `compose.yaml` only.
- Action and dependency updates are manual (no Dependabot).

**Why:** keep CI fast and deterministic, with no network-dependent job,
keep each tool version in a single file, and publish only images whose
commit passed every check.

**How to apply:** when bumping golangci-lint locally, bump the
`version:` of the lint step in `ci.yml` too; do not add a packs
regeneration job or Dependabot config without asking.
