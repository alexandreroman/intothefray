---
name: "No button alone on a line"
description: "Button and tile groups on touch screens never leave one alone beside a gap; the odd one out takes the whole width"
type: project
---

# No button alone on a line

- A group of buttons or tiles laid out in a grid never leaves a single one
  beside an empty gap (`web/src/lib/buttonGrid.ts`, attachment
  `buttonGrid`, `data-layout` on the group):
  - one: the whole width (`single`);
  - an even count: pairs (`pairs`);
  - three: one row when each gets at least 96 px (`MIN_BUTTON_WIDTH`) and
    every label fits on one line (`row`), else a pair and the last one
    the whole width (`pairs-last`);
  - five or more (odd): pairs, the last one the whole width
    (`pairs-last`);
  - labels too long to sit two side by side: one per line (`column`).
- The last one takes the whole width, never the first: the default
  action stands out by nothing but its place.
- Labels never wrap: one line, an ellipsis only when even a full-width
  tile is too narrow.
- Users: the touch inspector's entry groups (see
  [[project_touch_phone_table]]). Card box footers in dock mode and the
  hand sheet's Play and Discard share the width evenly: a lone Close or
  Play takes the whole width.

**Why:** a button alone on a line looks ugly (user decision).

**How to apply:** a new button group on a touch screen uses `buttonGrid`
(styles keyed on `:global([data-layout='…'])`, since the attribute is set
at runtime) or an even split; desktop layouts change only when they show
the same orphan.
