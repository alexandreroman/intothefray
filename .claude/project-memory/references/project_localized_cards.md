---
name: "Localized card names and images"
description: "Faces and index entries carry a localized map of overrides; Options offers English and French, French images from the CDN"
type: project
---

# Localized card names and images

- A face keeps its English `name`, `subname` and `images`; its optional
  `localized` map, keyed by language code, holds overrides
  (`localized.fr`: name, subname, images). A field is written only when
  it differs from English. Packs stay one file per pack in
  `packs/dist/en/`.
- Index entries (packs, scenarios, sets) carry `localized.<lang>.name`.
- French images are the OCTGN FR scans on the image CDN: packgen sets
  `localized.fr.images` from the French entry of
  `packs/images/manifest.json` (see [[project_image_cdn]]). A face
  without a French scan has no French image override and shows its
  English image.
- The client tries the localized images first, then the English ones,
  URL by URL; a missing override falls back to English.
- The card language is the `itf-lang` pref, English by default. The
  interface stays in English.
- Options offers the languages marked `offered` in `LANGS`
  (`web/src/lib/lang.ts`): English and French. It hides its Language
  section while only one is offered, and `storedLang()` reads a stored
  language that is not offered as English.
- With French chosen: face names on the table and in history card parts
  (via `LogPart.ref`), pack, scenario and set names in the lobby and
  breadcrumbs are French. English: the interface, history verbs, deck and
  hero names from the deck, server error texts.

**Why:** the player wants French cards; English is the default and
always the fallback; one file with optional overrides is lighter than a
copy per language. A language is offered only when its images are
available; `offered` in `LANGS` is the switch.

**How to apply:** a new language adds a `localized.<lang>` entry from
the generator and an entry in `LANGS` (`lib/lang.ts`) with `offered`;
history text stays English on the server, the client localizes card
parts from their `ref`. See [[reference_card_sources]].
