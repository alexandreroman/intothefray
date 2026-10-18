import { fireEvent, render, screen } from '@testing-library/svelte';
import Game from './Game.svelte';
import { GameSession } from '../lib/session.svelte';
import type { View } from '../lib/types';

vi.mock('../lib/session.svelte', () => ({ GameSession: vi.fn() }));

const sessionMock = vi.mocked(GameSession);

const playingView = {
  id: 'x',
  phase: 'playing',
  spectators: 2,
  table: { cards: [{}, {}, {}] },
} as unknown as View;

function mockSession(fields: object): { connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  const session = { status: 'open', view: null, lastError: null, connect: vi.fn(), close: vi.fn(), ...fields };
  sessionMock.mockImplementation(function () {
    return session as unknown as GameSession;
  });
  return session;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  sessionMock.mockReset();
});

describe('Game', () => {
  it('asks for a name, stores it, and only then creates the session', async () => {
    const session = mockSession({});
    render(Game, { id: 'x' });

    expect(screen.getByText('Choose a name')).toBeTruthy();
    expect(sessionMock).not.toHaveBeenCalled();

    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Jess' } });
    await fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(localStorage.getItem('itf-name')).toBe('Jess');
    expect(sessionMock).toHaveBeenCalledWith('x', 'Jess');
    expect(session.connect).toHaveBeenCalledOnce();
  });

  it('connects at once with a stored name and closes on destroy', () => {
    localStorage.setItem('itf-name', 'Alex');
    const session = mockSession({});
    const { unmount } = render(Game, { id: 'x' });

    expect(sessionMock).toHaveBeenCalledWith('x', 'Alex');
    expect(session.connect).toHaveBeenCalledOnce();
    unmount();
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('shows the connection status while not open', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ status: 'reconnecting' });
    render(Game, { id: 'x' });
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
  });

  it('shows no status line once open', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ status: 'open', view: playingView });
    render(Game, { id: 'x' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains an unknown game and links home', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ status: 'closed', lastError: { code: 'notFound', message: 'no' } });
    render(Game, { id: 'x' });

    expect(screen.getByText("This game doesn't exist or has expired.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('#/');
  });

  it('shows the table placeholder while playing', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ view: playingView });
    render(Game, { id: 'x' });

    expect(screen.getByText('3 cards on the table')).toBeTruthy();
    expect(screen.getByText('2 spectators')).toBeTruthy();
  });

  it('shows the end screen once ended', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ view: { ...playingView, phase: 'ended' } });
    render(Game, { id: 'x' });
    expect(screen.getByText('This game has ended.')).toBeTruthy();
  });
});
