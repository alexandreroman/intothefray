---
name: "Games in progress counter"
description: "GET /api/stats counts unexpired game keys by SCAN, cached 60 s per instance; Home shows a faint count line"
type: project
---

# Games in progress counter

- A game is "in progress" as long as its Redis key `game:<id>` exists:
  the count is every game that has not expired, ended games included
  (they stay one hour). No extra Redis structure tracks games; Create,
  Update and Touch know nothing of the count.
- `Store.CountGames` walks `game:*` with `SCAN ... COUNT 1000` and counts
  key names without reading values. Duplicates that SCAN may return
  during a rehash are counted, not removed: the figure is approximate.
- `GET /api/stats` replies `{"games": N}` with
  `Cache-Control: public, max-age=60`. Each server instance caches the
  count for 60 s under a mutex held during the scan, so an instance runs
  at most one SCAN a minute whatever the traffic. A failed count logs a
  warning, replies 503 with the usual `{"error": ...}` body and
  `no-store`, and is not cached.
- Home reads the count once on mount (`web/src/lib/stats.ts`) and shows
  one faint 13px line under the buttons (and under a start error):
  "N games in progress", "1 game in progress". Nothing shows while it
  loads or when the request fails; it is not a live region.

**Why:** a cheap social signal for visitors, with Redis expiry doing the
bookkeeping; the cache bounds the cost of SCAN on a public endpoint.
SCAN walks the whole keyspace, which stays small (games and `online:`
sets only): the user accepts that cost over a maintained structure. A
sorted set of game deadlines would make the count O(1) should the
keyspace grow, behind the same endpoint.

**How to apply:** keep the count derived from game keys; anything else
stored under `game:` would be counted too. The README screenshot (see
[[project_readme_screenshot]]) is captured from a static build without a
backend, so it shows no count line.
