// Test helpers for overflowTip: jsdom lays nothing out, so widths are set by hand.

/** Gives an element a text wider than its box (scrollWidth) or within it (clientWidth). */
export function setWidths(element: Element, widths: { scroll: number; client: number }): void {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: widths.scroll });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: widths.client });
}

/** Makes an element's text overflow its box, as when it is cut with an ellipsis. */
export function cutShort(element: Element): void {
  setWidths(element, { scroll: 300, client: 100 });
}
