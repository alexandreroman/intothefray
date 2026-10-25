// The Language section of Options, with French offered as well: it shows as soon as two languages are offered.

import { fireEvent, render, screen } from '@testing-library/svelte';
import Options from './Options.svelte';
import { getPref } from '../lib/prefs';

vi.mock('../lib/lang', async (importOriginal) => {
  const lang = await importOriginal<typeof import('../lib/lang')>();
  return { ...lang, OFFERED_LANGS: lang.LANGS };
});

beforeEach(() => {
  localStorage.clear();
  // Options asks the server for its commit.
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Options with two languages offered', () => {
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

  it('stores the chosen language', async () => {
    render(Options);
    const select = screen.getByLabelText<HTMLSelectElement>('Language');

    await fireEvent.change(select, { target: { value: 'fr' } });

    expect(getPref('itf-lang')).toBe('fr');
    expect(select.value).toBe('fr');
  });
});
