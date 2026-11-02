import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Options from './Options.svelte';
import { getPref, setPref } from '../lib/prefs';
import { applyTheme } from '../lib/theme';

const ASSETS = 'https://img.intothefray.xyz/assets/';

const APP_SHA = '0123456789abcdef0123456789abcdef01234567';
const SERVER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';

/** Makes GET /api/version answer `commit`. */
function stubServerCommit(commit: string): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ commit }))));
}

function versionLine(): HTMLElement {
  const line = document.querySelector<HTMLElement>('.version');
  if (!line) {
    throw new Error('No version line');
  }
  return line;
}

/** The version line as read, with its whitespace collapsed. */
function versionText(): string {
  return (versionLine().textContent ?? '').replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  vi.stubEnv('VITE_COMMIT', APP_SHA);
  stubServerCommit(APP_SHA);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Replaces the input's whole value, as an input event with no beforeinput before it. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await fireEvent.input(input, { target: { value } });
}

/**
 * Inserts `text` over the selection from `start` to `end` as a browser does: a beforeinput event
 * while the selection is in place, then the new value with the caret after the text.
 */
async function edit(
  input: HTMLInputElement,
  start: number,
  end: number,
  text: string,
): Promise<void> {
  input.setSelectionRange(start, end);
  await fireEvent(input, new InputEvent('beforeinput', { bubbles: true }));
  const value = input.value;
  input.value = value.slice(0, start) + text + value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  await fireEvent(input, new InputEvent('input', { bubbles: true }));
}

describe('Options', () => {
  it('stores the name as you type', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');

    await type(input, 'Alex');

    expect(getPref('itf-name')).toBe('Alex');
  });

  it('removes a typed emoji from the input', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');

    await fireEvent.input(input, { target: { value: 'Alex🔥' } });

    expect(input.value).toBe('Alex');
    expect(getPref('itf-name')).toBe('Alex');
  });

  it('counts the letters of a name outside the BMP as one each, as the server does', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');

    await type(input, '𝒜'.repeat(16));
    expect(input.value).toBe('𝒜'.repeat(16));
    expect(getPref('itf-name')).toBe('𝒜'.repeat(16));

    await type(input, '𝒜'.repeat(17));
    expect(input.value).toBe('𝒜'.repeat(16));
    expect(getPref('itf-name')).toBe('𝒜'.repeat(16));
  });

  it('refuses a letter typed in the middle of a full name and leaves the caret where it was', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');
    const full = 'Abcdefghijklmnop';
    await type(input, full);

    await edit(input, 5, 5, 'X');

    expect(input.value).toBe(full);
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
    expect(getPref('itf-name')).toBe(full);
  });

  it('keeps what fits of an overflowing paste at the caret', async () => {
    render(Options);
    const input = screen.getByLabelText<HTMLInputElement>('Your name');
    await type(input, 'Abcdefghijklmn');

    await edit(input, 3, 3, '𝒜𝒜𝒜𝒜');

    expect(input.value).toBe('Abc𝒜𝒜defghijklmn');
    expect([input.selectionStart, input.selectionEnd]).toEqual([7, 7]);
    expect(getPref('itf-name')).toBe('Abc𝒜𝒜defghijklmn');
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

  it('previews each theme in its own colours, whatever the current one', () => {
    applyTheme('felt');
    render(Options);

    for (const [name, key] of [
      ['Official', 'official'],
      ['Minimal', 'minimal'],
      ['Green felt', 'felt'],
    ]) {
      const surface = screen.getByRole('button', { name }).querySelector<HTMLElement>('.surface');
      expect(surface?.dataset.theme).toBe(key);
      expect(surface?.classList).toContain('table-bg');
      expect(surface?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it("previews the official theme's images while the minimal one is stored", () => {
    setPref('itf-theme', 'minimal');
    render(Options);

    const official = screen.getByRole('button', { name: 'Official' });
    const sources = [...official.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources).toEqual([ASSETS + 'back-player.avif', ASSETS + 'first-player-v2.avif']);
  });

  it('previews the drawn back and token of the minimal theme while the official one is stored', () => {
    setPref('itf-theme', 'official');
    render(Options);

    const minimal = screen.getByRole('button', { name: 'Minimal' });
    expect(minimal.querySelector('img')).toBeNull();
    expect(minimal.querySelector('.back.player')).not.toBeNull();
    expect(minimal.querySelector('svg[aria-label="First player"]')).not.toBeNull();
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

  it('shows the app version alone while the server is loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(Options);

    expect(versionText()).toBe('version 0123456');
    expect(screen.getByText('0123456').getAttribute('title')).toBe(APP_SHA);
  });

  it('shows a single version when the app and server match', async () => {
    const fetchMock = vi.mocked(fetch);
    render(Options);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(versionText()).toBe('version 0123456'));
    expect(versionLine().classList.contains('mismatch')).toBe(false);
    expect(screen.queryByRole('link', { name: '0123456' })).toBeNull();
  });

  it('tells a mismatch when the app and server differ', async () => {
    stubServerCommit(SERVER_SHA);
    render(Options);

    expect((await screen.findByText('fedcba9')).getAttribute('title')).toBe(SERVER_SHA);
    expect(versionText()).toBe('version mismatch 0123456/fedcba9');
    expect(versionLine().classList.contains('mismatch')).toBe(true);
  });

  it('tells a mismatch when the app is a local "dev" build', async () => {
    vi.stubEnv('VITE_COMMIT', '');
    stubServerCommit(SERVER_SHA);
    render(Options);

    await waitFor(() => expect(versionText()).toBe('version mismatch dev/fedcba9'));
  });

  it('shows the server as unavailable on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(Options);

    await waitFor(() => expect(versionText()).toBe('version 0123456/unavailable'));
    expect(versionLine().classList.contains('mismatch')).toBe(false);
  });

  it('shows "dev" for a local build', () => {
    vi.stubEnv('VITE_COMMIT', '');
    render(Options);

    expect(screen.getByText('dev')).toBeTruthy();
  });

  it('goes back home', async () => {
    window.history.pushState(null, '', '/options');
    render(Options);
    await fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(window.location.pathname).toBe('/');
  });
});
