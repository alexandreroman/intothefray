import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import ConfirmDialog from './ConfirmDialog.svelte';
import Dialog from './Dialog.svelte';
import dialogSource from './Dialog.svelte?raw';

function renderConfirm(question: string) {
  render(ConfirmDialog, {
    question,
    confirmLabel: 'Do it',
    onconfirm: () => {},
    oncancel: () => {},
  });
  return screen.getByRole('alertdialog', { name: question });
}

describe('Dialog', () => {
  it('gives each dialog its own label id', () => {
    const first = renderConfirm('First?');
    const second = renderConfirm('Second?');

    expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'));
  });

  it('keeps Tab inside the dialog', async () => {
    renderConfirm('Sure?');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Do it' });

    confirm.focus();
    await fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    await fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('keeps Tab inside the dialog when the box itself has the focus', async () => {
    const dialog = renderConfirm('Sure?');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Do it' });

    // A click on the box's text focuses the box, which is not one of its buttons.
    dialog.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    dialog.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
  });

  describe('moving the focus in as it opens', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('focuses the first control of its content, without a focus ring', () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      const content = createRawSnippet(() => ({
        render: () => '<div><button>First</button><button>Second</button></div>',
      }));
      render(Dialog, { title: 'Options', oncancel: () => {}, children: content });

      const first = screen.getByRole('button', { name: 'First' });
      expect(document.activeElement).toBe(first);
      // jsdom has no :focus-visible: the call tells whether the browser draws the ring.
      expect(focus).toHaveBeenCalledWith({ focusVisible: false });
      expect(focus.mock.contexts).toEqual([first]);
    });

    it('shows the focus ring on Tab, even on its only control', async () => {
      const content = createRawSnippet(() => ({
        render: () => '<div><button>Close</button></div>',
      }));
      render(Dialog, { title: "What's new", oncancel: () => {}, children: content });
      const close = screen.getByRole('button', { name: 'Close' });
      expect(document.activeElement).toBe(close);

      // Tab wraps onto the control that has the focus: it must take it again, with its ring.
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      const blur = vi.spyOn(HTMLElement.prototype, 'blur');
      await fireEvent.keyDown(close, { key: 'Tab' });
      expect(document.activeElement).toBe(close);
      expect(blur.mock.contexts).toEqual([close]);
      expect(focus.mock.contexts).toEqual([close]);
      expect(focus).toHaveBeenCalledWith({ focusVisible: true });

      await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(close);
      expect(focus).toHaveBeenLastCalledWith({ focusVisible: true });
    });
  });

  describe('filling the screen', () => {
    const content = createRawSnippet(() => ({ render: () => '<p>Cards</p>' }));

    /** The declarations of a rule of the dialog's stylesheet. */
    function rule(selector: string): string {
      const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
      return pattern.exec(dialogSource)?.[1] ?? '';
    }

    it('takes the whole screen, within its safe areas, with no margin', () => {
      render(Dialog, {
        title: 'Search',
        wide: true,
        fill: true,
        oncancel: () => {},
        children: content,
      });

      const box = screen.getByRole('dialog', { name: 'Search' });
      expect(box.classList).toContain('fill');
      expect(box.parentElement?.classList).toContain('fill');
      expect(rule('.backdrop.fill')).toContain(
        'padding: var(--status-room) env(safe-area-inset-right) env(safe-area-inset-bottom)',
      );
      expect(rule('.backdrop.fill')).toContain('display: flex;');
      const fill = rule('.box.fill');
      expect(fill).toContain('min-width: 0;');
      expect(fill).toContain('width: 100%;');
      expect(fill).toContain('height: 100%;');
      expect(fill).toContain('max-height: none;');
    });

    it('does not by default', () => {
      render(Dialog, { title: 'Search', wide: true, oncancel: () => {}, children: content });

      expect(screen.getByRole('dialog', { name: 'Search' }).classList).not.toContain('fill');
    });
  });
});
