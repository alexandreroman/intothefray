---
name: "French name sources"
description: "Precedence of the French name sources in packgen, curated card names, subnames without an English one"
type: project
---

# French name sources

- Pack and set names: curated `packs/curated/names.json` > mc4db FR >
  fr.marvelcdb > cgbuilder. Card face names: curated `names.json`
  (`cards`, by marvelcdb face code) > mc4db FR > fr.marvelcdb.
  Subnames: mc4db FR > fr.marvelcdb.
- A source name counts only when it differs from English by more than
  case, spacing or apostrophe kind; an empty name never hides a lower
  source.
- A French subname counts on a face without an English subname:
  fr.marvelcdb names alter egos that marvelcdb leaves bare (Amadeus Cho
  10011, Piotr Rasputin 32048).
- Face codes in `names.json` are the card code for single-faced cards,
  the card code plus a letter otherwise (Loki the Miscreant is
  `55030a`); an unknown code fails the build.

**Why:** the sources often drop French accents or misspell names;
curated names fix them by hand. Requiring an English subname dropped
legitimate French alter ego names.

**How to apply:** fix a bad French card name with a `cards` entry in
`names.json`, never by editing `packs/dist/`.
