---
name: "Card data sources"
description: "marvelcdb, Cerebro and mc4db public APIs used by the pack generator, and the image sources it lists for the CDN"
type: reference
---

# Card data sources

- marvelcdb public API: `https://marvelcdb.com/api/public/packs/`,
  `/api/public/cards/?encounter=1`, decks at `/api/public/decklist/{id}`
  and `/api/public/deck/{id}`; images at `https://marvelcdb.com{imagesrc}`.
  Card records carry `octgn_id`, the name of the card's images in the
  OCTGN image packs.
- Cerebro API: `https://cerebro-beta-bot.herokuapp.com/{cards,packs,sets}`;
  images at
  `https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/{Id}.jpg`.
- French names: `https://fr.marvelcdb.com/api/public/cards/?encounter=1`
  (`name`, `subname`, `card_set_name` in French, `real_name` in English)
  and `/api/public/packs/` (French pack names). Its images are the
  English ones.
- mc4db, a MarvelCDB fork run by Merlin at
  `https://mc4db.merlindumesnil.net`, is the fallback card source:
  marvelcdb is primary, and the generator adds the mc4db records of
  official cards (card `pack_creator` `FFG`) whose base code marvelcdb
  lacks, all faces of a card from one source. mc4db codes map to
  marvelcdb ones: pack by code, else by name (`fear_no_evil_by_ffg` is
  `fne`), else by code without `_by_ffg` (`thor_by_ffg` is `thor`); set
  codes without `_by_ffg`; their images are relative to the mc4db host.
  Packs list: `/api/public/packs/` (names and positions of the packs
  marvelcdb lacks). The report lists the records taken from mc4db per
  pack. Fear No Evil is the pack it completes (171 records).
- mc4db answers every French image path it holds with HTTP 200 and one
  placeholder picture (`image/png`, 46,376 bytes, `Cache-Control: no-store`)
  stating that mc4db serves no French images. French scans come from the
  OCTGN FR packs (see [[project_image_cdn]]).
- Cerebro is not a card-list source: it holds no official card that both
  marvelcdb and mc4db lack.
- mc4db answers 429 to Go's default User-Agent; the generator sends
  `intothefray-packgen (+https://github.com/alexandreroman/intothefray)`.
- Cerebro has no French images.
- Every card image, the card backs and the first player token are served
  by the image CDN `https://img.intothefray.xyz`. The packs hold CDN URLs
  only, from `packs/images/manifest.json`. `web/src/table/theme.ts` uses
  the fixed keys `https://img.intothefray.xyz/assets/<name>.avif`, with
  `<name>` one of `back-player`, `back-encounter`, `back-villain` and
  `first-player`.
- For each face, the generator lists the candidate image sources in
  `packs/images/sources.json` (`make sources`): the Cerebro image, the
  source record's image (marvelcdb, or mc4db for fallback cards), the
  OCTGN file stem (`octgn_id`, plus `.b`, `.c`… for an alternate face)
  and whether the face is landscape. intothefray-img picks and publishes
  the images from it.
- Cerebro swaps the A/B images of some identities (Groot, Rocket and the
  X-Men wave: Colossus, Shadowcat, Cyclops, Phoenix, Wolverine, Storm,
  Gambit, Rogue): its `XXXXXA.jpg` shows the alter-ego. `cerebro`
  overrides in `packs/curated/cards.json` give each face the right image
  id in `sources.json`; marvelcdb and mc4db images are in the right order.
- Cerebro stores some landscape cards (hero side schemes, Bomb Scare, The
  Hood's main schemes) as portrait images, the card turned a quarter turn
  counter-clockwise. intothefray-img turns them a quarter clockwise, so
  every CDN image is in the card's own orientation and `CardFace.svelte`
  draws it as is.

**Why:** Cerebro is preferred for multi-face scheme and villain images
(some marvelcdb faces are swapped, e.g. `01097b.png` shows 1A); OCTGN FR
is the source of scans of the printed French cards. mc4db runs on a
small shared host paid for by its owner, so the packs never link to it.

**How to access:** plain HTTPS GET, no auth; the generator caches source
responses under `packs/.cache/` (`-refresh` ignores them). New or
corrected images go through `make publish` in intothefray-img.
