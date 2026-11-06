/**
 * How a group of buttons stands in a grid of two columns, never leaving one
 * button alone on the last line:
 * - single: one button, the whole width;
 * - pairs: an even count, two by two;
 * - row: three side by side, when each has room enough for its label;
 * - lead: the first one the whole width on a line of its own, then the others
 *   two by two (three without room for a row, five or more).
 */
export type ButtonLayout = 'single' | 'pairs' | 'row' | 'lead';

/** The narrowest a button may be in a row of three, in CSS px: narrower, it reads as cramped. */
export const MIN_BUTTON_WIDTH = 96;

/** The layout of `count` buttons; `rowFits` tells whether three of them have room side by side. */
export function buttonLayout(count: number, rowFits: boolean): ButtonLayout {
  if (count <= 1) {
    return 'single';
  }
  if (count % 2 === 0) {
    return 'pairs';
  }
  if (count === 3 && rowFits) {
    return 'row';
  }
  return 'lead';
}

/**
 * Svelte attachment for a group of buttons, its children: the element's
 * data-layout names their layout (buttonLayout), kept up as the element
 * resizes or its buttons change. The component styles each layout; in "lead",
 * its first child spans the grid, so the default button goes first.
 *
 * Whether three buttons fit in a row is measured there: the row is tried, then
 * the layout chosen, in one go, so no frame shows the trial. A button fits when
 * it is at least `minWidth` px wide and no text in it is cut short, which shows
 * as the button or an element in it overflowing its box. The labels must not
 * wrap (white-space: nowrap), or a long one would fit on two lines.
 */
export function buttonGrid({ minWidth = MIN_BUTTON_WIDTH }: { minWidth?: number } = {}) {
  return (node: HTMLElement): (() => void) => {
    function fitsInRow(button: Element): boolean {
      if (button.getBoundingClientRect().width < minWidth) {
        return false;
      }
      const boxes = [button, ...button.querySelectorAll('*')];
      return boxes.every((box) => box.scrollWidth <= box.clientWidth);
    }

    function layOut(): void {
      const buttons = [...node.children];
      if (buttons.length !== 3) {
        node.dataset.layout = buttonLayout(buttons.length, false);
        return;
      }
      node.dataset.layout = 'row';
      node.dataset.layout = buttonLayout(3, buttons.every(fitsInRow));
    }

    // Only a change of width changes the room for a row: the height changes with the layout
    // itself, and laying out again on it would only find the same.
    let width: number | null = null;
    function onResize(): void {
      const current = node.getBoundingClientRect().width;
      if (current !== width) {
        width = current;
        layOut();
      }
    }

    layOut();
    const resizes = new ResizeObserver(onResize);
    resizes.observe(node);
    // A button that comes or goes, or a label that changes; the layout itself only sets an
    // attribute of the element, which is not watched.
    const mutations = new MutationObserver(layOut);
    mutations.observe(node, { childList: true, subtree: true, characterData: true });

    return () => {
      resizes.disconnect();
      mutations.disconnect();
      delete node.dataset.layout;
    };
  };
}
