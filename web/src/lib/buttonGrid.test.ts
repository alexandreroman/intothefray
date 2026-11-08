import { buttonGrid, buttonLayout, MIN_BUTTON_WIDTH } from './buttonGrid';
import { mutationsDelivered } from './mutations.testing';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('buttonLayout', () => {
  it('gives a lone button the whole width', () => {
    expect(buttonLayout(1, 3)).toBe('single');
    expect(buttonLayout(1, 1)).toBe('single');
  });

  it('pairs an even count of buttons', () => {
    expect(buttonLayout(2, 2)).toBe('pairs');
    expect(buttonLayout(4, 2)).toBe('pairs');
    expect(buttonLayout(6, 2)).toBe('pairs');
  });

  it('sets three buttons in a row when they fit there', () => {
    expect(buttonLayout(3, 3)).toBe('row');
  });

  it('pairs three buttons, the last one the whole width, when a row is too narrow for them', () => {
    expect(buttonLayout(3, 2)).toBe('pairs-last');
  });

  it('pairs five buttons or more, the last one the whole width', () => {
    expect(buttonLayout(5, 2)).toBe('pairs-last');
    expect(buttonLayout(7, 2)).toBe('pairs-last');
  });

  it('lays the buttons out one per line when two do not fit side by side', () => {
    expect(buttonLayout(2, 1)).toBe('column');
    expect(buttonLayout(3, 1)).toBe('column');
    expect(buttonLayout(4, 1)).toBe('column');
  });
});

/**
 * jsdom lays nothing out: a box's width and its text's are set by hand, for the layout its group
 * is tried in (data-layout).
 */
function setWidths(
  box: HTMLElement,
  group: HTMLElement,
  width: (layout: string | undefined) => number,
  text: number,
): void {
  const current = () => width(group.dataset.layout);
  box.getBoundingClientRect = () => new DOMRect(0, 0, current(), 44);
  Object.defineProperty(box, 'clientWidth', { configurable: true, get: current });
  Object.defineProperty(box, 'scrollWidth', {
    configurable: true,
    get: () => Math.max(current(), text),
  });
}

/** How wide a button is in each layout of its group, in px, as a 300 px group would lay it out. */
function widthIn(layout: string | undefined): number {
  switch (layout) {
    case 'row':
      return MIN_BUTTON_WIDTH;
    case 'pairs':
    case 'pairs-last':
      return 147;
    default:
      return 300;
  }
}

/**
 * A group of `count` buttons, each as wide as `width` gives for its group's layout, with a text
 * `text` px wide, in the page.
 */
function group(
  count: number,
  width: (layout: string | undefined) => number = () => 0,
  text = 0,
): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => new DOMRect(0, 0, 300, 44);
  for (let i = 0; i < count; i++) {
    element.append(button(element, width, text));
  }
  document.body.append(element);
  return element;
}

function button(
  group: HTMLElement,
  width: (layout: string | undefined) => number,
  text: number,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = 'Action';
  setWidths(element, group, width, text);
  return element;
}

describe('buttonGrid', () => {
  it.each([
    [1, 'single'],
    [2, 'pairs'],
    [3, 'pairs-last'],
    [4, 'pairs'],
    [5, 'pairs-last'],
  ])('lays out %i buttons as %s on a narrow screen', (count, layout) => {
    const element = group(count);
    buttonGrid(element);

    expect(element.dataset.layout).toBe(layout);
  });

  it('sets three buttons in a row when each is wide enough and its text fits', () => {
    const element = group(3, widthIn, 60);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('row');
  });

  it.each([
    [MIN_BUTTON_WIDTH + 1, 'row'],
    [MIN_BUTTON_WIDTH, 'row'],
    [MIN_BUTTON_WIDTH - 1, 'pairs-last'],
  ])(
    'lays out three buttons %i px wide in a row as %s, around the least width of 96 px',
    (rowWidth, layout) => {
      const element = group(3, (current) => (current === 'row' ? rowWidth : 147), 40);
      buttonGrid(element);

      expect(element.dataset.layout).toBe(layout);
    },
  );

  it('pairs three buttons, the last one the whole width, when a text would be cut short in a row', () => {
    const element = group(3, widthIn, 40);
    const label = document.createElement('span');
    setWidths(label, element, (current) => widthIn(current) - 16, 110);
    element.children[1]!.append(label);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('pairs-last');
  });

  it('lays the buttons out one per line when a text would be cut short two by two', () => {
    const element = group(4, widthIn, 40);
    const label = document.createElement('span');
    setWidths(label, element, (current) => widthIn(current) - 16, 200);
    element.children[2]!.append(label);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('column');
  });

  it('keeps a lone button the whole width, even when its text is cut short', () => {
    const element = group(1, widthIn, 400);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('single');
  });

  it('lays the buttons out again as some come or go', async () => {
    const element = group(2);
    buttonGrid(element);

    element.append(button(element, () => 0, 0));
    await mutationsDelivered();
    expect(element.dataset.layout).toBe('pairs-last');

    element.lastElementChild!.remove();
    element.lastElementChild!.remove();
    await mutationsDelivered();
    expect(element.dataset.layout).toBe('single');
  });

  it('lays the buttons out again as the group changes width', () => {
    let onResize: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          onResize = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    // Three buttons in a 300 px group fit in a row; in a narrower one, only two by two.
    let groupWidth = 300;
    const narrowed = (current: string | undefined) => (widthIn(current) * groupWidth) / 300;
    const element = group(3, narrowed, 80);
    element.getBoundingClientRect = () => new DOMRect(0, 0, groupWidth, 44);
    buttonGrid(element);
    onResize();
    expect(element.dataset.layout).toBe('row');

    groupWidth = 240;
    onResize();
    expect(element.dataset.layout).toBe('pairs-last');

    groupWidth = 150;
    onResize();
    expect(element.dataset.layout).toBe('column');
  });

  it('lets go of the layout when detached', () => {
    const element = group(2);
    const detach = buttonGrid(element);
    detach();

    expect(element.dataset.layout).toBeUndefined();
  });
});
