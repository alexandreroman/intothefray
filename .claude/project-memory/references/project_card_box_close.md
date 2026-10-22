---
name: "Close is the main button of a card box"
description: "Every card box footer shows Close in the primary style; other footer buttons are secondary"
type: project
---

# Close is the main button of a card box

- In every card box (pile search, browse, look at the top, stage choice,
  spectator boxes), the footer's Close button uses the primary style
  (`btn-primary compact`), the same as "Shuffle & close".
- A deck search ends on "Shuffle & close" (primary) beside "Close without
  shuffling" (secondary). "Shuffle into the encounter deck" in a set-aside
  box is secondary, beside the primary Close.

**Why:** the user wants one consistent main action to leave a box.

**How to apply:** a new footer button next to Close is secondary
(`.mfoot button:not(.btn-primary)`); only the way out of the box is
primary. Code: `web/src/table/CardBox.svelte`, `.mfoot`.
