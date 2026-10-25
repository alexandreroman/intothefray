// The screen sizes and the viewer's preferences the app adapts to, as media queries.

/**
 * A phone either way up: up to 600px wide (a phone upright) or up to 500px tall (a phone on its
 * side, 320 to 440px tall, where a tablet on its side is 744px tall or more). On such a screen
 * the top bar hides on scroll (TopBar.svelte) and floats over the table, whose hand cards follow
 * the window and whose bottom controls gather in one bar (Table.svelte).
 */
export const SMALL_SCREEN_QUERY = '(max-width: 600px), (max-height: 500px)';

/** Whether the viewer asks the system for reduced motion: moves then happen at once, without animation. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
