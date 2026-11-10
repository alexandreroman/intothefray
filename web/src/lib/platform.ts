// The device and the way the page was opened, where the top bar needs them. Both stay the same for
// the page's whole life. The way it was opened is read once, at launch, and marked on the root
// element (`data-installed`, and `data-status-blur` on Apple's devices): the single source for CSS
// and, through `installedDisplayMode`, for scripts. And the reload that the installed app has no
// browser bar for.

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

/** Whether the page runs on an iPhone, an iPod touch or an iPad: Apple's mobile devices. */
export function isAppleMobile(): boolean {
  return isIPad() || /iPhone|iPod/.test(navigator.userAgent);
}

/**
 * How the installed app runs, as its manifest asks or as the system opens it: `standalone` keeps
 * the system's bars, `fullscreen` takes the whole screen (Android hides both system bars; iPadOS
 * keeps its status bar).
 */
export type InstalledDisplayMode = 'standalone' | 'fullscreen';

/**
 * Whether a media query matches: never without matchMedia, which jsdom and very old browsers lack.
 */
function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/**
 * How the page was launched as the installed web app, rather than in a browser tab: the standard
 * display mode, or the flag older Safari on iOS sets instead. Undefined in a browser tab.
 */
export function detectInstalledDisplayMode(): InstalledDisplayMode | undefined {
  if (matches('(display-mode: standalone)')) {
    return 'standalone';
  }
  // (display-mode: fullscreen) also matches a browser tab in fullscreen (Media Queries 5), entered
  // by requestFullscreen() (the top bar's Fullscreen) or by the browser itself (F11, a macOS
  // full-screen window). A page load always leaves element fullscreen, so at launch only the
  // browser's own fullscreen can fake it, and only desktop browsers have one: their primary pointer
  // is fine, hence the coarse pointer. An iPad has no browser fullscreen of its own either, but a
  // trackpad can make its pointer fine: an iPad counts whatever its pointer. Chrome on desktop
  // opens an installed app with a fullscreen manifest standalone anyway. Read later, after the
  // player pressed Fullscreen in a tab, the query would take that tab for the installed app: it is
  // read at launch only, never followed.
  if (matches('(display-mode: fullscreen)') && (matches('(pointer: coarse)') || isIPad())) {
    return 'fullscreen';
  }
  // Last: the display mode, where the browser reports it, is the more precise answer. The flag
  // covers older Safari, which has no display-mode query, and any Home Screen app the queries miss.
  if ((navigator as StandaloneNavigator).standalone === true) {
    return 'standalone';
  }
  return undefined;
}

/**
 * Marks the root element with the installed app's display mode (`data-installed`), and, on an
 * Apple mobile device, with its status bar's blur (`data-status-blur`): iOS and iPadOS blur the
 * page 24px past the installed app's top safe area. Elsewhere, as on Android, that safe area is a
 * camera cutout or the status bar, with no blur. Called once, at launch.
 */
export function markInstalledApp(): void {
  const mode = detectInstalledDisplayMode();
  if (mode === undefined) {
    return;
  }
  const root = document.documentElement;
  root.dataset.installed = mode;
  if (isAppleMobile()) {
    root.dataset.statusBlur = '';
  }
}

/** How the installed app runs, as marked at launch; undefined in a browser tab. */
export function installedDisplayMode(): InstalledDisplayMode | undefined {
  // Only markInstalledApp writes the mark, with an InstalledDisplayMode.
  return document.documentElement.dataset.installed as InstalledDisplayMode | undefined;
}

/** Whether the page runs as the installed web app, in either display mode. */
export function isInstalledApp(): boolean {
  return installedDisplayMode() !== undefined;
}

/**
 * Reloads the page, as a browser's Reload does. A function of its own, so that a test can stand in
 * for it: jsdom's location cannot be replaced, nor its reload spied on.
 */
export function reloadPage(): void {
  location.reload();
}
