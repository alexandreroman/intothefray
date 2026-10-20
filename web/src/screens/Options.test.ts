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
    expect((input as HTMLInputElement).maxLength).toBe(16);

    await fireEvent.input(input, { target: { value: 'Alex' } });

    expect(getPref('itf-name')).toBe('Alex');
  });

  it('removes a typed emoji from the input', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');

    await fireEvent.input(input, { target: { value: 'Alex🔥' } });

    expect(input.value).toBe('Alex');
    expect(getPref('itf-name')).toBe('Alex');
  });

  it('shows a stored name longer than the limit cut', () => {
    setPref('itf-name', 'Abcdefghijklmnopqrstuvwxyz');
    render(Options);
    expect(screen.getByLabelText<HTMLInputElement>('Your name').value).toBe('Abcdefghijklmnop');
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

  it('offers English and French, English first by default', () => {
    render(Options);
    const select = screen.getByLabelText<HTMLSelectElement>('Language');

    expect([...select.options].map((option) => option.textContent)).toEqual([
      'English',
      'Français',
    ]);
    expect(select.value).toBe('en');
    expect(screen.getByText('Card names and images. The interface stays in English.')).toBeTruthy();
  });

  it('stores the chosen language and shows it next time', async () => {
    const { unmount } = render(Options);

    await fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });

    expect(getPref('itf-lang')).toBe('fr');
    unmount();
    render(Options);
    expect(screen.getByLabelText<HTMLSelectElement>('Language').value).toBe('fr');
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
