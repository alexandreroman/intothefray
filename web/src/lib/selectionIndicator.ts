import type { ActionReturn } from 'svelte/action';

/** The selected option of a switch: a pressed button, or a checked radio. */
const SELECTED = '[aria-pressed="true"], [aria-checked="true"]';

/**
 * Svelte action for a switch, a control where one option is selected (a segmented control,
 * swatches): it places the control's indicator, its child marked `data-indicator`, over the
 * selected option. When the selection changes, the indicator slides from the old option to the
 * new one (`data-slides`, styled in styles/tokens.css). Its first place is taken without sliding,
 * a change of layout moves it at once, and so does every change under a reduced-motion
 * preference.
 *
 * The control must be positioned (`position: relative`): the indicator is placed in its box.
 */
export function selectionIndicator(node: HTMLElement): ActionReturn {
  const indicator = indicatorOf(node);

  function place(slide: boolean): void {
    const selected = node.querySelector<HTMLElement>(SELECTED);
    // From no selection, the indicator appears where it belongs: there is nothing to slide from.
    const wasShown = !indicator.hidden;
    indicator.hidden = selected === null;
    if (!selected) {
      return;
    }
    if (slide && wasShown && !prefersReducedMotion()) {
      indicator.dataset.slides = '';
    } else {
      delete indicator.dataset.slides;
    }
    indicator.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`;
    indicator.style.width = `${selected.offsetWidth}px`;
    indicator.style.height = `${selected.offsetHeight}px`;
  }

  place(false);

  // A mutation is a new selection (or new options): the indicator slides there. A resize is a
  // new layout: following it with a slide would only lag behind.
  const mutations = new MutationObserver(() => place(true));
  mutations.observe(node, {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: ['aria-pressed', 'aria-checked'],
  });
  const resizes = new ResizeObserver(() => place(false));
  resizes.observe(node);

  return {
    destroy() {
      mutations.disconnect();
      resizes.disconnect();
    },
  };
}

function indicatorOf(node: HTMLElement): HTMLElement {
  const indicator = node.querySelector<HTMLElement>(':scope > [data-indicator]');
  if (!indicator) {
    throw new Error('selectionIndicator: the control has no [data-indicator] child');
  }
  return indicator;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
