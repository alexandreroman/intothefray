// The device and the way the page was opened, where the top bar needs them. Both stay the same for
// the page's whole life: they are read once, never followed.

/** What `isIPadDevice` reads of the navigator. */
export interface DeviceHints {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

// Safari on iOS flags a page opened from the Home Screen, which TypeScript's DOM library omits.
type StandaloneNavigator = Navigator & { standalone?: boolean };

/**
 * Whether these hints are an iPad's, in any of its browsers (all of them WebKit). iPadOS asks for
 * desktop sites by default and then reports a Mac: only its touch screen tells it apart, as no Mac
 * has one. An iPhone says so in its user agent and is not an iPad.
 */
export function isIPadDevice(hints: DeviceHints): boolean {
  if (hints.userAgent.includes('iPad')) {
    return true;
  }
  const looksLikeMac = hints.userAgent.includes('Macintosh') || hints.platform === 'MacIntel';
  return looksLikeMac && hints.maxTouchPoints > 1;
}

/** Whether the page runs on an iPad. */
export function isIPad(): boolean {
  return isIPadDevice(navigator);
}

/**
 * Whether the page was opened as a web app from the Home Screen, rather than in a browser tab:
 * the standard display mode, or the flag older Safari on iOS sets instead.
 */
export function isStandalone(): boolean {
  // jsdom, and very old browsers, have no matchMedia.
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return displayMode || (navigator as StandaloneNavigator).standalone === true;
}
