---
name: "Pages end with their content"
description: "No empty scroll room under a page: heights follow the visible height (dvh, fixed inset 0); absolute boxes in CSS columns have a positioned ancestor"
type: project
---

# Pages end with their content

- A page scrolls exactly as far as its content, on every browser.
- Screen heights follow the visible height: `.screen-page` is
  `min-height: 100dvh` (with a `100vh` fallback before it), and the table
  pins `.app` with `position: fixed; inset: 0` under `html.fixed-screen`.
  Chrome on iOS reports `100vh` and `100lvh` taller than anything it shows
  (768 px for a visible 688 px on an iPad in landscape, its toolbar's
  80 px), so a height in `vh` or `lvh` there gives empty scroll room.
  The installed web app's `html` (`min-height: 100lvh` under
  `display-mode: standalone`) is the one exception, as it has no toolbar
  (see [[project_home_screen_status_bar]]).
- An absolutely positioned element inside a CSS multi-column container
  (`column-count`) has a positioned ancestor inside the columns. The
  lobby's villain list (`.vlist` in `ScenarioPicker.svelte`) is in
  columns, and each row (`.vrow`) is `position: relative` to hold its
  `.sr-only` "Not supported yet" label. Without one, WebKit (iPad Safari
  and Chrome iOS alike) places the element as if the columns were stacked
  into one, hundreds of pixels below its row, and the page grows by the
  difference.

**Why:** an iPad player could scroll past the end of the lobby into an
empty band; measured on the device, the band came from such a label.

**How to apply:** size full-screen layers with `dvh` or a fixed layer with
`inset: 0`, never `vh` or `lvh` alone; when adding columns, or something
absolute (an `.sr-only` label, a badge) inside columns, make its row or
item the positioned box. Check a suspected band on the device by comparing
`document.documentElement.scrollHeight` with the content's bottom.
