---
name: "A table press releases a control's focus"
description: "Pressing a card, pile, hand card, marker or box tile blurs a control focused elsewhere; fields and dialogs keep it"
type: project
---

# A table press releases a control's focus

- A press on a card, a pile, a hand card, a marker (`interaction.press`)
  or a card box tile (`CardBox.svelte`) calls `releaseFocus` from
  `web/src/lib/releaseFocus.ts` right after its `preventDefault()`: a
  control focused elsewhere, such as a top-bar button (Fullscreen), loses
  the focus.
- A text field (`isTyping`, shared with `keys.ts`), a focus inside an open
  dialog or menu (`[aria-modal="true"]`, `[role="dialog"]`,
  `[role="menu"]`) and a focus inside the pressed element keep it.
- Keyboard navigation (Tab order, `:focus-visible` styling) is untouched.

**Why:** `preventDefault()` on `pointerdown` (no text selection, no native
image drag) also cancels the browser's focus move. The last clicked button
then stays focused, shows its focus ring at the first table key, and Space
or Enter activate it again (fullscreen toggles).

**How to apply:** a new `pointerdown` handler that calls
`preventDefault()` on a table element calls
`releaseFocus(event.currentTarget)` after it.
