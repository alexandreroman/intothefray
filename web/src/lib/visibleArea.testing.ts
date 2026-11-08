// Test helpers for the visual viewport: jsdom has none, so the part of the window the user sees is
// set by hand, as a phone's on-screen keyboard or a pinch zoom would change it.

/** The part of the window the user sees, in px in the window's coordinates. */
export interface TestVisibleArea {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
}

/** A visual viewport that moves and resizes when told to, firing what a browser would. */
export class FakeVisualViewport extends EventTarget implements TestVisibleArea {
  offsetLeft = 0;
  offsetTop = 0;
  width: number;
  height: number;
  scale = 1;

  constructor(area: Partial<TestVisibleArea>) {
    super();
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    Object.assign(this, area);
  }

  /** Resizes it (a keyboard showing or hiding, a pinch zoom) and fires resize. */
  resize(area: Partial<TestVisibleArea>): void {
    Object.assign(this, area);
    this.dispatchEvent(new Event('resize'));
  }

  /** Pans it over the window and fires scroll. */
  scroll(area: Partial<TestVisibleArea>): void {
    Object.assign(this, area);
    this.dispatchEvent(new Event('scroll'));
  }
}

/**
 * Gives the window a visual viewport, the whole window unless told otherwise, and returns it.
 * `vi.unstubAllGlobals()` takes it away.
 */
export function mockVisualViewport(area: Partial<TestVisibleArea> = {}): FakeVisualViewport {
  const viewport = new FakeVisualViewport(area);
  vi.stubGlobal('visualViewport', viewport);
  return viewport;
}
