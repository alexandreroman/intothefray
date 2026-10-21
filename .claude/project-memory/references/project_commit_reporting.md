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
- The frontend reads `VITE_COMMIT` (set to `github.sha` by `pages.yml`),
  else `dev`.
- The Options screen shows `App <sha> · Server <sha>`, links full SHAs to
  their GitHub commit, and says "App and server differ" only when both are
  full SHAs that differ.

**Why:** Pages and the VPS deploy separately, so the two can run different
commits; a mismatch must be visible without digging into CI or logs.

**How to apply:** keep `/healthz` plain "ok" (container healthcheck);
version information goes through `/api/version` only. Both CI image builds
pass the same `COMMIT` build arg so they share the gha cache.
