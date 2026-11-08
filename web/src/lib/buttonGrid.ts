/**
 * How a group of buttons stands in a grid, never leaving one button alone
 * beside an empty cell:
 * - single: one button, the whole width;
 * - pairs: an even count, two by two;
 * - row: three side by side, when each has room enough for its label;
 * - pairs-last: two by two, the last one the whole width on a line of its own
 *   (three without room for a row, five or more);
 * - column: one per line, the whole width, when two labels do not fit side by
 *   side.
 */
type ButtonLayout = 'single' | 'pairs' | 'row' | 'pairs-last' | 'column';

/** How many buttons of a group have room side by side, their labels whole. */
type PerLine = 1 | 2 | 3;

/** The narrowest a button may be in a row of three, in CSS px: narrower, it reads as cramped. */
export const MIN_BUTTON_WIDTH = 96;

/** The layout of `count` buttons, `perLine` of which have room side by side. */
export function buttonLayout(count: number, perLine: PerLine): ButtonLayout {
  if (count <= 1) {
    return 'single';
  }
  if (perLine === 1) {
    return 'column';
  }
  if (count === 3 && perLine === 3) {
    return 'row';
  }
  if (count % 2 === 0) {
    return 'pairs';
  }
  return 'pairs-last';
}

/**
 * Svelte attachment for a group of buttons, its children: the element's
 * data-layout names their layout (buttonLayout), kept up as the element
 * resizes or its buttons change. The component styles each layout; in
 * "pairs-last", its last child spans the grid, so that the first one, often
 * the default, does not stand out.
 *
 * How many buttons have room side by side is measured there: each layout is
 * tried, widest first, then the layout chosen, in one go, so no frame shows a
 * trial. A button fits when no text in it is cut short, which shows as the
 * button or an element in it overflowing its box; in a row of three, it must
 * also be at least MIN_BUTTON_WIDTH px wide. The labels must not wrap
 * (white-space: nowrap), or a long one would fit on two lines.
 */
export function buttonGrid(node: HTMLElement): () => void {
  function textFits(button: Element): boolean {
    const boxes = [button, ...button.querySelectorAll('*')];
    return boxes.every((box) => box.scrollWidth <= box.clientWidth);
  }

  function fitsInRow(button: Element): boolean {
    return button.getBoundingClientRect().width >= MIN_BUTTON_WIDTH && textFits(button);
  }

  /** How many of the buttons have room side by side, tried in the element itself. */
  function perLine(buttons: Element[]): PerLine {
    if (buttons.length <= 1) {
      return 1;
    }
    if (buttons.length === 3) {
      node.dataset.layout = buttonLayout(3, 3);
      if (buttons.every(fitsInRow)) {
        return 3;
      }
    }
    node.dataset.layout = buttonLayout(buttons.length, 2);
    return buttons.every(textFits) ? 2 : 1;
  }

  function layOut(): void {
    const buttons = [...node.children];
    node.dataset.layout = buttonLayout(buttons.length, perLine(buttons));
  }

  // Only a change of width changes the room for the buttons: the height changes with the layout
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
}
