// Test helpers for lib/platform: jsdom's navigator is a desktop browser's, so another device is
// set by hand, as own properties of the navigator that shadow its getters.

import type { DeviceHints } from './platform';

const DEVICE_PROPERTIES = ['userAgent', 'platform', 'maxTouchPoints', 'standalone'] as const;

/** An iPad in Safari, which asks for desktop sites: it reports a Mac, with a touch screen. */
export const IPAD: DeviceHints = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
    'Version/18.0 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
};

/** Makes the navigator report that device, opened from the Home Screen when `standalone`. */
export function setDevice(device: DeviceHints, standalone = false): void {
  const values = { ...device, standalone };
  for (const name of DEVICE_PROPERTIES) {
    Object.defineProperty(navigator, name, { value: values[name], configurable: true });
  }
}

/** Gives the navigator back its own device. */
export function resetDevice(): void {
  for (const name of DEVICE_PROPERTIES) {
    Reflect.deleteProperty(navigator, name);
  }
}
