---
name: "Home Screen status bar"
description: "The installed web app uses black-translucent: the page runs under the status bar, and every top inset keeps --status-room clear"
type: project
---

# Home Screen status bar

- `index.html` sets `apple-mobile-web-app-status-bar-style` to
  `black-translucent`: the installed web app draws the page under the
  status bar, whose height is `env(safe-area-inset-top)`. A Safari tab and
  a desktop report 0.
- iOS reads the status-bar style when the app is added to the Home Screen.
  An installed app keeps the style it was added with until it is removed
  and added again; a relaunch does not apply a new one.
- In the installed app, iPadOS blurs the page under the status bar and
  24 px past its safe area (on a 32 pt inset: dimmed 0–32, a gradient
  blur 32–56, sharp from about 58). The page cannot turn the blur off.
- `--status-room` (`tokens.css`) is the single source for the room at the
  top: `env(safe-area-inset-top)`, plus 24 px under
  `(display-mode: standalone)` when the inset is non-zero. Every top inset
  uses it, never `env(safe-area-inset-top)` itself: the top bar pads its
  top by it (its 56 px row below), Home pads its page, the end screen, the
  connection status, dialogs and sheets add it, and the table counts it in
  the bar's room (`--bar-start`, `--bar-room`).
- A fixed band as tall as `--status-room` paints the top bar's background
  behind the status bar, so that scrolled content never shows under the
  clock or its blur. The app root draws it for the screens outside the
  table (`App.svelte`, hidden under `html.fixed-screen`); the table draws
  its own inside `.app`, whose stacking context would put the root band
  over the table's dialog and sheet scrims. Both sit at z-index 4000: over
  the page layers, under the token pill, menus, sheets, dialogs and
  tooltips.
- In the installed app, `html` is at least `100lvh` tall. iPadOS clamps
  the layout viewport to the document's height between the screen less
  the top inset and the screen, so a document shorter than the screen (the
  table, Home) leaves an empty band at the bottom; `100lvh` keeps it whole.
  It applies to the installed app only: in a browser tab, `lvh` can exceed
  the visible height (see [[project_page_height]]).

**Why:** measured on iPadOS 27: with `black`, the status bar covers the
page while the top safe area reads 0, which no CSS can avoid;
`black-translucent` reports it as the top safe area (32 pt on an iPad
in landscape). The blur reaching past that inset cut the top of the bar's
logo and buttons until the bar kept the 24 px clear (checked with the
user on the device).

**How to apply:** anything new at the top of a screen (fixed, sticky, or a
page without the top bar) adds `var(--status-room)` to its top. A test in
`web/src/page.test.ts` fails on any other use of
`env(safe-area-inset-top)`.
