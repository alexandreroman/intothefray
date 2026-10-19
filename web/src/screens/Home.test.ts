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

  it('lets the player dismiss the name dialog', async () => {
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getPref('itf-name')).toBeNull();
  });

  it('asks for a name first when none is stored, and stores it', async () => {
    createGameMock.mockResolvedValue({ id: 'g2', token: 'tok2' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(createGameMock).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: '  Jess  ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(window.location.pathname).toBe('/g/g2'));
    expect(getPref('itf-name')).toBe('Jess');
    expect(createGameMock).toHaveBeenCalledWith('Jess');
  });

  it('shows an error when the game cannot be created', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockRejectedValue(new Error('boom'));
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    expect((await screen.findByRole('alert')).textContent).toContain('boom');
    expect(window.location.pathname).toBe('/');
  });

  it('goes to the options screen', async () => {
    render(Home);
    await fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(window.location.pathname).toBe('/options');
  });
});
