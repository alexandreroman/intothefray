---
name: "Fullscreen on iPad and the Home Screen app"
description: "iPad: no Fullscreen button; Home shows an Add to Home Screen banner in a browser tab; installed app: Reload in the table bar"
type: project
---

# Fullscreen on iPad and the Home Screen app

- An iPad, in any of its browsers, gets no Fullscreen button in the top
  bar, opened from the Home Screen too. `web/src/lib/platform.ts` tells an
  iPad: "iPad" in the user agent, or a Mac user agent (or the `MacIntel`
  platform) with `maxTouchPoints > 1`, since iPadOS asks for desktop sites
  as a Mac. An iPhone has no element Fullscreen API: no button there
  either, and no banner. Desktop and Android browser tabs keep the
  button.
- On an iPad in a browser tab (not the installed app, `isInstalledApp()`
  in `lib/platform.ts`), Home shows a banner, "Play full screen: add Into
  the Fray to your Home Screen.", in the What's new
  banner's slot and look (see [[project_whats_new]]). One banner shows at
  a time, the news banner first. Its text opens `HomeScreenDialog.svelte`
  (tap Share, choose Add to Home Screen, open the app from the Home
  Screen); "Got it" closes the dialog and leaves the banner. Its × stores
  `itf-home-screen-banner`: the banner never shows again in that browser.
- The Home Screen app runs with no browser bars, in the manifest's
  fullscreen display mode (see [[project_home_screen_status_bar]],
  [[project_touch_phone_table]]).
- The installed app, in either display mode and on any device, shows a
  Reload icon button (`reload` icon, `data-tip` "Reload") in the table's
  top bar, just before End game; it reloads the page at once, with no
  confirmation. It belongs to the table only (TopBar's `reload` prop): the
  lobby, Options and About bars, and a browser tab, have none.
- The installed app in the fullscreen display mode gets no Fullscreen
  button: it already has the whole screen. In the standalone display mode
  (a desktop's installed app) the button stays, and under 360px wide
  (`NARROW_BAR_QUERY`) Reload and Fullscreen share one slot: Reload, or
  Exit fullscreen while fullscreen is on (see
  [[project_top_bar_auto_hide]]).

**Why:** every iPad browser is WebKit, and in element fullscreen WebKit
asks to leave it at every key pressed, on a hardware or on-screen
keyboard (table shortcuts, digits in the count dialog); a page cannot turn
that off. The Home Screen app gives the whole screen without it. The hint
lives on Home (user decision): the Home Screen app starts at Home and iOS
gives it storage of its own, so a game in progress does not follow it;
the moment to add it is before a game. The Home Screen app has no
browser bar to reload from and pull-to-refresh is unreliable there, so
the table offers Reload of its own; a reload during a game is safe (the
browser keeps the seat tokens, `itf-tokens`, and the game reconnects),
and only a game in progress needs it (user decision). Under 360px the
busiest table bar has no room for both buttons; in the standalone
display mode Fullscreen gains only the status bar, so Reload takes its
slot.

**How to apply:** a new full-screen feature skips iPads (`isIPad()`);
other iPad-only guidance goes through the same helpers, never a width or
touch query alone. A new Home banner takes its turn after the news one.
