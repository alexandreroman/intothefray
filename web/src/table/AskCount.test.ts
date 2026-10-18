import { fireEvent, render, screen, within } from '@testing-library/svelte';
import AskCount from './AskCount.svelte';
import { modal } from '../components/modal.svelte';

function renderAsk(max = 30) {
  const onconfirm = vi.fn();
  const oncancel = vi.fn();
  render(AskCount, {
    title: 'Draw cards',
    question: 'How many cards do you draw?',
    max,
    ok: 'Draw',
    onconfirm,
    oncancel,
  });
  const dialog = screen.getByRole('dialog', { name: 'Draw cards' });
  const value = within(dialog).getByRole('textbox') as HTMLInputElement;
  return { dialog, value, onconfirm, oncancel };
}

describe('AskCount', () => {
  it('asks with a default of 5, and Enter confirms', async () => {
    const { dialog, value, onconfirm } = renderAsk();
    expect(dialog.textContent).toContain('How many cards do you draw?');
    expect(value.value).toBe('5');
    expect(document.activeElement).toBe(value);

    await fireEvent.keyDown(value, { key: 'Enter' });
    expect(onconfirm).toHaveBeenCalledWith(5);
  });

  it('defaults to the most there is when fewer than 5', () => {
    const { value } = renderAsk(3);
    expect(value.value).toBe('3');
  });

  it('− and + stay between 1 and the maximum', async () => {
    const { dialog, value, onconfirm } = renderAsk(6);
    const more = within(dialog).getByRole('button', { name: 'One more' });
    const less = within(dialog).getByRole('button', { name: 'One less' });

    await fireEvent.click(more);
    await fireEvent.click(more);
    expect(value.value).toBe('6');
    for (let i = 0; i < 8; i++) {
      await fireEvent.click(less);
    }
    expect(value.value).toBe('1');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Draw' }));
    expect(onconfirm).toHaveBeenCalledWith(1);
  });

  it('takes digits only, and a typed value is clamped', async () => {
    const { value, onconfirm } = renderAsk(30);

    await fireEvent.input(value, { target: { value: '4x2' } });
    expect(value.value).toBe('42');
    await fireEvent.keyDown(value, { key: 'Enter' });
    expect(onconfirm).toHaveBeenCalledWith(30);
  });

  it('arrow keys change the value', async () => {
    const { value } = renderAsk();

    await fireEvent.keyDown(value, { key: 'ArrowUp' });
    expect(value.value).toBe('6');
    await fireEvent.keyDown(value, { key: 'ArrowDown' });
    await fireEvent.keyDown(value, { key: 'ArrowDown' });
    expect(value.value).toBe('4');
  });

  it('Enter on a button presses that button instead of confirming', async () => {
    const { dialog, onconfirm } = renderAsk();

    for (const name of ['Cancel', 'One less', 'One more']) {
      const button = within(dialog).getByRole('button', { name });
      button.focus();
      // The browser turns Enter on a button into a click of it: the dialog must leave it alone.
      expect(await fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
    }
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it('Escape, Cancel or a click outside cancels', async () => {
    const { dialog, oncancel, onconfirm } = renderAsk();

    await fireEvent.pointerDown(dialog);
    expect(oncancel).not.toHaveBeenCalled();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await fireEvent.pointerDown(dialog.parentElement as HTMLElement);
    expect(oncancel).toHaveBeenCalledTimes(3);
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it('marks a modal as open while it is shown', () => {
    expect(modal.open).toBe(false);
    const { unmount } = render(AskCount, {
      title: 'Draw cards',
      question: 'How many?',
      max: 3,
      ok: 'Draw',
      onconfirm: () => {},
      oncancel: () => {},
    });
    expect(modal.open).toBe(true);

    unmount();
    expect(modal.open).toBe(false);
  });
});
