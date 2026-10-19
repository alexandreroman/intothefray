import { fireEvent, render, screen } from '@testing-library/svelte';
import Options from './Options.svelte';
import { getPref } from '../lib/prefs';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('Options', () => {
  it('stores the name as you type', async () => {
    render(Options);
    const input = screen.getByLabelText('Your name');
    expect((input as HTMLInputElement).maxLength).toBe(24);

    await fireEvent.input(input, { target: { value: 'Alex' } });

    expect(getPref('itf-name')).toBe('Alex');
  });

  it('stores the theme and applies it to the page', async () => {
    render(Options);

    await fireEvent.click(screen.getByRole('button', { name: 'Green felt' }));

    expect(getPref('itf-theme')).toBe('felt');
    expect(document.documentElement.dataset.theme).toBe('felt');
  });

  it('goes back home', async () => {
    window.history.pushState(null, '', '/options');
    render(Options);
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.pathname).toBe('/');
  });
});
