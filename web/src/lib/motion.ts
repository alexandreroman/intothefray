import type { AnimationConfig } from 'svelte/animate';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';
import { fade, scale, slide, type TransitionConfig } from 'svelte/transition';

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

// The page items below (the lobby's seats, deck slots and set chips) appear, leave or swap in
// APPEAR_MS; they open, close or glide to a new place in MOVE_MS, as the lobby's recap slides open.
const APPEAR_MS = 200;
const MOVE_MS = 250;

/** An item arriving or leaving: it fades in from a little smaller, or out to it. */
export function pop(node: Element): TransitionConfig {
  return scale(node, { start: 0.96, duration: motionMs(APPEAR_MS), easing: cubicOut });
}

/** An item opening or closing: it unfolds from no height and fades in, or folds and fades out. */
export function unfold(node: Element): TransitionConfig {
  const opening = slide(node, { duration: motionMs(MOVE_MS), easing: cubicOut });
  // The slide is all but opaque from its first frame: the opacity given after it wins.
  return { ...opening, css: (t, u) => `${opening.css?.(t, u) ?? ''};opacity: ${t}` };
}

/** One of two contents that replace each other in place: it fades in, or out. */
export function swapFade(node: Element): TransitionConfig {
  return fade(node, { duration: motionMs(APPEAR_MS), easing: cubicOut });
}

/**
 * Glides an item of a keyed each from where it was to its new place, as `flip` does, but without
 * scaling it: an item that changes size, like a seat card over one more column, takes its new size
 * at once, so that its content never stretches. It plays on a transform, after layout, so that it
 * never fights a grid: the grid places the item, the glide only shows it travelling there.
 */
export function glide(
  _node: Element,
  { from, to }: { from: DOMRect; to: DOMRect },
): AnimationConfig {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  return {
    duration: motionMs(MOVE_MS),
    easing: cubicOut,
    css: (_t, u) => `transform: translate(${u * dx}px, ${u * dy}px)`,
  };
}
