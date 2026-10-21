// Scroll offsets are fractional on a zoomed or high-density screen: a list scrolled to within a
// pixel of an edge is at that edge.
const SLACK = 1;

/**
 * Svelte attachment for a scrolling list: its edges fade out where more of the list lies beyond
 * them, so that items come and go with a fade as it scrolls. The element's data-scroll-fade
 * names those edges ("top", "bottom", both or none), kept up as the list scrolls, resizes or
 * gains and loses items; styles/tokens.css draws the fade.
 *
 * Items are watched as the element's children: a change deeper down that alters the list's
 * height is not seen.
 */
export function scrollFade(node: HTMLElement): () => void {
  function refresh(): void {
    const edges: string[] = [];
    if (node.scrollTop > SLACK) {
      edges.push('top');
    }
    if (node.scrollTop + node.clientHeight < node.scrollHeight - SLACK) {
      edges.push('bottom');
    }
    node.dataset.scrollFade = edges.join(' ');
  }

  refresh();
  node.addEventListener('scroll', refresh, { passive: true });
  // A resize of the list changes how much of it shows; items added or removed (a filter) change
  // how much there is to show, without resizing it.
  const resizes = new ResizeObserver(refresh);
  resizes.observe(node);
  const mutations = new MutationObserver(refresh);
  mutations.observe(node, { childList: true });

  return () => {
    node.removeEventListener('scroll', refresh);
    resizes.disconnect();
    mutations.disconnect();
    delete node.dataset.scrollFade;
  };
}
