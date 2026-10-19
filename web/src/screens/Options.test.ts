import { fireEvent, render, screen } from '@testing-library/svelte';
import Options from './Options.svelte';
import { getPref, setPref } from '../lib/prefs';

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

  it('picks and stores a new random name with the dice', async () => {
    setPref('itf-name', 'Alex');
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');
    expect(input.value).toBe('Alex');

    await fireEvent.click(screen.getByRole('button', { name: 'Pick a new random name' }));

    expect(input.value).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(getPref('itf-name')).toBe(input.value);
  });

  it('stores the theme and applies it to the page', async () => {
    render(Options);

    await fireEvent.click(screen.getByRole('button', { name: 'Green felt' }));

    expect(getPref('itf-theme')).toBe('felt');
    expect(document.documentElement.dataset.theme).toBe('felt');
  });

  it('marks the chosen theme as pressed', async () => {
    render(Options);
    const official = screen.getByRole('button', { name: 'Official' });
    const felt = screen.getByRole('button', { name: 'Green felt' });
    expect(official.getAttribute('aria-pressed')).toBe('true');
    expect(felt.getAttribute('aria-pressed')).toBe('false');

    await fireEvent.click(felt);

    expect(official.getAttribute('aria-pressed')).toBe('false');
    expect(felt.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the title and where the options are saved', () => {
    render(Options);

    expect(screen.getByRole('heading', { level: 1, name: 'SUIT UP' })).toBeTruthy();
    expect(screen.getByText('Saved in this browser only. Changes apply right away.')).toBeTruthy();
  });

  it('goes back home', async () => {
    window.history.pushState(null, '', '/options');
    render(Options);
    await fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(window.location.pathname).toBe('/');
  });
});
