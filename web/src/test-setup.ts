// jsdom has no ResizeObserver, which Svelte's size bindings (bind:clientWidth)
// rely on. Nothing is laid out in jsdom anyway, so the stand-in observes nothing.
class NoResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= NoResizeObserver;
