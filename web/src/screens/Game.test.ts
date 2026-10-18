import { fireEvent, render, screen } from '@testing-library/svelte';
import Game from './Game.svelte';
import { GameSession } from '../lib/session.svelte';
import type { View } from '../lib/types';

vi.mock('../lib/session.svelte', () => ({ GameSession: vi.fn() }));
// The table loads the card catalog: keep the tests off the network.
vi.mock('../lib/catalog', () => ({
  loadAllCards: vi.fn(() => Promise.resolve()),
  knownCard: vi.fn(() => null),
  cardByCode: vi.fn(() => Promise.resolve(null)),
}));

const sessionMock = vi.mocked(GameSession);

const playingView = {
  id: 'x',
  phase: 'playing',
  you: { role: 'spectator', color: -1, host: false },
  players: [],
  spectators: 2,
  table: { cards: [], piles: [], stages: [], firstPlayer: { area: 'villain', x: 0, y: 0 } },
  log: [],
} as unknown as View;

function mockSession(fields: object): {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const session = {
    status: 'open',
    view: null,
    lastError: null,
    connect: vi.fn(),
    close: vi.fn(),
    ...fields,
  };
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

  it('shows Connecting until the first view arrives, even on an open socket', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ status: 'open', view: null });
    render(Game, { id: 'x' });
    expect(screen.getByText('Connecting…')).toBeTruthy();
  });

  it('keeps the name dialog mandatory', () => {
    mockSession({});
    render(Game, { id: 'x' });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
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

  it('shows the table while playing', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ view: playingView });
    render(Game, { id: 'x' });

    expect(screen.getByRole('region', { name: /^Villain/ })).toBeTruthy();
    expect(screen.getByText('2 spectators')).toBeTruthy();
  });

  it('shows the end screen once ended', () => {
    localStorage.setItem('itf-name', 'Alex');
    mockSession({ view: { ...playingView, phase: 'ended' } });
    render(Game, { id: 'x' });
    expect(screen.getByText('This game has ended.')).toBeTruthy();
  });
});
