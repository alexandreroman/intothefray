---
name: "Per-game card pool"
description: "Clients load only the game's card definitions from GET /api/games/{id}/cards; the SPA ships the pack index only"
type: project
---

# Per-game card pool

- The table loads its card definitions from `GET /api/games/{id}/cards`:
  the distinct cards of the game's table, sorted by code, with aliases,
  and nothing else (no card id, count, pile or order). No token: the
  content is public card data.
- The server recomputes the pool on each request from the stored game and
  the embedded catalog; nothing extra goes to Redis. The response has a
  strong `ETag` and `Cache-Control: max-age=86400, immutable` (a game's
  cards are fixed once its table is set up).
- The backend never compresses responses: compression belongs to the
  infrastructure (Caddy `encode` locally, Cloudflare or equivalent in
  production).
- The SPA publishes only `packs/<lang>/index.json`, for the lobby's
  scenario picker. Lobby hero thumbnails come from `PlayerView.heroImage`,
  which `Game.SetDeck` fills from the catalog.

**Why:** bandwidth. All 64 pack files weigh about 150 KB on the wire once
compressed (1.9 MB raw); a game's pool weighs 2 to 5 KB compressed for 1 to
4 players.

**How to apply:** a feature that needs card data on the client reads it
from the pool or the lobby view, never from static pack files; a feature
that creates cards mid-game breaks the "fixed pool" assumption and the
immutable caching.
