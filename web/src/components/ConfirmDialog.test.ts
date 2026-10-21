import { fireEvent, render, screen } from '@testing-library/svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

function renderDialog() {
  const onconfirm = vi.fn();
  const oncancel = vi.fn();
  render(ConfirmDialog, { question: 'Sure?', confirmLabel: 'Do it', onconfirm, oncancel });
  return { onconfirm, oncancel };
}

describe('ConfirmDialog', () => {
  it('confirms with its button, and focuses Cancel first', async () => {
    const { onconfirm, oncancel } = renderDialog();
    expect(screen.getByRole('alertdialog', { name: 'Sure?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));

    await fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onconfirm).toHaveBeenCalledOnce();
    expect(oncancel).not.toHaveBeenCalled();
  });

  it('shows the confirmation as the main action', () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Do it' });
    expect(confirm.className).toContain('btn-primary');
    expect(confirm.className).toContain('compact');
  });

  it('cancels with Escape or a click outside, not a click inside', async () => {
    const { onconfirm, oncancel } = renderDialog();
    const dialog = screen.getByRole('alertdialog');
    const backdrop = screen.getByRole('presentation');

    await fireEvent.pointerDown(dialog);
    await fireEvent.click(dialog);
    // A press inside that ends outside is not a click outside.
    await fireEvent.pointerDown(dialog);
    await fireEvent.click(backdrop);
    expect(oncancel).not.toHaveBeenCalled();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(oncancel).toHaveBeenCalledOnce();

    await fireEvent.pointerDown(backdrop);
    await fireEvent.click(backdrop);
    expect(oncancel).toHaveBeenCalledTimes(2);
    expect(onconfirm).not.toHaveBeenCalled();
  });
});
