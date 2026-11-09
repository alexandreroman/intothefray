---
name: "Fullscreen on iPad"
description: "iPad: no Fullscreen button; Home shows an Add to Home Screen banner in a browser tab, news first"
type: project
---

# Fullscreen on iPad

- An iPad, in any of its browsers, gets no Fullscreen button in the top
  bar, opened from the Home Screen too. `web/src/lib/platform.ts` tells an
  iPad: "iPad" in the user agent, or a Mac user agent (or the `MacIntel`
  platform) with `maxTouchPoints > 1`, since iPadOS asks for desktop sites
  as a Mac. An iPhone has no element Fullscreen API: no button there
  either, and no banner. Desktop and Android keep the button.
- On an iPad in a browser tab (not standalone: `(display-mode:
  standalone)` or `navigator.standalone`), Home shows a banner, "Play full
  screen: add Into the Fray to your Home Screen.", in the What's new
  banner's slot and look (see [[project_whats_new]]). One banner shows at
  a time, the news banner first. Its text opens `HomeScreenDialog.svelte`
  (tap Share, choose Add to Home Screen, open the app from the Home
  Screen); "Got it" closes the dialog and leaves the banner. Its × stores
  `itf-home-screen-banner`: the banner never shows again in that browser.
- The Home Screen app runs standalone, with no browser bars, through the
  web app manifest (see [[project_touch_phone_table]]).

**Why:** every iPad browser is WebKit, and in element fullscreen WebKit
asks to leave it at every key pressed, on a hardware or on-screen
keyboard (table shortcuts, digits in the count dialog); a page cannot turn
that off. The Home Screen app gives the whole screen without it. The hint
lives on Home (user decision): the Home Screen app starts at Home and iOS
gives it storage of its own, so a game in progress does not follow it;
the moment to add it is before a game.

**How to apply:** a new full-screen feature skips iPads (`isIPad()`);
other iPad-only guidance goes through the same helpers, never a width or
touch query alone. A new Home banner takes its turn after the news one.
