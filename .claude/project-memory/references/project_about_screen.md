---
name: "About screen"
description: "/about: Apache-2.0 open source, card data credits, unofficial fan project disclaimer; no tech stack"
type: project
---

# About screen

- The About screen lives at `/about` (`web/src/screens/About.svelte`),
  reached from an "About" secondary button on Home, next to Options, and
  from a small "About Into the Fray" link in the Options footer, beside
  the version line.
- It has three sections, laid out like the Options rows: Open source
  (Apache-2.0, links to the license and the GitHub repository), Card data
  (the community projects the cards come from) and Unofficial fan project
  (not affiliated with or endorsed by Fantasy Flight Games or Marvel).
- The card data credits are a `SOURCES` array in the component: marvelcdb
  (card data, decks and French names: fr.marvelcdb.com is the same site,
  one entry), Cerebro, mc4db, cgbuilder and OCTGN (scans of the French
  cards). Cerebro links to its GitHub repository
  (`https://github.com/UnicornSnuggler/Cerebro`); OCTGN shows without a
  link.
- The page lists no tech stack: no languages, frameworks, libraries or
  fonts.
- External links open in a new tab (`target="_blank"`,
  `rel="noopener noreferrer"`).

**Why:** the project is open source and builds on community card data;
the page credits those projects and states the project is unofficial.
The user wants the tech stack left out of it.

**How to apply:** a new card data source in `internal/packgen/` gets an
entry in `SOURCES`. Naming providers here is consistent with
[[project_provider_neutral_copy]], since this text is about them. The
mc4db credit link is a plain page link; the packs never link to
mc4db (see [[reference_card_sources]]).
