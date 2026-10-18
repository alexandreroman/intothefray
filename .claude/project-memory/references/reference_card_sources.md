---
name: "Card data sources"
description: "marvelcdb and Cerebro public APIs and image URLs used by the pack generator"
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

**Why:** they are the only data sources; Cerebro is preferred for
multi-face scheme and villain images (some marvelcdb faces are swapped,
e.g. `01097b.png` shows 1A).

**How to access:** plain HTTPS GET, no auth; the generator caches
responses under `packs/.cache/`.
