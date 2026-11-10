// Test helpers for lib/platform: jsdom's navigator is a desktop browser's, so another device is
// set by hand, as own properties of the navigator that shadow its getters. And jsdom's page is a
// browser tab's, so the installed app is marked by hand, as main.ts marks it at launch.

import { isAppleMobile, type DeviceHints, type InstalledDisplayMode } from './platform';

const DEVICE_PROPERTIES = ['userAgent', 'platform', 'maxTouchPoints', 'standalone'] as const;

/** An iPad in Safari, which asks for desktop sites: it reports a Mac, with a touch screen. */
export const IPAD: DeviceHints = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
    'Version/18.0 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
};

/**
 * Makes the navigator report that device. When `standalone`, the page was opened from the Home
 * Screen: the navigator carries Safari's flag, and the page is marked as the standalone installed
 * app, with the status bar's blur on Apple's devices.
 */
export function setDevice(device: DeviceHints, standalone = false): void {
  const values = { ...device, standalone };
  for (const name of DEVICE_PROPERTIES) {
    Object.defineProperty(navigator, name, { value: values[name], configurable: true });
  }
  if (standalone) {
    setInstalledApp('standalone', { statusBlur: isAppleMobile() });
  }
}

/**
 * Marks the page as launched as the installed app in that display mode, with the status bar's blur
 * of Apple's devices when `statusBlur`; `resetDevice` clears both marks.
 */
export function setInstalledApp(mode: InstalledDisplayMode, { statusBlur = false } = {}): void {
  const root = document.documentElement;
  root.dataset.installed = mode;
  if (statusBlur) {
    root.dataset.statusBlur = '';
  }
}

/** Gives the navigator back its own device, and the page back to a browser tab. */
export function resetDevice(): void {
  for (const name of DEVICE_PROPERTIES) {
    Reflect.deleteProperty(navigator, name);
  }
  delete document.documentElement.dataset.installed;
  delete document.documentElement.dataset.statusBlur;
}
