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
- On the table, the bar has the same gutter on both sides of the window:
  it spans over the history panel and does not move when the panel
  collapses.

**Why:** a bar whose edges match the content reads as part of the page.

**How to apply:** a new screen with a top bar sets its column width and
gutter for the bar too; changing a screen's gutter moves both together.
