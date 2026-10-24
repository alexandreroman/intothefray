---
name: "Truncated text shows a tooltip"
description: "Text cut with an ellipsis gets a tooltip with the full text (use:overflowTip)"
type: project
---

# Truncated text shows a tooltip

- Any text that can be cut with an ellipsis carries the `use:overflowTip`
  action (`web/src/lib/overflowTip.ts`): while the text is cut, a tooltip
  shows its full text; when it fits, no tooltip shows. An element with a
  `data-tip` of its own keeps it.
- Hero names stay on one line, cut with an ellipsis, in the lobby and at
  the table.
- History lines in the side panel expand in place to their full text on
  hover, instead of a tooltip.

**Why:** user decision, for readability.

**How to apply:** new single-line truncated text (`white-space: nowrap`,
`text-overflow: ellipsis`, `min-width: 0` in flex or grid) adds
`use:overflowTip`.
