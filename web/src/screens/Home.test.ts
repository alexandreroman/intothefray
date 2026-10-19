import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Home from './Home.svelte';
import { createGame } from '../lib/api';
import { getPref, getToken } from '../lib/prefs';

vi.mock('../lib/api', () => ({ createGame: vi.fn() }));

const createGameMock = vi.mocked(createGame);

beforeEach(() => {
  localStorage.clear();
  window.history.pushState(null, '', '/');
});

afterEach(() => {
  createGameMock.mockReset();
});

describe('Home', () => {
  it('start creates a game with the stored name and navigates', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockResolvedValue({ id: 'g1', token: 'tok' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() => expect(window.location.pathname).toBe('/g/g1'));
    expect(createGameMock).toHaveBeenCalledWith('Alex');
    expect(getToken('g1')).toBe('tok');
  });

  it('starts with a generated name when none is stored, and stores it', async () => {
    createGameMock.mockResolvedValue({ id: 'g2', token: 'tok2' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() => expect(window.location.pathname).toBe('/g/g2'));
    const name = getPref('itf-name');
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(createGameMock).toHaveBeenCalledWith(name);
  });

  it('shows an error when the game cannot be created', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockRejectedValue(new Error('boom'));
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    expect((await screen.findByRole('alert')).textContent).toContain('boom');
    expect(window.location.pathname).toBe('/');
  });

  it('shows the logo, the pitch and the disclaimer', () => {
    render(Home);

    expect(screen.getByRole('heading', { level: 1, name: 'Into The Fray' })).toBeTruthy();
    expect(screen.getByText('Play Marvel Champions in your browser.')).toBeTruthy();
    for (const feature of ['A true sandbox', 'Up to 4 heroes', 'Bring your own deck']) {
      expect(screen.getByText(feature)).toBeTruthy();
    }
    expect(
      screen.getByText(
        'Fan-made and unofficial. Not affiliated with Marvel or Fantasy Flight Games.',
      ),
    ).toBeTruthy();
  });

  it('disables the start button while the game is being created', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockReturnValue(new Promise(() => {}));
    render(Home);
    const start = screen.getByRole('button', { name: 'Start a game' });

    await fireEvent.click(start);

    expect((start as HTMLButtonElement).disabled).toBe(true);
  });

  it('goes to the options screen', async () => {
    render(Home);
    await fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(window.location.pathname).toBe('/options');
  });
});
