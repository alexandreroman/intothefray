---
name: "Scrolling lists fade at their edges"
description: "Card box lists and the lobby villain list fade out where more lies beyond an edge (scrollFade)"
type: project
---

# Scrolling lists fade at their edges

- Two scrolling lists fade to transparent over 32px at an edge only while
  more of the list lies beyond it (no fade at the top when scrolled to the
  top, none at the bottom when scrolled to the bottom, none when the list
  fits):
  - the card list of every card box (`.mgrid` in
    `web/src/table/CardBox.svelte`);
  - the lobby's villain scenario list (`.villains` in
    `web/src/components/lobby/ScenarioPicker.svelte`), whose scenarios sit
    in pack groups (`.pack > .vgrid > .vil`).
- The `{@attach scrollFade}` attachment (`web/src/lib/scrollFade.ts`) sets
  `data-scroll-fade` to the faded edges ("top", "bottom", both or none) on
  scroll, resize and any DOM insertion or removal inside the list (its
  MutationObserver watches the whole subtree, so a filter emptying part of a
  nested group counts); `web/src/styles/tokens.css` draws the fade with
  `mask-image` driven by `@property` lengths that transition (none under
  `prefers-reduced-motion`).
- The mask covers everything inside the list, sticky headers included (the
  villain list's sticky pack names); the dragged tile and the tile context
  menu of a card box sit outside the list, out of the mask.

**Why:** user decision, so items come and go with a fade as a
list scrolls.

**How to apply:** another scrolling list that should fade its edges adds
`{@attach scrollFade}`, nested items included; anything that must not fade
stays outside it.
