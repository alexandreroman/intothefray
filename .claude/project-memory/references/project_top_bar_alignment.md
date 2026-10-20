---
name: "Top bar alignment"
description: "The top bar's first item and last button line up with the screen's content edges"
type: project
---

# Top bar alignment

- The top bar's first item (the back button when there is one, else the
  logo) sits on the content's left edge, its last button on the content's
  right edge, at every width.
- Each screen owns its column's width and gutter and shares them with the
  top bar, so the values live once per screen.
- On the table, the bar's left edge is the play area's padding and its
  icons sit 8px from the window's right edge, over the history panel: they
  do not move when the panel collapses.
- On a short table screen that keeps the history panel (wider than 900px,
  up to 500px tall), the bar floats over the play area only: its icons sit
  on the play area's 24px gutter and the history panel runs from the top
  of the window.

**Why:** a bar whose edges match the content reads as part of the page.

**How to apply:** a new screen with a top bar sets its column width and
gutter for the bar too; changing a screen's gutter moves both together.
