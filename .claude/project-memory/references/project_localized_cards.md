---
name: "Localized card names and images"
description: "Faces and index entries carry a localized map of overrides; Options picks the card language, English by default"
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
- The card language is the `itf-lang` pref, set in Options (English or
  Français), English by default. The interface stays in English.
- French: face names on the table and in history card parts (via
  `LogPart.ref`), pack, scenario and set names in the lobby and
  breadcrumbs. English: the interface, history verbs, deck and hero
  names from the deck, server error texts.

**Why:** the player wants French cards; English is the default and
always the fallback; one file with optional overrides is lighter than a
copy per language.

**How to apply:** a new language adds a `localized.<lang>` entry from
the generator and a value in `lib/lang.ts`; history text stays English
on the server, the client localizes card parts from their `ref`. See
[[reference_card_sources]].
