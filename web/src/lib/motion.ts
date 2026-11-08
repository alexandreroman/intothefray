import { prefersReducedMotion } from 'svelte/motion';

/**
 * How long a motion lasts, in ms: no time under reduced motion, nor where the
 * browser has no Web Animations, which Svelte's transitions play on (jsdom),
 * so that every change is instant.
 */
export function motionMs(ms: number): number {
  if (prefersReducedMotion.current || typeof Element.prototype.animate !== 'function') {
    return 0;
  }
  return ms;
}
