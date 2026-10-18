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
});
