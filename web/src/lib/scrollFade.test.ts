import { fireEvent } from '@testing-library/svelte';
import { mutationsDelivered } from './mutations.testing';
import { scrollFade } from './scrollFade';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** jsdom lays nothing out: the scroll position and the heights are set by hand. */
function setScroll(
  element: Element,
  scroll: { top: number; height: number; client: number },
): void {
  Object.defineProperty(element, 'scrollTop', { configurable: true, value: scroll.top });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scroll.height });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: scroll.client });
}

/** A list of three items, 600 px of it in a 200 px box until set otherwise. */
function list(): HTMLElement {
  const element = document.createElement('ul');
  for (let i = 0; i < 3; i++) {
    element.append(document.createElement('li'));
  }
  setScroll(element, { top: 0, height: 600, client: 200 });
  document.body.append(element);
  return element;
}

describe('scrollFade', () => {
  it('fades no edge of a list that fits', () => {
    const element = list();
    setScroll(element, { top: 0, height: 200, client: 200 });
    scrollFade(element);

    expect(element.dataset.scrollFade).toBe('');
  });

  it('fades only the bottom of a list at its top', () => {
    const element = list();
    scrollFade(element);

    expect(element.dataset.scrollFade).toBe('bottom');
  });

  it('fades both edges once scrolled midway', async () => {
    const element = list();
    scrollFade(element);

    setScroll(element, { top: 200, height: 600, client: 200 });
    await fireEvent.scroll(element);
    expect(element.dataset.scrollFade).toBe('top bottom');
  });

  it('fades only the top of a list at its bottom, rounding aside', async () => {
    const element = list();
    scrollFade(element);

    setScroll(element, { top: 399.5, height: 600, client: 200 });
    await fireEvent.scroll(element);
    expect(element.dataset.scrollFade).toBe('top');
  });

  it('follows items leaving the list, as when filtered', async () => {
    const element = list();
    scrollFade(element);

    setScroll(element, { top: 0, height: 200, client: 200 });
    element.lastElementChild?.remove();
    await mutationsDelivered();
    expect(element.dataset.scrollFade).toBe('');
  });

  it('follows items leaving a group of the list', async () => {
    const element = list();
    const group = document.createElement('ul');
    const item = document.createElement('li');
    group.append(document.createElement('li'), item);
    element.append(group);
    scrollFade(element);

    setScroll(element, { top: 0, height: 200, client: 200 });
    item.remove();
    await mutationsDelivered();
    expect(element.dataset.scrollFade).toBe('');
  });

  it('follows a resize of the list', () => {
    let resized: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const element = list();
    scrollFade(element);

    setScroll(element, { top: 0, height: 600, client: 600 });
    resized([], {} as ResizeObserver);
    expect(element.dataset.scrollFade).toBe('');
  });

  it('stops following the list once detached', async () => {
    const element = list();
    const detach = scrollFade(element);

    detach();
    expect(element.dataset.scrollFade).toBeUndefined();
    setScroll(element, { top: 200, height: 600, client: 200 });
    await fireEvent.scroll(element);
    expect(element.dataset.scrollFade).toBeUndefined();
  });
});
