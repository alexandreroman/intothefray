---
name: "CI scope"
description: "ci.yml checks Go, web and Docker, then on main publishes the image, deploys Pages and the backend; no packs sync, no Dependabot"
type: project
---

# CI scope

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
Three jobs check every run: `go` (build, race tests, golangci-lint
pinned to the local version), `web` (svelte-check, lint, vitest, build)
and `docker` (`linux/amd64` image build without push, `compose.yaml` and
Caddyfile validation).

- On `main` (a push or a manual run), after the three checks pass,
  `publish` pushes `ghcr.io/alexandreroman/intothefray` (`linux/amd64`,
  tags = full commit SHA and `main`) with `GITHUB_TOKEN`, reading the
  layers the `docker` job wrote to the gha cache; `pages` and
  `deploy-backend` follow (see [[project_deployment]]). Pull requests
  build the image without pushing it.
- The Pages build lives in the `web` job: on `main` it runs
  `configure-pages`, the production build and `upload-pages-artifact`
  after the web checks, so the frontend is verified once per commit.
  `ci.yml` is the only workflow.
- CI does not compare `packs/dist` with `packs/curated`: packgen fetches
  its card sources over the network (`packs/.cache` is gitignored).
- The Caddyfile is validated through the compose `web` service, so the
  Caddy version is pinned in `compose.yaml` only.
- Action and dependency updates are manual (no Dependabot).

**Why:** keep CI fast and deterministic, with no network-dependent job,
no check run twice on a commit, keep each tool version in a single file,
and publish only images whose commit passed every check.

**How to apply:** when bumping golangci-lint locally, bump the
`version:` of the lint step in `ci.yml` too; do not add a packs
regeneration job or Dependabot config without asking; keep `-race` on
every package and share expensive read-only test fixtures instead.
