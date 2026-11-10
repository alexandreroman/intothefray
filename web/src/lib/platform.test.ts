import {
  detectInstalledDisplayMode,
  installedDisplayMode,
  isAppleMobile,
  isInstalledApp,
  isIPad,
  isIPadDevice,
  markInstalledApp,
} from './platform';
import type { DeviceHints } from './platform';
import { IPAD, resetDevice, setDevice } from './platform.testing';

const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const CHROME_IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Mobile/15E148 Safari/604.1';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.6478.71 Mobile Safari/537.36';

describe('isIPadDevice', () => {
  it('knows an iPad in Safari asking for desktop sites by its touch screen', () => {
    expect(isIPadDevice(IPAD)).toBe(true);
  });

  it('knows an iPad that says so in its user agent', () => {
    expect(isIPadDevice({ userAgent: IPAD_UA, platform: 'iPad', maxTouchPoints: 5 })).toBe(true);
  });

  it('knows an iPad in Chrome, mobile or desktop site', () => {
    expect(isIPadDevice({ userAgent: CHROME_IPAD_UA, platform: 'iPad', maxTouchPoints: 5 })).toBe(
      true,
    );
    expect(
      isIPadDevice({ userAgent: CHROME_IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it('takes an iPhone for no iPad', () => {
    expect(isIPadDevice({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 })).toBe(
      false,
    );
  });

  it('takes a Mac, which has no touch screen, for no iPad', () => {
    expect(isIPadDevice({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
      false,
    );
  });

  it('takes an Android phone for no iPad', () => {
    expect(
      isIPadDevice({ userAgent: ANDROID_UA, platform: 'Linux armv81', maxTouchPoints: 5 }),
    ).toBe(false);
  });
});

describe('isIPad', () => {
  afterEach(resetDevice);

  it('reads the navigator', () => {
    expect(isIPad()).toBe(false);
    setDevice(IPAD);
    expect(isIPad()).toBe(true);
  });
});

const IPHONE: DeviceHints = { userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 };
const ANDROID: DeviceHints = { userAgent: ANDROID_UA, platform: 'Linux armv81', maxTouchPoints: 5 };

describe('isAppleMobile', () => {
  afterEach(resetDevice);

  it('knows an iPad and an iPhone', () => {
    setDevice(IPAD);
    expect(isAppleMobile()).toBe(true);
    setDevice(IPHONE);
    expect(isAppleMobile()).toBe(true);
  });

  it('takes an Android phone and a desktop for none', () => {
    expect(isAppleMobile()).toBe(false);
    setDevice(ANDROID);
    expect(isAppleMobile()).toBe(false);
  });
});

/** Answers the media queries listed, and only them, as matching. */
function matchOnly(...matching: string[]): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ media: query, matches: matching.includes(query) }) as MediaQueryList,
  );
}

const STANDALONE_QUERY = '(display-mode: standalone)';
const FULLSCREEN_QUERY = '(display-mode: fullscreen)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

describe('detectInstalledDisplayMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetDevice();
  });

  it('is undefined in a browser tab', () => {
    expect(detectInstalledDisplayMode()).toBeUndefined();
  });

  it('follows the standalone display mode', () => {
    matchOnly(STANDALONE_QUERY);
    expect(detectInstalledDisplayMode()).toBe('standalone');
  });

  it("follows Safari's own standalone flag when no display mode tells", () => {
    setDevice(IPAD, true);
    expect(detectInstalledDisplayMode()).toBe('standalone');
  });

  it("follows Safari's own standalone flag without matchMedia", () => {
    vi.stubGlobal('matchMedia', undefined);
    setDevice(IPAD, true);
    expect(detectInstalledDisplayMode()).toBe('standalone');
  });

  it('follows the fullscreen display mode on a touch screen', () => {
    matchOnly(FULLSCREEN_QUERY, COARSE_POINTER_QUERY);
    expect(detectInstalledDisplayMode()).toBe('fullscreen');
  });

  it('follows the fullscreen display mode on an iPad with a trackpad, its pointer fine', () => {
    // No iPad browser has a fullscreen of its own: at launch, the display mode is the app's.
    setDevice(IPAD);
    matchOnly(FULLSCREEN_QUERY);
    expect(detectInstalledDisplayMode()).toBe('fullscreen');
  });

  it("prefers the display mode, where it is reported, to Safari's flag", () => {
    setDevice(IPAD, true);
    matchOnly(FULLSCREEN_QUERY);
    expect(detectInstalledDisplayMode()).toBe('fullscreen');
  });

  it("takes a desktop tab in the browser's own fullscreen for a browser tab", () => {
    // F11 or a macOS full-screen window: the display mode is fullscreen, the pointer fine.
    matchOnly(FULLSCREEN_QUERY);
    expect(detectInstalledDisplayMode()).toBeUndefined();
  });

  it('is undefined without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(detectInstalledDisplayMode()).toBeUndefined();
  });
});

describe('the installed app mark', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDevice();
  });

  it('is absent in a browser tab', () => {
    markInstalledApp();
    expect(document.documentElement.hasAttribute('data-installed')).toBe(false);
    expect(installedDisplayMode()).toBeUndefined();
    expect(isInstalledApp()).toBe(false);
  });

  it('tells the standalone installed app', () => {
    matchOnly(STANDALONE_QUERY);
    markInstalledApp();
    expect(document.documentElement.dataset.installed).toBe('standalone');
    expect(installedDisplayMode()).toBe('standalone');
    expect(isInstalledApp()).toBe(true);
  });

  it('tells the fullscreen installed app', () => {
    matchOnly(FULLSCREEN_QUERY, COARSE_POINTER_QUERY);
    markInstalledApp();
    expect(document.documentElement.dataset.installed).toBe('fullscreen');
    expect(installedDisplayMode()).toBe('fullscreen');
    expect(isInstalledApp()).toBe(true);
  });

  it('stays as it was marked at launch, whatever the display mode turns into', () => {
    markInstalledApp();
    // The player pressed Fullscreen in a tab on a phone.
    matchOnly(FULLSCREEN_QUERY, COARSE_POINTER_QUERY);
    expect(isInstalledApp()).toBe(false);
  });
});

describe('the status bar blur mark', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDevice();
  });

  function hasStatusBlur(): boolean {
    return document.documentElement.hasAttribute('data-status-blur');
  }

  it('marks the installed app on an iPad, in the fullscreen display mode too', () => {
    setDevice(IPAD);
    matchOnly(FULLSCREEN_QUERY);
    markInstalledApp();
    expect(hasStatusBlur()).toBe(true);
  });

  it('marks the installed app on an iPhone', () => {
    setDevice(IPHONE);
    matchOnly(STANDALONE_QUERY);
    markInstalledApp();
    expect(hasStatusBlur()).toBe(true);
  });

  it('leaves the installed app on Android unmarked: a camera cutout has no blur', () => {
    setDevice(ANDROID);
    matchOnly(FULLSCREEN_QUERY, COARSE_POINTER_QUERY);
    markInstalledApp();
    expect(document.documentElement.dataset.installed).toBe('fullscreen');
    expect(hasStatusBlur()).toBe(false);
  });

  it('leaves a browser tab on an iPad unmarked', () => {
    setDevice(IPAD);
    markInstalledApp();
    expect(hasStatusBlur()).toBe(false);
  });
});
