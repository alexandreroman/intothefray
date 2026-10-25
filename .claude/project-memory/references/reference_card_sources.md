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
  `/EN/` for `/FR/`. The bulk API ignores the locale, so the generator
  keeps a French path only when a HEAD check answers it. Pack folders
  follow mc4db's own paths (e.g. `fear_no_evil_by_ffg/`), not always the
  marvelcdb pack code. All but about ten faces have a French path.
- mc4db answers every French image path it holds with HTTP 200 and one
  placeholder picture (`image/png`, 46,376 bytes, `Cache-Control: no-store`)
  stating that mc4db serves no French images; a path it does not hold answers
  404. A HEAD check cannot tell a French scan from the placeholder.
- mc4db is also the fallback card source: marvelcdb is primary, and the
  generator adds the mc4db records of official cards (card `pack_creator`
  `FFG`) whose base code marvelcdb lacks, all faces of a card from one
  source. mc4db codes map to marvelcdb ones: pack by code, else by name
  (`fear_no_evil_by_ffg` is `fne`), else by code without `_by_ffg`
  (`thor_by_ffg` is `thor`); set codes without `_by_ffg`; their images
  are relative to the mc4db host. Packs list: `/api/public/packs/` (names
  and positions of the packs marvelcdb lacks). The report lists the
  records taken from mc4db per pack.
  Fear No Evil is the pack it completes (171 records).
- Cerebro is not a card-list source: it holds no official card that both
  marvelcdb and mc4db lack.
- mc4db answers 429 to Go's default User-Agent; the generator sends
  `intothefray-packgen (+https://github.com/alexandreroman/intothefray)`.
- Cerebro has no French images.
- The official theme's first player token image is hotlinked from
  `https://card-table.app/images/table/first_player_token_marvelchampions.png`
  (`web/src/table/theme.ts`); it is not a card image.
- Cerebro swaps the A/B images of some identities (Groot, Rocket and the
  X-Men wave: Colossus, Shadowcat, Cyclops, Phoenix, Wolverine, Storm,
  Gambit, Rogue): its `XXXXXA.jpg` shows the alter-ego. `cerebro`
  overrides in `packs/curated/cards.json` give each face the right image
  id; marvelcdb and mc4db images are in the right order.
- Cerebro stores some landscape cards (hero side schemes, Bomb Scare, The
  Hood's main schemes) as portrait images, the card turned a quarter turn
  counter-clockwise. `CardFace.svelte` detects a portrait image in a
  landscape slot on load and turns it a quarter turn clockwise.

**Why:** Cerebro is preferred for multi-face scheme and villain images
(some marvelcdb faces are swapped, e.g. `01097b.png` shows 1A); mc4db is
the only source of scans of the printed French cards. mc4db runs on a
small shared host paid for by its owner.

**How to access:** plain HTTPS GET, no auth; the generator caches
responses under `packs/.cache/` and HEAD-checks every image URL; the
answers stay in `packs/.cache/images.json` until it is deleted, which
is how new mc4db scans get picked up.
