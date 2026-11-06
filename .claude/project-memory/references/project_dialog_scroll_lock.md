---
name: "The page is frozen under a dialog"
description: "While any dialog is open the page behind it never scrolls; openModal() locks it, keeping offset and scrollbar room"
type: project
---

# The page is frozen under a dialog

- While any dialog is open, the page behind it does not scroll: wheel,
  trackpad, touch, keys and scrollbar drags do nothing. Lists inside the
  dialog (What's new entries, card box lists) still scroll on their own.
- The dialog counter is the single place of the lock: `openModal()` in
  `web/src/components/modal.svelte.ts` locks on the first open dialog and
  unlocks on the last close. Every dialog goes through it via
  `components/Dialog.svelte`, and every modal bottom sheet via
  `components/Sheet.svelte`; the hand sheet (`modal={false}`) leaves the
  page and the table live, so a hand card can be dragged out of it.
- The lock is a class on `<html>` (`tokens.css`): `scroll-locked` hides the
  page overflow and its rubber band (`overscroll-behavior: none`, iOS). The
  scroll offset stays as it is and no scroll event fires, so the compact top
  bar's auto-hide does not move.
- `scroll-locked-gutter` (`scrollbar-gutter: stable`) is added only when the
  page shows a classic scrollbar (`innerWidth > clientWidth`), so the
  content never shifts sideways; a page with an overlay scrollbar or none
  reserves no room.
- The table needs nothing more: `html.fixed-screen` already hides the page
  overflow, and dialogs sit outside `.tablewrap`, so a scroll on their
  backdrop never chains into the play area.

**Why:** user decision: the background stays frozen while a dialog is open.

**How to apply:** a new dialog uses `Dialog.svelte` (or `openModal()`) and
gets the lock for free; no screen or dialog locks scrolling by itself.
