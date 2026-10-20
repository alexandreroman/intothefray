---
name: "Card data sources"
description: "marvelcdb, Cerebro and mc4db public APIs and image URLs used by the pack generator"
type: reference
---

# Card data sources

- marvelcdb public API: `https://marvelcdb.com/api/public/packs/`,
  `/api/public/cards/?encounter=1`, decks at `/api/public/decklist/{id}`
  and `/api/public/deck/{id}`; images at `https://marvelcdb.com{imagesrc}`.
- Cerebro API: `https://cerebro-beta-bot.herokuapp.com/{cards,packs,sets}`;
  images at
  `https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/official/{Id}.jpg`
  and backs at `.../cerebro-cards/{HeroBack,EncounterBack,VillainBack}.jpg`.
- French names: `https://fr.marvelcdb.com/api/public/cards/?encounter=1`
  (`name`, `subname`, `card_set_name` in French, `real_name` in English)
  and `/api/public/packs/` (French pack names). Its images are the
  English ones.
- French images: mc4db, a MarvelCDB fork run by Merlin, at
  `https://mc4db.merlindumesnil.net/bundles/cards/FR/{pack}/{code}.webp`
  (uppercase `FR`). Its bulk API `/api/public/cards/?encounter=1` gives
  each card's English `imagesrc`/`backimagesrc`; the French path swaps
  `/EN/` for `/FR/`. The bulk API ignores the locale, so a French image
  exists only once a HEAD check says so. About 96% of the faces have one;
  the newest packs (`fne`, `jj`, `luke_cage`) have none.
- Cerebro has no French images.

**Why:** Cerebro is preferred for multi-face scheme and villain images
(some marvelcdb faces are swapped, e.g. `01097b.png` shows 1A); mc4db is
the only source of scans of the printed French cards. mc4db runs on a
small shared host paid for by its owner.

**How to access:** plain HTTPS GET, no auth; the generator caches
responses under `packs/.cache/` and HEAD-checks every image URL.
