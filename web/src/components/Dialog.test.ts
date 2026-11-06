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
        'padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)',
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
