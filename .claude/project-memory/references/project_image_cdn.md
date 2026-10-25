---
name: "Card image CDN"
description: "Card images live in R2 behind img.intothefray.xyz, filled from the user's machine by the private intothefray-img repo"
type: project
---

# Card image CDN

- Storage: Cloudflare R2 bucket `intothefray-img`, custom domain
  `img.intothefray.xyz` (r2.dev stays off). Keys are content-addressed,
  `cards/<lang>/<code>.<sha256 hex[:12]>.avif`, uploaded with
  `Cache-Control: public, max-age=31536000, immutable` and never deleted,
  so every past commit's URLs keep working. Backs and the first player
  token have fixed keys, `assets/<name>.avif`; a corrected asset gets a
  new name (`assets/first-player-v2.avif`), never an overwrite.
- Automation: the private repository `alexandreroman/intothefray-img`
  (`~/Projects/personal/infra/intothefray-img`), run from the user's
  machine with `make publish`; no CI job. It reads
  `packs/images/sources.json` (written by packgen), fetches, converts to
  sRGB, turns landscape faces stored portrait, caps the short edge at
  600 px, encodes AVIF, uploads the missing keys and writes
  `packs/images/manifest.json` in the app repo; packgen builds
  `packs/dist` from that manifest. The R2 token lives in its local `.env`.
- Sources: English is Cerebro, then OCTGN EN, then the source record's
  image (marvelcdb, or mc4db for fallback cards). French is OCTGN FR
  only; a face without a French scan falls back to English. OCTGN packs
  are the official `.o8c` archives (`NNN` below 997, no "FM") of the EN
  and FR Google Drive folders of the OCTGN plugin; card images are named
  by the card's `octgn_id`, which marvelcdb and mc4db records carry.
- Format: AVIF only.
- Single origin: the app loads every image (card faces, localized faces,
  scenario images, backs, first player token) from
  `https://img.intothefray.xyz` only. A CDN image that fails stays
  missing; the browser never requests Cerebro, marvelcdb or mc4db.

**Why:** French scans were unavailable from any hotlinkable host, and one
host with immutable, optimized images cuts the preload weight several
times over. One origin of immutable, never-deleted objects keeps players'
browsers free of third-party requests. A separate private repo keeps the
credentials and the download-heavy pipeline out of the public app and
its CI.

**How to apply:** new or corrected cards need `make publish` in
intothefray-img, then a commit of the app diff (release and rollback in
[[project_deployment]]); a missing image is fixed the same way, never by
a client fallback. `TestEmbeddedImagesOnCDN` in `packs/packs_test.go`
fails on any non-CDN image URL in the embedded catalog once
`packs/images/manifest.json` exists; design and plan in
`docs/superpowers/specs/2026-10-25-image-cdn-design.md` and
`docs/superpowers/plans/2026-10-25-image-cdn.md`. See
[[project_constraints]], [[reference_card_sources]].
