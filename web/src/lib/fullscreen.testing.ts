// Test helpers for the Fullscreen API: jsdom has none, so what the document reports is set by hand.

/** Sets what the document reports as its fullscreen element, under the standard or the WebKit name. */
export function setFullscreenElement(
  name: 'fullscreenElement' | 'webkitFullscreenElement',
  value: Element | null,
): void {
  Object.defineProperty(document, name, { value, configurable: true });
}
