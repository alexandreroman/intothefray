---
name: "No button alone on a line"
description: "Button groups on touch screens never leave one button alone on the last line"
type: project
---

# No button alone on a line

- A group of buttons laid out in a grid never leaves a single button alone
  on its last line (`web/src/lib/buttonGrid.ts`, attachment `buttonGrid`,
  `data-layout` on the group):
  - one button: the whole width;
  - an even count: pairs;
  - three: one row when each gets at least 96 px (`MIN_BUTTON_WIDTH`) and
    its label fits on one line, else the default (first) button full width
    on top, the other two as a pair;
  - five or more (odd): the default button full width on top, the rest in
    pairs.
- The default button comes first (`inspector.splitEntries`).
- Labels never wrap inside a button: one line, an ellipsis if they must.
- Card box footers in dock mode share the width evenly: a lone Close takes
  the whole width.

**Why:** a button alone on a line looks ugly (user decision).

**How to apply:** a new button group on a touch screen uses `buttonGrid`
(styles keyed on `:global([data-layout='…'])`, since the attribute is set
at runtime) or an even split; desktop layouts change only when they show
the same orphan.
