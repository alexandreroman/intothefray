import { clearPrefMemory } from './lib/prefs';

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

// lib/prefs keeps every value in memory too, for the page lifetime: without
// this, a value set by one test would still be read by the next.
beforeEach(() => {
  clearPrefMemory();
});

// jsdom lays nothing out, so no element is ever under a point; tests that
// need one install their own.
document.elementFromPoint ??= (): Element | null => null;
