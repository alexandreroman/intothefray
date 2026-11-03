---
name: "What's new"
description: "Home-only news dialog, unread dot and one-time banner; hand-written gameplay-only entries; no unread count"
type: project
---

# What's new

- News live in a dialog opened from Home only
  (`web/src/components/WhatsNewDialog.svelte`): no route, no link from
  Options or the top bar, nothing during a game.
- Home tells a visitor about news in two ways: a Fray red dot on a square
  icon-only "What's new" button (sparkle icon, `data-tip` tooltip), and a
  slim banner above the buttons: its text "New: title" is itself the
  button that opens the news, beside a dismiss ×, in a small type
  (13px). The banner spans exactly the button row, its right edge on the
  What's new button's; its
  title wraps rather than widening it. Dismissing the banner keeps the
  dot; opening the dialog clears both. The dialog tags the entries unread
  at opening as "New".
- Options and About turn into icon-only squares with tooltips whenever
  their row lacks the room for the labelled buttons: a container query on
  `.start`, not a viewport breakpoint. Their labels stay as visually
  hidden accessible names. Start and the three squares stay on one row
  down to a 320px screen: narrower steps of the same container query
  tighten the gaps and shrink Start (no arrow) and the squares. Below
  that, the three squares wrap together under Start; labelled buttons
  never wrap.
- No unread count shows anywhere, in the dot or in the button's
  accessible name.
- Entries are hand-written in `web/src/lib/news.ts`, newest first, with
  an id `YYYY-MM-DD-slug`: ids sort as strings, and an entry is unread
  when its id is greater than the last seen one. A test enforces the id
  format, uniqueness and order.
- Entries announce player-facing gameplay features only (scenarios,
  table features, card languages); site pages such as About and
  developer-facing changes get no entry.
- Per-visitor state lives in two preferences (`lib/newsState.svelte.ts`):
  `itf-news-seen` (newest entry seen) and `itf-news-banner` (newest entry
  whose banner was dismissed). A first visit stores the newest entry as
  seen, so a new visitor has nothing unread; without storage every page
  load is a first visit.

**Why:** visitors are anonymous and return between games; a quiet signal
on Home tells them what changed without interrupting play, and only news
that matters to a player is worth their attention.

**How to apply:** a new entry goes at the top of `NEWS`, dated on the day
its feature reaches `main`, written for players
(see [[project_provider_neutral_copy]]). The Home buttons stay on one row
on a desktop; see [[project_readme_screenshot]] when Home changes.
