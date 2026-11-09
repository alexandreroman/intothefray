---
name: "Dialogs take the focus without a focus ring"
description: "Every dialog moves the focus in with focusVisible: false, whatever opened it; focusOnOpen picks the element"
type: project
---

# Dialogs take the focus without a focus ring

- Every dialog (`Dialog.svelte`) moves the focus into its box with
  `focus({ focusVisible: false })`, whether the pointer, a touch or a
  keyboard shortcut opened it. The focus trap, Enter and Escape behave as
  usual; Tab or the arrows inside show the ring, as the browser has it.
- Tab and Shift + Tab in a dialog or modal sheet show the ring, even on its
  only control: `trapTab` focuses with `{ focusVisible: true }`, and a
  control that Tab wraps onto while it has the focus is blurred first, since
  a focus call on the focused element changes nothing.
- A dialog's content picks the element focused on open with
  `{@attach focusOnOpen}` from `web/src/components/modal.svelte.ts` (the
  confirm dialog's Cancel, the count dialog's value). Attachments run before
  the dialog's `onMount`, which leaves a focus already inside the box.
  `focusOnOpen` stands in for native `autofocus`, which focuses with the
  browser's own ring rules.
- Modal sheets (`Sheet.svelte`) focus their panel the same way. Card boxes in
  touch mode focus their box quietly too.
- Context menus are not dialogs: opened from the keyboard, their first item
  takes the focus with its ring.
- A dialog closed by the pointer gives the focus back to its opener without
  a ring as well (see [[project_press_releases_focus]]).

**Why:** a ring on the control a dialog focuses as it opens reads as a
selection nobody made; the keyboard has not moved inside the box yet.

**How to apply:** a new dialog content element that wants the focus on open
takes `{@attach focusOnOpen}`; any other focus moved in as a dialog or modal
sheet opens passes `{ focusVisible: false }`.
