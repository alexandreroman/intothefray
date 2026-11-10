---
name: "A table press releases a control's focus"
description: "Table presses and shortcuts blur a control focused elsewhere; chrome buttons blur after a pointer click; hovers need a real hover"
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
- A table shortcut (`handleKey` in `web/src/table/keys.ts`, a key that
  `tableKey` or `playerKey` handles) calls `releaseFocus(null)` with its
  `preventDefault()`. Other keys (Tab, Enter, Space) keep the focus.
- Chrome buttons outside dialogs and menus (top bar, `Segmented`, zoom
  control, history toggles and Undo buttons, narrow Undo and History, hero
  steps, the phone dock's hand, Undo and History buttons, the History
  sheet's Undo button) carry `{@attach pointerBlur}`: a pointer click
  (`detail > 0`) blurs them, a keyboard activation (`detail === 0`) keeps
  the focus. The history toggle refocuses its replacement button on
  keyboard activation only.
- Hover looks (button washes, rings, zooms, colours) sit under
  `@media (hover: hover)`: a touch screen keeps matching `:hover` on the
  element tapped last until the next tap elsewhere, which would read as a
  focus that stayed. The hand fan's `.hcard:hover` layout rules are the
  exception (see [[project_hand_sizes]]).
- A new view hovers what lies under a mouse or a pen at rest
  (`rehoverUnderPointer` in `Table.svelte`): the white hover ring follows
  the card that lands there. A finger leaves no pointer at rest:
  `interaction.pointerMoved` records no touch coordinates, so a new view
  never rings the card a finger dropped or tapped.
- Keyboard navigation (Tab order, `:focus-visible` styling) is untouched.

**Why:** `preventDefault()` on `pointerdown` (no text selection, no native
image drag) also cancels the browser's focus move. The last clicked button
then stays focused, shows its focus ring at the first table key, and Space
or Enter activate it again (fullscreen toggles). A lifted finger points at
nothing: a ring on the card under its last spot reads as a stuck outline.

**How to apply:** a new hover look goes under `@media (hover: hover)`.
A new `pointerdown` handler that calls
`preventDefault()` on a table element calls
`releaseFocus(event.currentTarget)` after it.
A new chrome icon button outside dialogs and menus takes
`{@attach pointerBlur}`.
Code that hovers from a remembered pointer position reads
`interaction.pointer`, which is not a number after a touch.
