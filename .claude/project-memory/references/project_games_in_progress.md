---
name: "Games in progress counter"
description: "GET /api/stats reads game:<id>:info keys: count of games plus an anonymous list of what started games play; 60 s cache; Home capsule"
type: project
---

# Games in progress counter

- Every game has a small summary key `game:<id>:info` next to its full
  state `game:<id>`: phase, scenario code, modular set codes and the identity
  codes of its loaded decks in seat order (`game.Summary`). The store
  writes it with the game and gives it the game's TTL: `Create` sets both
  keys in one Lua script (SET NX on the game, then the summary), `Update`
  sets it in the game's MULTI, `Touch` expires both keys. A game without a
  summary is not counted.
- `Store.GameSummaries` walks `game:*:info` with `SCAN ... COUNT 1000`,
  MGETs each batch and drops duplicate keys, so the figure is exact. It
  never reads a game value (30 KB to over 1 MB each). Expired or
  undecodable values are skipped.
- `GET /api/stats` replies
  `{"games": N, "playing": [{"heroes": [{"hero", "alterEgo"}], "scenario",
  "modulars": [...]}]}`:
  - `games` counts every summary: lobby, playing and ended games (ended
    games stay one hour).
  - `playing` holds one anonymous entry per game in the playing phase,
    with English names from the embedded catalog: the identity card's hero
    face and alter-ego face (`""` when it has none), the scenario name, the
    modular set names. Unknown codes are left out. Entries are sorted by
    scenario, heroes, then modulars; they carry no game id, player name,
    deck name, deck URL or token.
  - `Cache-Control: public, max-age=60`. Each server instance caches the
    whole reply for 60 s under a mutex held during the scan, so an
    instance scans at most once a minute whatever the traffic. A failed
    read logs a warning, replies 503 with the usual `{"error": ...}` body
    and `no-store`, and is not cached.
- Home reads only `games`, once on mount (`web/src/lib/stats.ts`), and
  shows it as a small capsule (pill) centred at the top of the page, over
  the logo: "N games in progress", "1 game in progress", after a Fray red
  "live" dot that pulses softly. The capsule sits absolutely in the top
  padding of `main`, so it moves nothing when it fades in; it is still
  under reduced motion. Nothing shows while the count loads, when the
  request fails or when the count is 0; it is not a live region. The
  `playing` list is API only.

**Why:** a cheap social signal for visitors, and a public view of what
people play, with Redis expiry doing the bookkeeping. The summary keeps
the scan away from the large game values, and one scan yields both the
count and the list. Its prefix is not `game:` because a game id comes
from the request path: no id must name another game's summary.

**How to apply:** any new write path of a game key writes or expires its
summary too. Keep the public reply aggregated and anonymous (see
[[project_constraints]]). The README screenshot (see
[[project_readme_screenshot]]) is captured from a static build without a
backend, so it shows no count capsule.
