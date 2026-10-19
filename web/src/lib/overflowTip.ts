import type { ActionReturn } from 'svelte/action';

/**
 * Svelte action for a single line of text cut with an ellipsis: while the text
 * is cut, the element's data-tip holds its full text, so the page's Tooltip
 * shows it; once the text fits, the tip goes. An element with a data-tip of
 * its own keeps it untouched.
 */
export function overflowTip(node: HTMLElement): ActionReturn {
  // The tip this action set last, to tell it from a tip of the element's own.
  let tipSet: string | undefined;

  function refresh(): void {
    const current = node.dataset.tip;
    if (current !== undefined && current !== tipSet) {
      return;
    }
    // One pixel of slack: widths are rounded, and a text that fits may round over its box.
    const cut = node.scrollWidth > node.clientWidth + 1;
    if (cut) {
      tipSet = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      node.dataset.tip = tipSet;
    } else {
      tipSet = undefined;
      delete node.dataset.tip;
    }
  }

  // pointerover rather than pointerenter: it reaches the element before it bubbles up to the
  // Tooltip's document listener, so the tip is in place from the first hover.
  node.addEventListener('pointerover', refresh);
  return {
    destroy() {
      node.removeEventListener('pointerover', refresh);
    },
  };
}
