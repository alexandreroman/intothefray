---
name: "Product constraints"
description: "Anti-cheat views, no image hosting, no persistence, pack scope, accepted v1 limits"
type: project
---

# Product constraints

- Anti-cheat: the server sends each viewer only what they may see (no
  other hands, deck order, face-down cards).
- Card images are never stored or proxied; the browser loads them from
  marvelcdb / Cerebro / mc4db URLs.
- No accounts and no long-term persistence; a game with nobody connected
  expires after 24 hours; only the host can "End game".
- Card packs are additive data files; scenarios need a hand-curated file
  and the first release covers the Core Set plus a few packs, the rest
  listed as "not supported yet".
- Lost seats (lost token) and host transfer are not handled in v1.
- The backend runs on an OVH VPS at `api.intothefray.xyz` (see
  `project_deployment.md`); it stays portable.

**Why:** decided during the design.

**How to apply:** check new features against these limits before
building; the full rationale is in the design spec under `docs/`.
