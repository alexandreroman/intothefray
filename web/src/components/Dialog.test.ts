import { fireEvent, render, screen } from '@testing-library/svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

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
});
