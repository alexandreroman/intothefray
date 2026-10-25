// Test helpers for the media queries of the screen: jsdom has no screen, so its size and its
// pointer are set by hand.

import { tick } from 'svelte';

/** A window the media queries are asked about, in px; `touch` is a touch screen's finger. */
export interface TestScreen {
  width: number;
  height: number;
  touch?: boolean;
}

/** Whether one feature of a media query, as "max-width: 900px", holds on that screen. */
function holds(feature: string, on: TestScreen): boolean {
  const [name = '', value = ''] = feature.split(':').map((part) => part.trim());
  switch (name) {
    case 'max-width':
      return on.width <= Number.parseFloat(value);
    case 'max-height':
      return on.height <= Number.parseFloat(value);
    case 'hover':
      return value === (on.touch ? 'none' : 'hover');
    case 'pointer':
      return value === (on.touch ? 'coarse' : 'fine');
    default:
      // prefers-reduced-motion and the like.
      return false;
  }
}

/** Whether a media query matches that screen: features joined by "and", queries by ",". */
function matchesScreen(query: string, on: TestScreen): boolean {
  return query
    .split(',')
    .some((part) =>
      [...part.matchAll(/\(([^)]*)\)/g)].every(([, feature]) => holds(feature ?? '', on)),
    );
}

/** A media query list for some screen, which can turn into another one. */
class FakeMediaQueryList extends EventTarget {
  onchange = null;
  matches: boolean;

  constructor(
    readonly media: string,
    on: TestScreen,
  ) {
    super();
    this.matches = matchesScreen(media, on);
  }

  addListener(): void {}
  removeListener(): void {}

  resize(on: TestScreen): void {
    this.matches = matchesScreen(this.media, on);
    this.dispatchEvent(new Event('change'));
  }
}

/** Stubs the window's size; `vi.unstubAllGlobals()` gives it back. */
function stubWindow(on: TestScreen): void {
  vi.stubGlobal('innerWidth', on.width);
  vi.stubGlobal('innerHeight', on.height);
}

/**
 * Answers every media query as that screen would and gives the window its size, and returns the
 * lists handed out. The window's size is stubbed: `vi.unstubAllGlobals()` gives it back.
 */
export function mockScreen(on: TestScreen): FakeMediaQueryList[] {
  stubWindow(on);
  const lists: FakeMediaQueryList[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = new FakeMediaQueryList(query, on);
    lists.push(list);
    return list as unknown as MediaQueryList;
  });
  return lists;
}

/** Turns the window into another screen: its size and its media queries follow, and it is told it resized. */
export async function resizeScreen(lists: FakeMediaQueryList[], on: TestScreen): Promise<void> {
  stubWindow(on);
  for (const list of lists) {
    list.resize(on);
  }
  window.dispatchEvent(new Event('resize'));
  await tick();
}

// Screens.
/** A phone upright: narrow. */
export const PHONE: TestScreen = { width: 390, height: 844, touch: true };
/** A phone on its side: short, and narrower than the history column needs. */
export const LANDSCAPE_PHONE: TestScreen = { width: 844, height: 390, touch: true };
/**
 * A tablet upright, with a mouse: narrow (900 px wide or less) for the table, but neither narrow
 * enough nor short enough for the compact top bar.
 */
export const TABLET: TestScreen = { width: 800, height: 1000 };
export const DESKTOP: TestScreen = { width: 1280, height: 800 };
