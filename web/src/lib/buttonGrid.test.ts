import { buttonGrid, buttonLayout, MIN_BUTTON_WIDTH } from './buttonGrid';
import { mutationsDelivered } from './mutations.testing';

afterEach(() => {
  document.body.replaceChildren();
});

describe('buttonLayout', () => {
  it('gives a lone button the whole width', () => {
    expect(buttonLayout(1, true)).toBe('single');
  });

  it('pairs an even count of buttons', () => {
    expect(buttonLayout(2, true)).toBe('pairs');
    expect(buttonLayout(4, false)).toBe('pairs');
    expect(buttonLayout(6, true)).toBe('pairs');
  });

  it('sets three buttons in a row when they fit there', () => {
    expect(buttonLayout(3, true)).toBe('row');
  });

  it('leads with the first of three buttons when a row is too narrow for them', () => {
    expect(buttonLayout(3, false)).toBe('lead');
  });

  it('leads with the first button of five or more, the rest in pairs', () => {
    expect(buttonLayout(5, true)).toBe('lead');
    expect(buttonLayout(7, false)).toBe('lead');
  });
});

/** jsdom lays nothing out: a button's width and its text's are set by hand. */
function setWidths(button: HTMLElement, width: number, text: number): void {
  button.getBoundingClientRect = () => new DOMRect(0, 0, width, 44);
  Object.defineProperty(button, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(button, 'scrollWidth', {
    configurable: true,
    value: Math.max(width, text),
  });
}

/** A group of buttons, each `width` px wide with a text `text` px wide, in the page. */
function group(count: number, width = 0, text = 0): HTMLElement {
  const element = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const button = document.createElement('button');
    button.textContent = `Action ${i}`;
    setWidths(button, width, text);
    element.append(button);
  }
  document.body.append(element);
  return element;
}

describe('buttonGrid', () => {
  it.each([
    [1, 'single'],
    [2, 'pairs'],
    [3, 'lead'],
    [4, 'pairs'],
    [5, 'lead'],
  ])('lays out %i buttons as %s on a narrow screen', (count, layout) => {
    const element = group(count);
    buttonGrid(element);

    expect(element.dataset.layout).toBe(layout);
  });

  it('sets three buttons in a row when each is wide enough and its text fits', () => {
    const element = group(3, MIN_BUTTON_WIDTH, 60);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('row');
  });

  it('leads with the first of three buttons narrower than the least width', () => {
    const element = group(3, MIN_BUTTON_WIDTH - 1, 40);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('lead');
  });

  it.each([
    [97, 'row'],
    [95, 'lead'],
  ])(
    'lays out three buttons %i px wide as %s, around the least width of 96 px',
    (width, layout) => {
      const element = group(3, width, 40);
      buttonGrid(element);

      expect(element.dataset.layout).toBe(layout);
    },
  );

  it('leads with the first of three buttons when a text would be cut short', () => {
    const element = group(3, 120, 40);
    const label = document.createElement('span');
    setWidths(label, 100, 130);
    element.children[1]!.append(label);
    buttonGrid(element);

    expect(element.dataset.layout).toBe('lead');
  });

  it('lays the buttons out again as some come or go', async () => {
    const element = group(2);
    buttonGrid(element);

    element.append(document.createElement('button'));
    await mutationsDelivered();

    expect(element.dataset.layout).toBe('lead');
  });

  it('lets go of the layout when detached', () => {
    const element = group(2);
    const detach = buttonGrid(element);
    detach();

    expect(element.dataset.layout).toBeUndefined();
  });
});
