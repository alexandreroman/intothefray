---
name: "Views are immutable and share unchanged cards"
description: "Raw session view, never changed in place; unchanged cards and piles keep their object; one CardView redraws per moved card"
type: project
---

# Views are immutable and share unchanged cards

- `GameSession.view` is `$state.raw`: a view is only ever replaced, never
  changed in place, and neither are its card and pile arrays or their items.
- Each server view reuses the previous object for every table card and pile
  whose data is unchanged (`reuseUnchanged` in `lib/reuse.ts`).
- The table keeps a card's or pile's drawn copy while its source object and
  drawn height stay the same (`shownItems` in `table/rows.ts`), so a view
  that moves one card redraws one `CardView`.
- `byId` (`lib/byId.ts`) caches a Map by id per array, keyed by the array's
  identity; lookups in the render path go through it, never through a
  `find` per card.

**Why:** the table's cost grows with its cards: a one-card update on
120 cards drops from about 20 ms to 2 ms (jsdom), on 400 cards from about
93 ms to 4.6 ms.

**How to apply:** build new objects for any change to a view, a card or a
pile; never sort, push or assign into them. `Table.render.test.ts` pins one
`CardView` re-derivation per one-card update; `pnpm bench` in `web/` times
it (`BENCH_CARDS` sets the card count).
