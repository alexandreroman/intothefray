---
name: "Search fields offer no autocomplete or autosave"
description: "Filter fields: type=text, autocomplete=off, spellcheck=false, no autosave; covered by tests"
type: project
---

# Search fields offer no autocomplete or autosave

- Every search or filter field in the app (lobby "Filter by scenario or
  pack" and "Filter sets" in `ScenarioPicker.svelte`, the card box "Filter
  by name" in `CardBox.svelte`) is an `<input type="text">` that writes
  `autocomplete="off"` and `spellcheck="false"` and never sets Safari's
  `autosave` attribute.
- The attributes are written on each input; there is no shared helper.
- The component tests check all three attributes on each field.

**Why:** user decision: a filter query is throwaway; browser form history,
saved searches and spell-check underlines only get in the way of a quick
filter.

**How to apply:** a new search or filter field writes the same attributes
and gets the same test assertions. Fields that are not searches (player
name, deck link, invite link) are outside this rule.
