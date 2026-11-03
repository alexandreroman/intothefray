---
name: "Documentation layout"
description: "README is a short public front page, DEVELOPMENT.md the contributor guide, CLAUDE.md the agent essentials"
type: project
---

# Documentation layout

- `README.md` is the public front page, under 100 lines: what the app is,
  its main features in a few bullets, a quick start, a link to
  `DEVELOPMENT.md` and the license.
- `DEVELOPMENT.md` (repository root) is the contributor guide:
  prerequisites, make targets, local stack, configuration, card pack
  generation, CI, deployment, architecture. Casper support is documented
  only in `.casper.json`, `scripts/casper.sh` and its memory note.
- `CLAUDE.md` holds what an agent needs every session: summary, stack,
  key commands, a module map (one line per directory), the Agents, Skills
  and Memory rules and the conventions. It points to `DEVELOPMENT.md`.
- Source-by-source merging rules and curated file formats live in the doc
  comments of `internal/packgen/`; design rationale and per-feature
  decisions live in the memory notes.

**Why:** short front pages stay accurate; long lists of features, curated
data and source quirks drift with the code and duplicate the notes and the
doc comments.

**How to apply:** a new feature takes at most one line in `README.md` or
`DEVELOPMENT.md`, often none; its details go in a memory note or the code.
Never list `sets.json` contents, supported scenarios or per-file details
in `CLAUDE.md`.
