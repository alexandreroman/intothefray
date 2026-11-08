---
name: "mise pins the frontend toolchain"
description: "Root mise.toml is the single source of the exact node and pnpm versions, locally and in CI; package.json engines is a floor"
type: project
---

# mise pins the frontend toolchain

The root `mise.toml` is the single source of truth for the exact node
and pnpm versions, locally and in `.github/workflows/ci.yml`
(`jdx/mise-action`).
mise is optional: the Makefile never calls it, and anyone with matching
node and pnpm installed otherwise can run every target.

`web/package.json` declares `engines` (node ≥ 26, pnpm ≥ 12) as a floor
for those who run without mise.

**Why:** one place to bump versions, the same toolchain on every machine
and in CI. The `engines` floor is no second pin: it names the major
versions the app needs, for those who install node and pnpm themselves.

**How to apply:** change node or pnpm versions only in `mise.toml`, and
raise the `engines` floor only when a new major is required; do not add
other version files (`.nvmrc`, `packageManager`) next to it.
