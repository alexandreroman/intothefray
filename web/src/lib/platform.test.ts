import { isIPad, isIPadDevice, isStandalone } from './platform';
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

describe('isStandalone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetDevice();
  });

  it('is false in a browser tab', () => {
    expect(isStandalone()).toBe(false);
  });

  it('follows the standalone display mode', () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (query) =>
          ({ media: query, matches: query === '(display-mode: standalone)' }) as MediaQueryList,
      );
    expect(isStandalone()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)');
  });

  it("follows Safari's own standalone flag", () => {
    setDevice(IPAD, true);
    expect(isStandalone()).toBe(true);
  });

  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isStandalone()).toBe(false);
  });
});
