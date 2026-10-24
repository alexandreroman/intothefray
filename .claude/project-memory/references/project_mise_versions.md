---
name: "mise pins the frontend toolchain"
description: "Root mise.toml is the single source of the node and pnpm versions, locally and in CI"
type: project
---

# mise pins the frontend toolchain

The root `mise.toml` is the single source of truth for the node and pnpm
versions, locally and in the GitHub Actions workflows, CI and Pages
(`jdx/mise-action`). mise is optional: the Makefile never calls it, and
anyone with matching node and pnpm installed otherwise can run every
target.

**Why:** one place to bump versions, the same toolchain on every machine
and in CI.

**How to apply:** change node or pnpm versions only in `mise.toml`; do
not add other version files (`.nvmrc`, `packageManager`) next to it.
