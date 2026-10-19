import { fireEvent, render, screen, within } from '@testing-library/svelte';
import AskCount from './AskCount.svelte';
import { modal } from '../components/modal.svelte';

function renderAsk(max = 30) {
  const onconfirm = vi.fn();
  const oncancel = vi.fn();
  const props = {
    title: 'Draw cards',
    question: 'How many cards do you draw?',
    max,
    ok: 'Draw',
    onconfirm,
    oncancel,
  };
  const { rerender } = render(AskCount, props);
  const dialog = screen.getByRole('dialog', { name: 'Draw cards' });
  const value = within(dialog).getByRole('spinbutton', { name: 'Number of cards' });
  return {
    dialog,
    value,
    onconfirm,
    oncancel,
    setMax: (next: number) => rerender({ ...props, max: next }),
  };
}

/** The value shown, and the one told to assistive technologies, which must agree. */
function shown(value: HTMLElement): string {
  expect(value.getAttribute('aria-valuenow')).toBe(value.textContent?.trim());
  return value.textContent?.trim() ?? '';
}

describe('AskCount', () => {
  it('asks with a default of 5, and Enter confirms', async () => {
    const { dialog, value, onconfirm } = renderAsk();
    expect(dialog.textContent).toContain('How many cards do you draw?');
    expect(shown(value)).toBe('5');
    expect(value.getAttribute('aria-valuemin')).toBe('1');
    expect(value.getAttribute('aria-valuemax')).toBe('30');
    expect(document.activeElement).toBe(value);

    await fireEvent.keyDown(value, { key: 'Enter' });
    expect(onconfirm).toHaveBeenCalledWith(5);
  });

  it('shows a value that cannot be typed into', () => {
    const { dialog, value } = renderAsk();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(value.querySelector('input')).toBeNull();
    expect(value.getAttribute('contenteditable')).toBeNull();
  });

  it('defaults to the most there is when fewer than 5', () => {
    const { value } = renderAsk(3);
    expect(shown(value)).toBe('3');
  });

  it('lowers the value to a maximum that drops below it, and keeps it when it rises', async () => {
    const { value, onconfirm, setMax } = renderAsk(30);
    await fireEvent.keyDown(value, { key: 'End' });
    expect(shown(value)).toBe('30');

    // Another player draws from the pile meanwhile.
    await setMax(8);
    expect(shown(value)).toBe('8');
    await setMax(20);
    expect(shown(value)).toBe('8');
    expect(value.getAttribute('aria-valuemax')).toBe('20');

    await fireEvent.keyDown(value, { key: 'Enter' });
    expect(onconfirm).toHaveBeenCalledWith(8);
  });

  it('− and + stay between 1 and the maximum, and are off at the bounds', async () => {
    const { dialog, value, onconfirm } = renderAsk(6);
    const more = within(dialog).getByRole('button', { name: 'One more' });
    const less = within(dialog).getByRole('button', { name: 'One less' });

    await fireEvent.click(more);
    await fireEvent.click(more);
    expect(shown(value)).toBe('6');
    expect((more as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 8; i++) {
      await fireEvent.click(less);
    }
    expect(shown(value)).toBe('1');
    expect((less as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Draw' }));
    expect(onconfirm).toHaveBeenCalledWith(1);
  });

  it('the arrows, + and −, Home and End change the value', async () => {
    const { value } = renderAsk();

    await fireEvent.keyDown(value, { key: 'ArrowUp' });
    await fireEvent.keyDown(value, { key: 'ArrowRight' });
    expect(shown(value)).toBe('7');
    await fireEvent.keyDown(value, { key: 'ArrowDown' });
    await fireEvent.keyDown(value, { key: '-' });
    await fireEvent.keyDown(value, { key: 'ArrowLeft' });
    expect(shown(value)).toBe('4');
    await fireEvent.keyDown(value, { key: '+' });
    expect(shown(value)).toBe('5');
    await fireEvent.keyDown(value, { key: 'End' });
    expect(shown(value)).toBe('30');
    await fireEvent.keyDown(value, { key: 'Home' });
    expect(shown(value)).toBe('1');
  });

  it('quick clicks on − and + start no text selection', async () => {
    const { dialog } = renderAsk();
    for (const name of ['One less', 'One more']) {
      expect(
        await fireEvent.mouseDown(within(dialog).getByRole('button', { name }), { detail: 2 }),
      ).toBe(false);
    }
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
    const backdrop = dialog.parentElement as HTMLElement;
    await fireEvent.pointerDown(backdrop);
    await fireEvent.click(backdrop);
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
