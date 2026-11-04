---
name: "Games in progress counter"
description: "GET /api/stats reads game:<id>:info keys: count and anonymous list of the games being played; 60 s cache; Home capsule"
type: project
---

# Games in progress counter

- Every game has a small summary key `game:<id>:info` next to its full
  state `game:<id>`: its stats ref, phase, scenario code, difficulty,
  Standard and Expert set codes (empty when absent), modular set codes and
  the identity codes of its loaded decks in seat order (`game.Summary`).
  The stats ref (`Game.StatsRef`) is 16 random hex characters drawn once
  by the server when it creates the game, unrelated to the game id and
  never sent to viewers. The store writes the summary with the game and
  gives it the game's TTL: `Create` sets both keys in one Lua script (SET
  NX on the game, then the summary), `Update` sets it in the game's MULTI,
  `Touch` expires both keys in one MULTI. A game without a summary is not
  counted.
- `Store.GameSummaries` walks `game:*:info` with `SCAN ... COUNT 1000`,
  MGETs each batch and drops duplicate keys, so the figure is exact. It
  never reads a game value (30 KB to over 1 MB each). Expired or
  undecodable values are skipped.
- `GET /api/stats` replies
  `{"games": N, "playing": [{"ref", "heroes": [{"hero", "alterEgo"}],
  "scenario", "difficulty", "sets": [...]}]}`:
  - `games` is the number of games in the playing phase, so it always
    equals the length of `playing`. Lobby and ended games (ended games
    stay one hour) appear nowhere.
  - Every empty list and every empty string is left out (`omitempty`):
    with no game being played the reply is exactly `{"games":0}`. Only
    `games` is always there.
  - `playing` holds one anonymous entry per game in the playing phase:
    first its `ref`, which tells games apart from one call to the next
    and never leads to the game (absent for a game without one); then
    English names from the embedded catalog: `heroes`, the identity
    card's hero face and alter-ego face (absent when it has none), sorted by
    hero then alter-ego; the scenario name; the difficulty as stored
    (`standard` or `expert`); `sets`, the names of the Standard set
    (Standard, Standard II, Standard III), the Expert set (Expert, Expert
    II) and the modular sets, sorted alphabetically. A set the game plays
    without, and any unknown code, is left out. A Fear No Evil game names
    its Underling as the scenario and its main scheme set among the sets.
    Entries are sorted by `ref` (ref-less ones first, by their other
    fields), so the reply is stable from one call to the next. Entries
    carry no game id, player name, deck name, deck URL or token.
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
