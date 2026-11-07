---
name: "Search fields offer no autocomplete or autosave"
description: "Filter fields: type=text, autocomplete=off, spellcheck=false, no autosave; covered by tests; one accent-insensitive matcher"
type: project
---

# Search fields offer no autocomplete or autosave

- Every search or filter field in the app (lobby "Filter by scenario or
  pack" and "Filter sets" in `ScenarioPicker.svelte`, the card box "Filter
  by name" in `CardBox.svelte`) is an `<input type="text">` that writes
  `autocomplete="off"` and `spellcheck="false"` and never sets Safari's
  `autosave` attribute.
- The attributes are written on each input, with no shared helper for
  them.
- The component tests check all three attributes on each field.
- Every filter matches through one helper, `matchesQuery` in
  `web/src/lib/textFilter.ts`: it ignores case and accents (`fold`: NFD,
  marks stripped) and looks in the name shown and the English one. The
  "Filter sets" field matches set and pack names, the scenario filter
  scenario and pack names, the card box filter face names.

**Why:** user decision: a filter query is throwaway; browser form history,
saved searches and spell-check underlines only get in the way of a quick
filter. One matcher gives every filter the same behaviour: "ecraser"
finds "Écraser" on a keyboard without accents, and a player finds a
localized card, set or scenario by the name they know.

**How to apply:** a new search or filter field writes the same attributes,
gets the same test assertions and matches through `matchesQuery`. Fields
that are not searches (player name, deck link, invite link) are outside
this rule.
