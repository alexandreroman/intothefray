import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Lobby from './Lobby.svelte';
import { cardByCode, loadIndex } from '../lib/catalog';
import { GameSession } from '../lib/session.svelte';
import type { CardInfo } from '../lib/catalog';
import type { Index, LobbyConfig, PlayerView, UnsupportedCard, View, YouView } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  loadIndex: vi.fn(),
  cardByCode: vi.fn(),
}));

const index: Index = {
  version: 1,
  lang: 'en',
  packs: [
    { code: 'core', name: 'Core Set', file: 'core.json', position: 1 },
    { code: 'next_evol', name: 'NeXt Evolution', file: 'next_evol.json', position: 40 },
  ],
  scenarios: [
    {
      id: 'rhino',
      name: 'Rhino',
      pack: 'core',
      image: 'rhino.jpg',
      supported: true,
      recommended: ['bomb_scare'],
    },
    {
      id: 'klaw',
      name: 'Klaw',
      pack: 'core',
      image: 'klaw.jpg',
      supported: true,
      recommended: ['masters_of_evil'],
    },
    {
      id: 'marauders',
      name: 'Marauders',
      pack: 'next_evol',
      image: '',
      supported: false,
      recommended: [],
    },
  ],
  sets: [
    { code: 'standard', name: 'Standard', pack: 'core', kind: 'standard' },
    { code: 'expert', name: 'Expert', pack: 'core', kind: 'expert' },
    { code: 'bomb_scare', name: 'Bomb Scare', pack: 'core', kind: 'modular' },
    { code: 'masters_of_evil', name: 'Masters of Evil', pack: 'core', kind: 'modular' },
  ],
};

const noScenario: LobbyConfig = {
  scenario: '',
  difficulty: 'standard',
  standard: '',
  expert: '',
  modulars: [],
};

const alex: PlayerView = { name: 'Alex', color: 0, host: true, ready: false, handCount: 0 };
const sam: PlayerView = { name: 'Sam', color: 1, host: false, ready: false, handCount: 0 };
const jo: PlayerView = {
  name: 'Jo',
  color: 2,
  host: false,
  ready: true,
  hero: '01001a',
  heroName: 'Spider-Man',
  deckName: 'Friendly neighbourhood',
  handCount: 0,
};

const asHost: YouView = { role: 'player', name: 'Alex', color: 0, host: true };
const asSam: YouView = { role: 'player', name: 'Sam', color: 1, host: false };

interface FakeSession {
  view: View;
  deckError: UnsupportedCard[] | null;
  deckLoadError: null;
  lastError: null;
  lobby: ReturnType<typeof vi.fn>;
}

/** Just enough of a WebSocket to feed a real GameSession from a test. */
class FakeSocket {
  static last: FakeSocket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor() {
    FakeSocket.last = this;
  }

  send(): void {}

  close(): void {}

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function lobbyView(players: PlayerView[]): View {
  return {
    id: 'g1',
    phase: 'lobby',
    you: asHost,
    players,
    spectators: 0,
    config: noScenario,
    log: [],
  };
}

/** Renders the lobby on a live session, the way Game does, and returns a way to push views. */
function renderLive() {
  const session = new GameSession('g1', 'Alex', {
    WebSocket: FakeSocket as unknown as typeof WebSocket,
  });
  session.connect();
  FakeSocket.last.onopen?.();
  FakeSocket.last.receive({ type: 'view', version: 1, view: lobbyView([alex, sam]) });
  const { rerender } = render(Lobby, { session, view: session.view! });
  return {
    session,
    async receive(message: object): Promise<void> {
      FakeSocket.last.receive(message);
      await rerender({ session, view: session.view! });
    },
  };
}

function renderLobby(fields: {
  you?: YouView;
  players?: PlayerView[];
  config?: LobbyConfig;
  deckError?: UnsupportedCard[];
}) {
  const view: View = {
    id: 'g1',
    phase: 'lobby',
    you: fields.you ?? asHost,
    players: fields.players ?? [alex, sam],
    spectators: 0,
    config: fields.config ?? noScenario,
    log: [],
  };
  const session: FakeSession = {
    view,
    deckError: fields.deckError ?? null,
    deckLoadError: null,
    lastError: null,
    lobby: vi.fn(),
  };
  render(Lobby, { session: session as unknown as GameSession, view });
  return session;
}

beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue(index);
  vi.mocked(cardByCode).mockResolvedValue(null);
});

afterEach(() => {
  vi.mocked(loadIndex).mockReset();
  vi.mocked(cardByCode).mockReset();
});

