import { installVisibleArea, onVisibleAreaChange, visibleRect, withinVisible } from './visibleArea';
import { mockVisualViewport } from './visibleArea.testing';

const page = document.documentElement;

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  page.classList.remove('fixed-screen', 'scroll-locked');
  page.style.removeProperty('--visible-top');
  page.style.removeProperty('--visible-height');
  document.body.replaceChildren();
});

/** The visual viewport's place, as installVisibleArea writes it for the stylesheets. */
function visibleVars(): { top: string; height: string } {
  return {
    top: page.style.getPropertyValue('--visible-top'),
    height: page.style.getPropertyValue('--visible-height'),
  };
}

describe('visibleRect', () => {
  it('is the visual viewport, in the window coordinates', () => {
    mockVisualViewport({ offsetLeft: 10, offsetTop: 120, width: 390, height: 400 });

    expect(visibleRect()).toEqual({ left: 10, top: 120, right: 400, bottom: 520 });
  });

  it('is the whole window without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);

    expect(visibleRect()).toEqual({ left: 0, top: 0, right: 800, bottom: 600 });
  });
});

describe('withinVisible', () => {
  it('cuts a room to the part of the window the user sees', () => {
    mockVisualViewport({ offsetTop: 100, width: 390, height: 400 });

    expect(withinVisible({ left: 0, top: 50, right: 390, bottom: 700 })).toEqual({
      left: 0,
      top: 100,
      right: 390,
      bottom: 500,
    });
  });

  it('leaves a room wholly out of sight empty, never inverted', () => {
    mockVisualViewport({ offsetTop: 0, width: 390, height: 400 });

    const room = withinVisible({ left: 0, top: 600, right: 390, bottom: 700 });

    expect(room.bottom).toBeGreaterThanOrEqual(room.top);
    expect(room.right).toBeGreaterThanOrEqual(room.left);
  });
});

describe('onVisibleAreaChange', () => {
  it('tells the listener when the visual viewport resizes or pans, until unsubscribed', () => {
    const viewport = mockVisualViewport({ height: 800 });
    const listener = vi.fn();

    const unsubscribe = onVisibleAreaChange(listener);
    viewport.resize({ height: 400 });
    viewport.scroll({ offsetTop: 120 });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    viewport.resize({ height: 800 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);

    expect(() => onVisibleAreaChange(vi.fn())()).not.toThrow();
  });
});

describe('installVisibleArea', () => {
  it('writes where the visual viewport is, and follows it as it resizes and pans', () => {
    const viewport = mockVisualViewport({ offsetTop: 0, height: 844 });

    uninstall = installVisibleArea();
    expect(visibleVars()).toEqual({ top: '0px', height: '844px' });

    viewport.resize({ height: 500 });
    expect(visibleVars()).toEqual({ top: '0px', height: '500px' });

    viewport.scroll({ offsetTop: 120 });
    expect(visibleVars()).toEqual({ top: '120px', height: '500px' });
  });

  it('removes them while the page is pinch-zoomed, and writes them again once back', () => {
    const viewport = mockVisualViewport({ height: 844 });
    uninstall = installVisibleArea();

    viewport.resize({ scale: 2, height: 422 });
    expect(visibleVars()).toEqual({ top: '', height: '' });

    viewport.resize({ scale: 1, height: 844 });
    expect(visibleVars()).toEqual({ top: '0px', height: '844px' });
  });

  it('writes nothing without a visual viewport', () => {
    vi.stubGlobal('visualViewport', undefined);

    uninstall = installVisibleArea();

    expect(visibleVars()).toEqual({ top: '', height: '' });
  });

  describe('scroll offset left by a focused field', () => {
    // jsdom does not scroll: the window's offset is stubbed, and scrollTo moves it.
    const scrollTo = vi.fn((x: number, y: number) => {
      vi.stubGlobal('scrollX', x);
      vi.stubGlobal('scrollY', y);
    });

    beforeEach(() => {
      scrollTo.mockClear();
      vi.stubGlobal('scrollTo', scrollTo);
      vi.stubGlobal('scrollX', 0);
      vi.stubGlobal('scrollY', 0);
    });

    /** Text fields in the page, as many as asked. */
    function fields(count: number): HTMLInputElement[] {
      return Array.from({ length: count }, () => {
        const input = document.createElement('input');
        input.type = 'text';
        document.body.append(input);
        return input;
      });
    }

    /** iOS scrolls the window to bring the field above the keyboard, even when it cannot scroll. */
    function scrolledByTheBrowser(y: number): void {
      vi.stubGlobal('scrollY', y);
    }

    it.each(['fixed-screen', 'scroll-locked'])(
      'scrolls a page that cannot scroll (%s) back once the field loses the focus',
      (pageClass) => {
        page.classList.add(pageClass);
        mockVisualViewport();
        const [field] = fields(1);
        uninstall = installVisibleArea();

        field!.focus();
        scrolledByTheBrowser(200);
        field!.blur();

        expect(scrollTo).toHaveBeenCalledWith(0, 0);
      },
    );

    it('scrolls it back again as the keyboard closes, for a second only', () => {
      vi.useFakeTimers();
      page.classList.add('fixed-screen');
      const viewport = mockVisualViewport({ height: 400 });
      const [field] = fields(1);
      uninstall = installVisibleArea();

      field!.focus();
      scrolledByTheBrowser(200);
      field!.blur();
      scrolledByTheBrowser(150);
      viewport.resize({ height: 844 });
      expect(scrollTo).toHaveBeenCalledTimes(2);
      expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

      vi.advanceTimersByTime(1500);
      scrolledByTheBrowser(150);
      viewport.resize({ height: 400 });
      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it('keeps the first offset while the focus moves from field to field', () => {
      page.classList.add('scroll-locked');
      vi.stubGlobal('scrollY', 40);
      mockVisualViewport();
      const [first, second] = fields(2);
      uninstall = installVisibleArea();

      first!.focus();
      scrolledByTheBrowser(200);
      second!.focus();
      expect(scrollTo).not.toHaveBeenCalled();

      scrolledByTheBrowser(260);
      second!.blur();
      expect(scrollTo).toHaveBeenCalledWith(0, 40);
    });

    it('does not scroll when the window has not moved', () => {
      page.classList.add('fixed-screen');
      mockVisualViewport();
      const [field] = fields(1);
      uninstall = installVisibleArea();

      field!.focus();
      field!.blur();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('leaves alone a page that scrolls on its own', () => {
      mockVisualViewport();
      const [field] = fields(1);
      uninstall = installVisibleArea();

      field!.focus();
      scrolledByTheBrowser(200);
      field!.blur();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('leaves the offset alone for a field that takes no text', () => {
      page.classList.add('fixed-screen');
      mockVisualViewport();
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      document.body.append(checkbox);
      uninstall = installVisibleArea();

      checkbox.focus();
      scrolledByTheBrowser(200);
      checkbox.blur();

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
