// Test helpers for the media queries of the screen's size: jsdom has no screen, so its size is
// set by hand.

import { tick } from 'svelte';

/** A window's size, in px. */
export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Whether a media query matches a window of that size. Only `max-width` and `max-height` are
 * understood, joined by `and` within a query and by commas between queries: a query with
 * neither, as a preference, never matches.
 */
export function matchesScreen(media: string, size: ScreenSize): boolean {
  return media.split(',').some((query) => matchesOneQuery(query, size));
}

function matchesOneQuery(query: string, size: ScreenSize): boolean {
  const limits = [...query.matchAll(/max-(width|height):\s*(\d+)px/g)];
  if (limits.length === 0) {
    return false;
  }
  return limits.every(([, dimension, max]) => {
    const actual = dimension === 'width' ? size.width : size.height;
    return actual <= Number(max);
  });
}

/** A media query list for a window of some size, which can be resized. */
export class FakeMediaQueryList extends EventTarget {
  onchange = null;
  matches: boolean;

  constructor(
    readonly media: string,
    size: ScreenSize,
  ) {
    super();
    this.matches = matchesScreen(media, size);
  }

  addListener(): void {}
  removeListener(): void {}

  resize(size: ScreenSize): void {
    this.matches = matchesScreen(this.media, size);
    this.dispatchEvent(new Event('change'));
  }
}

/** Gives the window that size, as its media queries see it, and returns the lists handed out. */
export function mockScreen(size: ScreenSize): FakeMediaQueryList[] {
  const lists: FakeMediaQueryList[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = new FakeMediaQueryList(query, size);
    lists.push(list);
    return list as unknown as MediaQueryList;
  });
  return lists;
}

/** Resizes the window to that size. */
export async function resizeScreen(lists: FakeMediaQueryList[], size: ScreenSize): Promise<void> {
  for (const list of lists) {
    list.resize(size);
  }
  await tick();
}

// Window sizes, in px.
/** A phone upright: narrow. */
export const PHONE: ScreenSize = { width: 390, height: 844 };
/** A phone on its side (iPhone 16): short, and narrower than the history column needs. */
export const LANDSCAPE_PHONE: ScreenSize = { width: 852, height: 393 };
/** A large phone on its side (iPhone 16 Pro Max): short, and wide enough for the history column. */
export const LANDSCAPE_LARGE_PHONE: ScreenSize = { width: 932, height: 430 };
/** A tablet upright: neither narrow enough nor short enough for the compact top bar. */
export const TABLET: ScreenSize = { width: 768, height: 1024 };
export const DESKTOP: ScreenSize = { width: 1280, height: 800 };
