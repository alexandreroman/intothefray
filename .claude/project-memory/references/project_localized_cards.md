---
name: "Localized card names and images"
description: "Faces and index entries carry a localized map of overrides; Options offers English only while French images are unavailable"
type: project
---

# Localized card names and images

- A face keeps its English `name`, `subname` and `images`; its optional
  `localized` map, keyed by language code, holds overrides
  (`localized.fr`: name, subname, images). A field is written only when
  it differs from English. Packs stay one file per pack in
  `packs/dist/en/`.
- Index entries (packs, scenarios, sets) carry `localized.<lang>.name`.
- The client tries the localized images first, then the English ones,
  URL by URL; a missing override falls back to English.
- The card language is the `itf-lang` pref, English by default. The
  interface stays in English.
- Options offers only the languages marked `offered` in `LANGS`
  (`web/src/lib/lang.ts`), and hides its Language section while only one
  is offered. French is not offered: mc4db answers every French image URL
  with a placeholder picture (see [[reference_card_sources]]). The French
  data stays in the packs and `storedLang()` reads a stored French as
  English. Setting French's `offered` back to `true` offers it again,
  once the French images are available; three tests (English only
  offered, the French fallback, the hidden Options section) then flip.
- With French offered: face names on the table and in history card parts
  (via `LogPart.ref`), pack, scenario and set names in the lobby and
  breadcrumbs are French. English: the interface, history verbs, deck and
  hero names from the deck, server error texts.

**Why:** the player wants French cards; English is the default and
always the fallback; one file with optional overrides is lighter than a
copy per language. User decision: French stays in the data and the code
but is not offered while its images are unavailable, and is offered
again by hand.

**How to apply:** a new language adds a `localized.<lang>` entry from
the generator and an entry in `LANGS` (`lib/lang.ts`) with `offered`;
history text stays English on the server, the client localizes card
parts from their `ref`. See [[reference_card_sources]].
