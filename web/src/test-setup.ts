import { clearPrefMemory } from './lib/prefs';

/** Stands in for what jsdom lacks, and resets the preferences between tests. */
function setUpDom(): void {
  // jsdom has no ResizeObserver, which Svelte's size bindings (bind:clientWidth)
  // rely on. Nothing is laid out in jsdom anyway, so the stand-in observes nothing.
  class NoResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  globalThis.ResizeObserver ??= NoResizeObserver;

  // jsdom has no matchMedia either. By default no media query matches, which is
  // the wide-screen layout; tests of the narrow one install their own lists.
  window.matchMedia ??= (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      media: query,
      matches: false,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    });

  // Preferences last for the whole test file: localStorage, which getPref reads
  // first, and the in-memory copy lib/prefs keeps for the page lifetime. Without
  // this, a value set by one test would still be read by the next.
  beforeEach(() => {
    localStorage.clear();
    clearPrefMemory();
  });

  // jsdom lays nothing out, so no element is ever under a point; tests that
  // need one install their own.
  document.elementFromPoint ??= (): Element | null => null;

  // jsdom does not scroll: its window.scrollTo only reports that it is not implemented. Tests of a
  // scroll spy on it.
  window.scrollTo = (): void => {};
}

// Tests of the build (seo.test.ts) run in Node, with no DOM to set up.
if (typeof window !== 'undefined') {
  setUpDom();
}
