---
name: "Home Screen status bar"
description: "Fullscreen manifest; installed app marked at launch (data-installed); black-translucent; every top inset keeps --status-room clear"
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
- The manifest's `"display"` is `fullscreen`, on every platform: Android
  gives the installed app the whole screen, status and navigation bars
  hidden. iPadOS 27 matches `(display-mode: fullscreen)` yet keeps the
  status bar, its 32 pt inset and its blur: no page setting hides it
  there. Every installed-app rule below holds in either display mode.
- `markInstalledApp()` (`web/src/lib/platform.ts`, run once from
  `main.ts` before any screen) marks the installed app on `html` as
  `data-installed="standalone"` or `"fullscreen"`. CSS targets
  `:root[data-installed]`, scripts `isInstalledApp()` and
  `installedDisplayMode()`: neither runs a display-mode query of its own.
  `(display-mode: fullscreen)` also matches a browser tab in fullscreen,
  through the Fullscreen API or the browser's own (F11); a page load
  always leaves element fullscreen, so the launch read takes the
  fullscreen display mode for the installed app only on a coarse primary
  pointer or an iPad, which have no browser fullscreen of their own.
  Safari's `navigator.standalone` is the last fallback. On an iPhone or
  an iPad (`isAppleMobile()`), the installed app also gets
  `data-status-blur`.
- The 56 pt above the bar's row (32 pt inset + 24 px) is the room the
  blur needs (user decision): a smaller margin gains 3–4 pt at most
  before the top of the bar's buttons blurs.
- `--status-room` (`tokens.css`) is the single source for the room at the
  top: `env(safe-area-inset-top)` (a notch, a camera cutout, a status
  bar), plus 24 px in Apple's installed app
  (`:root[data-installed][data-status-blur]`) when the inset is non-zero:
  Android has no status bar blur, and its fullscreen app can report a
  camera cutout as the top inset. Every top inset
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
user on the device). The fullscreen display mode is the user's choice
for Android, where it gives the whole screen; the iPad keeps its status
bar in it, so its rules follow the installed app, not one display mode.
A live display-mode query would treat a browser tab in fullscreen as the
installed app (a Reload button, 24 px of room), hence the launch mark.

**How to apply:** anything new at the top of a screen (fixed, sticky, or a
page without the top bar) adds `var(--status-room)` to its top. A test in
`web/src/page.test.ts` fails on any other use of
`env(safe-area-inset-top)`.
