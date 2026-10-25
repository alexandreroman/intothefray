---
name: "Commit reporting"
description: "Backend and frontend each report the commit they run; Options shows both side by side"
type: project
---

# Commit reporting

- The backend serves `GET /api/version` (`{"commit": "<sha>"}`) and logs
  the commit at startup. `internal/version` reads the `-X` link-time value
  (the `COMMIT` Docker build arg, set to `github.sha` by CI), else the Go
  VCS stamp (with `-dirty` for a modified checkout), else `dev`.
- The frontend reads `VITE_COMMIT` (set to `github.sha` by the `web` job
  of `ci.yml`). When it is unset, `web/vite.config.ts` fills it from `git rev-parse HEAD`
  (with `-dirty` when `git status --porcelain` is non-empty), outside
  vitest; without Git, the app reports `dev`.
- The Options screen shows one small, faint, right-aligned lowercase line
  of plain short SHAs (full value in a tooltip, no link): `version <app>`
  while the server loads or when both values are equal,
  `version mismatch <app>/<server>` in a subdued warn colour when the
  strings differ (a `dev` build counts), and `version <app>/unavailable`
  when `/api/version` fails.

**Why:** Pages and the VPS deploy separately, so the two can run different
commits; a mismatch must be visible without digging into CI or logs.

**How to apply:** keep `/healthz` plain "ok" (container healthcheck);
version information goes through `/api/version` only. Both CI image builds
pass the same `COMMIT` build arg so they share the gha cache.
