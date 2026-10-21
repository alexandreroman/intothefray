---
name: "Escape in fullscreen"
description: "Escape closes the open layer and keeps fullscreen; layers that close on Escape call preventDefault"
type: project
---

# Escape in fullscreen

- Every layer that closes something on Escape calls
  `event.preventDefault()`: `Dialog.svelte`, `ContextMenu.svelte`, the
  ScenarioPicker menu, the pinned hand (`Hand.svelte`), and the table
  through `handleKey` in `web/src/table/keys.ts` when
  `interaction.escape()` reports that it dropped something (a pinned pill,
  a group, the band, an arrow, a tap selection).
- One Escape both lowers a pinned hand and drops the table's selection: a
  tap on a hand card pins the hand and tap-locks the card together.
- `web/src/lib/fullscreen.ts` locks Escape with the Keyboard Lock API while
  in fullscreen, and leaves fullscreen itself on an Escape no layer
  prevented.

**Why:** a browser in fullscreen takes Escape to leave it: an open dialog
or menu then stays open.

**How to apply:** a new Escape-dismissable layer calls `preventDefault()`
when it closes. Keyboard Lock is Chromium only: on Firefox and Safari
Escape leaves fullscreen, an accepted limitation.
