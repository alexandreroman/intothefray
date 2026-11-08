---
name: "Add a set menu groups modular sets by pack"
description: "Lobby Add a set menu: sets under sticky pack names, release order; ★ sets in their pack; stays on screen"
type: project
---

# Add a set menu groups modular sets by pack

- The lobby's "+ Add a set" menu (`modularGroups` in
  `web/src/components/lobby/ScenarioPicker.svelte`) lists the addable
  modular sets under their pack's name, packs in release order
  (`index.packs`), sets in `index.sets` order inside a pack, as the villain
  list groups scenarios.
- A pack with no modular set left to add shows no group.
- Each group is a `role="group"` labelled by its pack name (`.menu .mpk`),
  a sticky heading that is not a button; the filter field and the set
  buttons are the only focusable items.
- A "Filter sets" field tops the menu, outside its scrolling list
  (`.mlist`, which fades its edges with `scrollFade`); it is empty each
  time the menu opens, and focused then outside touch mode; in touch mode
  the host taps it, so no keyboard covers the list on open (see
  [[project_touch_keyboard]]). Matching ignores case and accents
  and looks in a set's shown name and its English name, through the
  app's one filter helper (see [[project_search_fields]]); a query found
  in a pack's name, shown or English, keeps all that pack's addable
  sets. Packs left with no set disappear; "No matching set"
  shows when the query leaves none, "No set to add" when nothing is
  addable at all.
- In the field, ArrowDown goes to the first set shown, Enter adds the set
  when exactly one matches, Escape closes the menu as anywhere.
- The menu takes the size of its unfiltered list, measured while the field
  is empty, and holds it while the host filters, so it stays put.
- The scenario's recommended sets sit in their own pack, marked
  "★ recommended"; the menu has no group or ordering of its own for them.
- With a scenario that names `mainSchemes` (Fear No Evil's Underlings),
  the menu also offers those main scheme sets while none is chosen, marked
  "main scheme" on the row and on the chip; adding one also adds its
  recommended modulars, starred.
- The menu stays whole inside the visible page: between the top bar and
  the window's bottom (`room` prop from `Lobby.svelte`), under its button
  or above it when only that side fits, else on the roomier side cut to
  scroll; shifted to stay inside the window (`placeUnder` in
  `web/src/lib/dropdown.ts`). That room is cut to the part of the window
  the user sees (`withinVisible`), above an on-screen keyboard, and the
  menu is placed again as that part changes.

**Why:** user decision: the full list is long, and the pack is how players
find a set; the star is enough to spot a recommendation. The filter finds a
set by name in either language without scrolling; a menu that keeps its
size does not jump under the pointer.

**How to apply:** a new kind of addable set, or another long pick list in
the lobby, follows the same pack grouping and heading markup.