describe('Lobby', () => {
  it('unsupported scenarios are not clickable', async () => {
    const session = renderLobby({});

    const tile = await screen.findByRole('button', { name: /Marauders/ });
    expect(tile.textContent).toContain('not supported yet');
    expect((tile as HTMLButtonElement).disabled).toBe(true);
    await fireEvent.click(tile);
    expect(session.lobby).not.toHaveBeenCalled();
  });

  it('host choosing a scenario sends configure with its recommended modulars', async () => {
    const session = renderLobby({});

    await fireEvent.click(await screen.findByRole('button', { name: /Klaw/ }));

    expect(session.lobby).toHaveBeenCalledWith('configure', {
      config: {
        scenario: 'klaw',
        difficulty: 'standard',
        standard: 'standard',
        expert: '',
        modulars: ['masters_of_evil'],
      },
    });
  });

  it('keeps expert difficulty when the host chooses another scenario', async () => {
    const session = renderLobby({
      config: {
        scenario: 'rhino',
        difficulty: 'expert',
        standard: 'standard',
        expert: 'expert',
        modulars: [],
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: /Klaw/ }));

    expect(session.lobby).toHaveBeenCalledWith('configure', {
      config: {
        scenario: 'klaw',
        difficulty: 'expert',
        standard: 'standard',
        expert: 'expert',
        modulars: ['masters_of_evil'],
      },
    });
  });

  it('deckError renders count and lines', () => {
    renderLobby({
      deckError: [
        { code: '31001a', name: 'Hand Cannon', pack: 'Spider-Woman', qty: 2 },
        { code: '16001a', name: 'Nebula', pack: 'Nebula', qty: 1 },
      ],
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("This deck can't be used yet: 3 cards aren't supported.");
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
    expect(alert.textContent).toContain('Remove them from the deck, or pick another deck.');
  });

  it('start disabled with reason', () => {
    renderLobby({ players: [alex, sam, jo] });

    const start = screen.getByRole('button', { name: 'Set up the table' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Waiting for a deck from you and Sam.')).toBeTruthy();
  });

  it('guest sees no remove buttons except leave on own row', async () => {
    const session = renderLobby({ you: asSam, players: [alex, sam, jo] });

    expect(screen.queryAllByRole('button', { name: /off this seat/ })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Set up the table' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Leave your seat' }));
    expect(session.lobby).toHaveBeenCalledWith('leave');
  });

  it('host takes another player off a seat by colour', async () => {
    const session = renderLobby({ players: [alex, sam] });

    expect(screen.queryByRole('button', { name: 'Leave your seat' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Take Sam off this seat' }));
    expect(session.lobby).toHaveBeenCalledWith('removePlayer', { color: 1 });
  });

  it('a spectator can take a free seat', async () => {
    const session = renderLobby({ you: { role: 'spectator', name: 'Max', color: 0, host: false } });

    const seats = screen.getAllByRole('button', { name: 'Take this seat' });
    expect(seats).toHaveLength(2);
    expect(screen.queryByText('Your deck')).toBeNull();
    const firstSeat = seats[0];
    if (!firstSeat) throw new Error('no free seat');
    await fireEvent.click(firstSeat);
    expect(session.lobby).toHaveBeenCalledWith('takeSeat');
  });

  it("shows the image of the hero face of a player's identity", async () => {
    const identity = {
      card: {
        code: '01001',
        back: 'player',
        quantity: 1,
        faces: [
          { name: 'Peter Parker', type: 'alter_ego', size: 'std', images: ['alter-ego.jpg'] },
          { name: 'Spider-Man', type: 'hero', size: 'std', images: ['hero.jpg'] },
        ],
      },
      face: 0,
      pack: 'core',
    } satisfies CardInfo;
    vi.mocked(cardByCode).mockResolvedValue(identity);
    renderLobby({ players: [alex, jo] });

    const image = await screen.findByRole('img', { name: 'Spider-Man' });
    expect(image.getAttribute('src')).toBe('hero.jpg');
    expect(cardByCode).toHaveBeenCalledWith('01001a');
    expect(screen.getByText('Spider-Man — Friendly neighbourhood')).toBeTruthy();
  });

  it('loads a deck from its link', async () => {
    const session = renderLobby({});

    await fireEvent.input(screen.getByPlaceholderText('https://marvelcdb.com/decklist/view/…'), {
      target: { value: ' https://marvelcdb.com/decklist/view/1 ' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(session.lobby).toHaveBeenCalledWith('setDeck', {
      url: 'https://marvelcdb.com/decklist/view/1',
    });
  });

  it('shows a failed deck load under the field, even after an unrelated view', async () => {
    const live = renderLive();
    live.session.lobby('setDeck', { url: 'https://example.com/nope' });
    await live.receive({
      type: 'error',
      code: 'deck',
      message: 'This is not a marvelcdb deck link.',
    });
    await live.receive({
      type: 'view',
      version: 2,
      view: lobbyView([alex, { ...sam, ready: true }]),
    });

    const deckBox = screen.getByText('Your deck').closest('section');
    if (!deckBox) throw new Error('no deck box');
    expect(within(deckBox).getByRole('alert').textContent).toBe(
      'This is not a marvelcdb deck link.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows any other error in the start bar', async () => {
    const live = renderLive();
    await live.receive({
      type: 'error',
      code: 'forbidden',
      message: 'You are not allowed to do that.',
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('You are not allowed to do that.');
    expect(alert.closest('.startbar')).not.toBeNull();
  });

  it('lists an unsupported card by its code when its name is unknown', () => {
    renderLobby({ deckError: [{ code: '99001a', name: '', pack: '', qty: 1 }] });

    const line = within(screen.getByRole('alert')).getByRole('listitem');
    expect(line.textContent?.trim()).toBe('1×99001a');
    expect(line.querySelector('.pk')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain("1 card isn't supported.");
  });

  it('keeps the modular menu open on a click inside it that misses an entry', async () => {
    renderLobby({
      config: {
        scenario: 'rhino',
        difficulty: 'standard',
        standard: 'standard',
        expert: '',
        modulars: [],
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: '+ Modular set' }));
    const menu = document.querySelector('.menu');
    if (!menu) throw new Error('menu did not open');
    await fireEvent.click(menu);
    expect(document.querySelector('.menu')).not.toBeNull();

    await fireEvent.click(document.body);
    expect(document.querySelector('.menu')).toBeNull();
  });
});
