---
name: "Compact top bar hides on scroll"
description: "On screens up to 600px wide or 500px tall, the top bar slides away on scroll down and returns when needed"
type: project
---

# Compact top bar hides on scroll

- Compact screens are those up to 600px wide (the top bar's own breakpoint)
  or up to 500px tall (phones in landscape). `SMALL_SCREEN_QUERY` in
  `web/src/lib/screen.ts` is its single source for scripts, shared with
  the table's small screen layout; other screens always show the bar. The
  items the bar drops follow the width only.
- On a compact screen the bar slides out of view (a transform, no layout
  change) once the content scrolls down by 10px past the bar's height.
- It comes back on an upward scroll of 10px, near the top (within the bar's
  height), when the content cannot scroll, while keyboard focus is inside
  it, and while its End game dialog is open. Rubber-band overscroll at
  either end never moves it.
- The bar follows whichever element scrolls: the window on the lobby and
  the options, the play area on the table. On a compact table the bar
  floats over the play area, and overlays at its top (the catalog notice,
  the preview) stay clear of it while it shows; larger screens give it its
  own row.

**Why:** decided with the user: a phone gains the bar's room
for content while scrolling, and the bar is back as soon as it is needed.

**How to apply:** a new screen with a top bar on a scrolling element passes
that element to the bar; anything floating at the top of the table follows
the room the bar takes (`--bar-room`).
