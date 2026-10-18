import { fireEvent, render, screen } from '@testing-library/svelte';
import NamePrompt from './NamePrompt.svelte';

describe('NamePrompt', () => {
  it('submits the trimmed name', async () => {
    const onsubmit = vi.fn();
    render(NamePrompt, { onsubmit });

    await fireEvent.input(screen.getByRole('textbox'), { target: { value: '  Jess ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onsubmit).toHaveBeenCalledWith('Jess');
  });

  it('refuses an empty name', async () => {
    const onsubmit = vi.fn();
    render(NamePrompt, { onsubmit });

    await fireEvent.input(screen.getByRole('textbox'), { target: { value: '   ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('starts from the initial value', () => {
    render(NamePrompt, { onsubmit: vi.fn(), initial: 'Alex' });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Alex');
  });
});
