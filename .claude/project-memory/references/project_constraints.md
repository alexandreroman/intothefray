---
name: "Product constraints"
description: "Anti-cheat views, card images served by img.intothefray.xyz, no persistence, pack scope, accepted limits"
type: project
---

# Product constraints

- Anti-cheat: the server sends each viewer only what they may see (no
  other hands, deck order, face-down cards). Card ids are opaque and
  never let a viewer follow a card out of sight: a card gets a new id
  (`Action.Renames`, `renamedOnTheWay` in internal/game) when it goes
  onto a deck, unless it lands as the shown top card of a face-up side
  deck, and when it goes into a hand out of a hand or face down off the
  table; tucked cards that drop under a deck too. The new ids of one
  action or group are distinct.
- Card images, card backs and theme images are stored in a Cloudflare R2
  bucket and served by `https://img.intothefray.xyz`, the only image host
  the browser loads from (see [[project_image_cdn]]). The user accepts that
  this redistributes FFG/Marvel scans publicly.
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
