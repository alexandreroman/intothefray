import { isTyping, pointerBlur, releaseFocus } from './releaseFocus';

/** Appends the HTML to the page, in a holder it returns. */
function append(html: string): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.append(holder);
  return holder;
}

/** The element of the page with that id, focused. */
function focused(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`no #${id} element`);
  }
  element.focus();
  expect(document.activeElement).toBe(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('releaseFocus', () => {
  it('blurs a button focused outside the pressed element', () => {
    const pressed = append('<div class="card"></div>');
    append('<button id="fullscreen">Fullscreen</button>');
    const button = focused('fullscreen');

    releaseFocus(pressed);

    expect(document.activeElement).not.toBe(button);
    expect(document.activeElement).toBe(document.body);
  });

  it('blurs it when nothing names the pressed element', () => {
    append('<button id="fullscreen">Fullscreen</button>');
    const button = focused('fullscreen');

    releaseFocus(null);

    expect(document.activeElement).not.toBe(button);
  });

  it.each([
    ['an input', '<input id="field" />'],
    ['a textarea', '<textarea id="field"></textarea>'],
    ['a select', '<select id="field"><option>A</option></select>'],
  ])('keeps the focus of %s: the viewer types there', (_name, html) => {
    const pressed = append('<div class="card"></div>');
    append(html);
    const field = focused('field');

    releaseFocus(pressed);

    expect(document.activeElement).toBe(field);
  });

  it.each([
    ['a dialog', '<div role="dialog"><button id="inside">OK</button></div>'],
    ['a modal', '<div aria-modal="true"><button id="inside">OK</button></div>'],
    ['a menu', '<div role="menu"><button id="inside">Flip</button></div>'],
  ])('keeps the focus inside %s', (_name, html) => {
    const pressed = append('<div class="card"></div>');
    append(html);
    const inside = focused('inside');

    releaseFocus(pressed);

    expect(document.activeElement).toBe(inside);
  });

  it('keeps the focus inside the pressed element', () => {
    const pressed = append('<div class="card"><button id="inside">Ready</button></div>');
    const inside = focused('inside');

    releaseFocus(pressed);

    expect(document.activeElement).toBe(inside);
  });

  it('does nothing while nothing has the focus', () => {
    const pressed = append('<div class="card"></div>');

    expect(() => releaseFocus(pressed)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('pointerBlur', () => {
  it('blurs the button a pointer clicks', () => {
    append('<button id="fullscreen">Fullscreen</button>');
    const button = focused('fullscreen');
    pointerBlur(button);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(document.activeElement).not.toBe(button);
  });

  it('keeps the focus of a button activated from the keyboard (a click of detail 0)', () => {
    append('<button id="fullscreen">Fullscreen</button>');
    const button = focused('fullscreen');
    pointerBlur(button);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));

    expect(document.activeElement).toBe(button);
  });

  it('stops blurring once cleaned up', () => {
    append('<button id="fullscreen">Fullscreen</button>');
    const button = focused('fullscreen');
    const cleanup = pointerBlur(button);

    cleanup();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(document.activeElement).toBe(button);
  });
});

describe('isTyping', () => {
  it('is true for a text field or an editable element, false for anything else', () => {
    const holder = append(`
      <input id="input" />
      <textarea id="textarea"></textarea>
      <select id="select"></select>
      <button id="button">OK</button>
    `);
    const editable = document.createElement('div');
    // jsdom has no isContentEditable: the browser's value is stubbed.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    holder.append(editable);

    expect(isTyping(document.getElementById('input'))).toBe(true);
    expect(isTyping(document.getElementById('textarea'))).toBe(true);
    expect(isTyping(document.getElementById('select'))).toBe(true);
    expect(isTyping(editable)).toBe(true);
    // Falsy rather than false: without isContentEditable, jsdom yields undefined for a button.
    expect(isTyping(document.getElementById('button'))).toBeFalsy();
    expect(isTyping(window)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
