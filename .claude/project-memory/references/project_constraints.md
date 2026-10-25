---
name: "Product constraints"
description: "Anti-cheat views, no image hosting, no persistence, pack scope, accepted limits"
type: project
---

# Product constraints

- Anti-cheat: the server sends each viewer only what they may see (no
  other hands, deck order, face-down cards).
- Card images are never stored or proxied; the browser loads them from
  marvelcdb / Cerebro / mc4db URLs.
- No accounts and no long-term persistence; a game with nobody connected
  expires after 24 hours; only the host can "End game".
- Card packs are additive data files and hold every pack's player cards;
  a scenario needs a hand-curated file, and the lobby lists the others as
  "Not supported yet".
- A lost token loses its seat, and the host role never transfers.
- The backend runs on an OVH VPS at `api.intothefray.xyz` (see
  [[project_deployment]]); it stays portable.

**Why:** decided during the design.

**How to apply:** check new features against these limits before
building; the full rationale is in the design spec under `docs/`.
