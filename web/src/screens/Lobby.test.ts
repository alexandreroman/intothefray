import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Lobby from './Lobby.svelte';
import { cutShort } from '../lib/overflowTip.testing';
import { loadIndex } from '../lib/catalog';
import { GameSession } from '../lib/session.svelte';
import type {
  DeckView,
  Index,
  LobbyConfig,
  PlayerView,
  UnsupportedCard,
  View,
  YouView,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  loadIndex: vi.fn(),
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
      id: 'wrecking_crew',
      name: 'Wrecking Crew',
      pack: 'core',
      image: 'wrecking_crew.jpg',
      supported: true,
      recommended: [],
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

const noDeck: DeckView = { ready: false, handCount: 0 };
const spiderMan: DeckView = {
  ready: true,
  hero: '01001a',
  heroName: 'Spider-Man',
  deckName: 'Friendly neighbourhood',
  handCount: 0,
};
const captainMarvel: DeckView = {
  ready: true,
  hero: '01010a',
  heroName: 'Captain Marvel',
  deckName: 'Higher, further, faster',
  handCount: 0,
};

const alex: PlayerView = { name: 'Alex', color: 0, host: true, ready: false, decks: [noDeck] };
const sam: PlayerView = { name: 'Sam', color: 1, host: false, ready: false, decks: [noDeck] };
const jo: PlayerView = { name: 'Jo', color: 2, host: false, ready: true, decks: [spiderMan] };

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

/** The seat of a player in the players area. */
function seatRow(playerName: string): HTMLElement {
  const row = screen.getByText(playerName).closest('.seat');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${playerName}`);
  return row;
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
});

afterEach(() => {
  vi.mocked(loadIndex).mockReset();
});

describe('Lobby', () => {
  it('titles the screen and tells the host what to do', () => {
    renderLobby({});

    expect(screen.getByText('Lobby').classList.contains('caption')).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'ASSEMBLE YOUR TEAM' })).toBeTruthy();
    expect(
      screen.getByText(
        'You are the host: you choose the scenario, and everyone sees it. Each player brings their own deck.',
      ),
    ).toBeTruthy();
  });

  it('tells a guest who chooses the scenario', () => {
    renderLobby({ you: asSam });

    expect(
      screen.getByText(
        'Alex is the host: they choose the scenario, and everyone sees it. Bring your own deck.',
      ),
    ).toBeTruthy();
  });

  it('tells a spectator who chooses the scenario', () => {
    renderLobby({ you: { role: 'spectator', name: 'Max', color: 0, host: false } });

    expect(
      screen.getByText(
        'You are watching: Alex chooses the scenario, and each player brings their own deck.',
      ),
    ).toBeTruthy();
  });

  it('marks the chosen scenario as pressed', async () => {
    renderLobby({
      config: {
        scenario: 'rhino',
        difficulty: 'standard',
        standard: 'standard',
        expert: '',
        modulars: ['bomb_scare'],
      },
    });

    const rhino = await screen.findByRole('button', { name: /Rhino/ });
    expect(rhino.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Klaw/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Modular sets')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Bomb Scare' })).toBeTruthy();
  });

  it('shows the full scenario name in a tooltip when it is cut short, and no native title', async () => {
    renderLobby({});

    const klaw = await screen.findByRole('button', { name: /Klaw/ });
    // The pack's name shows in the header above, and support on the tile itself.
    expect(klaw.hasAttribute('title')).toBe(false);
    const name = klaw.querySelector<HTMLElement>('.nm')!;
    cutShort(name);
    await fireEvent.pointerOver(name);
    expect(name.dataset.tip).toBe('Klaw');
  });

  it('shows the first pack and two rows of villains, the rest scrolling', async () => {
    // jsdom lays nothing out: the observer is triggered and the sizes are set by hand.
    const observed: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly entry: { callback: ResizeObserverCallback; targets: Element[] };
        constructor(callback: ResizeObserverCallback) {
          this.entry = { callback, targets: [] };
          observed.push(this.entry);
        }
        observe(target: Element): void {
          this.entry.targets.push(target);
        }
        unobserve(): void {}
        disconnect(): void {
          this.entry.targets = [];
        }
      },
    );
    try {
      renderLobby({});
      await screen.findByRole('button', { name: /Klaw/ });
      const list = document.querySelector<HTMLElement>('.villains')!;
      expect(list.style.getPropertyValue('--visible-height')).toBe('');

      const sized = (height: number) => () => new DOMRect(0, 0, 200, height);
      list.querySelector<HTMLElement>('.pkname')!.getBoundingClientRect = sized(41);
      list.querySelector<HTMLElement>('.vil')!.getBoundingClientRect = sized(112.5);
      list.querySelector<HTMLElement>('.vgrid')!.style.rowGap = '12px';
      for (const { callback, targets } of observed) {
        if (targets.includes(list)) {
          callback([], {} as ResizeObserver);
        }
      }
      await tick();

      expect(list.style.getPropertyValue('--visible-height')).toBe(`${41 + 2 * 112.5 + 12}px`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('names no deck provider in its copy', async () => {
    renderLobby({});
    await screen.findByRole('button', { name: /Rhino/ });

    const deckLink = screen.getByRole('textbox', { name: 'Deck link' });
    expect(deckLink.getAttribute('placeholder')).toBe('Paste a deck link…');
    expect(document.body.innerHTML).not.toMatch(/marvelcdb/i);
  });

  it('unsupported scenarios are not clickable', async () => {
    const session = renderLobby({});

    const tile = await screen.findByRole('button', { name: /Marauders/ });
    expect(tile.textContent).toContain('Not supported yet');
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
    expect(screen.getByText("Waiting for your deck and Sam's deck.")).toBeTruthy();
  });

  it('start disabled until a modular set is chosen for a scenario that recommends one', async () => {
    const rhino: LobbyConfig = { ...noScenario, scenario: 'rhino', standard: 'standard' };
    renderLobby({ players: [{ ...alex, decks: [spiderMan] }], config: rhino });

    expect(await screen.findByText('Choose at least one modular set.')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Set up the table' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
  });

  it('start enabled once a modular set is chosen', async () => {
    const rhino: LobbyConfig = {
      ...noScenario,
      scenario: 'rhino',
      standard: 'standard',
      modulars: ['bomb_scare'],
    };
    renderLobby({ players: [{ ...alex, decks: [spiderMan] }], config: rhino });

    await screen.findByRole('button', { name: /Rhino/ });
    expect(screen.getByText('Everyone is ready.')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Set up the table' });
    expect((start as HTMLButtonElement).disabled).toBe(false);
  });

  it('start enabled without a modular set for a scenario that recommends none', async () => {
    const wreckingCrew: LobbyConfig = {
      ...noScenario,
      scenario: 'wrecking_crew',
      standard: 'standard',
    };
    renderLobby({ players: [{ ...alex, decks: [spiderMan] }], config: wreckingCrew });

    await screen.findByRole('button', { name: /Wrecking Crew/ });
    expect(screen.getByText('Everyone is ready.')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Set up the table' });
    expect((start as HTMLButtonElement).disabled).toBe(false);
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
    expect(screen.queryByText('Your decks')).toBeNull();
    const firstSeat = seats[0];
    if (!firstSeat) throw new Error('no free seat');
    await fireEvent.click(firstSeat);
    expect(session.lobby).toHaveBeenCalledWith('takeSeat');
  });

  it("shows the hero image of a player's identity, from the view", async () => {
    renderLobby({ players: [alex, { ...jo, decks: [{ ...spiderMan, heroImage: 'hero.jpg' }] }] });

    const image = await screen.findByRole('img', { name: 'Spider-Man' });
    expect(image.getAttribute('src')).toBe('hero.jpg');
    expect(within(seatRow('Jo')).getByText('Spider-Man').tagName).toBe('B');
    expect(within(seatRow('Jo')).getByText('Friendly neighbourhood')).toBeTruthy();
  });

  it("shows a seat's full hero and deck names in a tooltip when they are cut short", async () => {
    renderLobby({ players: [alex, { ...jo, decks: [spiderMan] }] });

    for (const name of ['Spider-Man', 'Friendly neighbourhood']) {
      const line = within(seatRow('Jo')).getByText(name);
      cutShort(line);
      await fireEvent.pointerOver(line);
      expect(line.dataset.tip).toBe(name);
    }
  });

  it('shows a placeholder for a player without a hero image', () => {
    renderLobby({ players: [alex, jo] });
    expect(screen.queryByRole('img', { name: 'Spider-Man' })).toBeNull();
  });

  it('shows the hero image of the loaded deck at the size of its seat', () => {
    const asJo: YouView = { role: 'player', name: 'Jo', color: 2, host: false };
    renderLobby({
      you: asJo,
      players: [alex, { ...jo, decks: [{ ...spiderMan, heroImage: 'hero.jpg' }] }],
    });

    const images = screen.getAllByRole('img', { name: 'Spider-Man' });
    expect(images.map((image) => image.getAttribute('src'))).toEqual(['hero.jpg', 'hero.jpg']);
    // Both boxes share one portrait size, so the names beside it line up the same way.
    expect(images.every((image) => image.classList.contains('hero'))).toBe(true);
  });

  it('loads a deck from its link', async () => {
    const session = renderLobby({});

    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
      target: { value: ' https://marvelcdb.com/decklist/view/1 ' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(session.lobby).toHaveBeenCalledWith('setDeck', {
      url: 'https://marvelcdb.com/decklist/view/1',
      deck: 0,
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
      view: lobbyView([alex, { ...sam, ready: true, decks: [captainMarvel] }]),
    });

    const deckBox = screen.getByText('Your decks').closest('section');
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

    await fireEvent.click(await screen.findByRole('button', { name: '+ Add a set' }));
    const menu = document.querySelector('.menu');
    if (!menu) throw new Error('menu did not open');
    await fireEvent.click(menu);
    expect(document.querySelector('.menu')).not.toBeNull();

    await fireEvent.click(document.body);
    expect(document.querySelector('.menu')).toBeNull();
  });
  it('row lists each slot', () => {
    renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

    const row = seatRow('Alex');
    expect(within(row).getByText('Spider-Man')).toBeTruthy();
    expect(within(row).getByText('Friendly neighbourhood')).toBeTruthy();
    expect(within(row).getByText('No deck yet')).toBeTruthy();
    expect(within(row).getByText('you · host')).toBeTruthy();
  });

  it('ready per slot', () => {
    renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

    const row = screen.getByText('Alex').closest('.seat');
    if (!(row instanceof HTMLElement)) throw new Error('no row for Alex');
    expect(within(row).getAllByText('Ready')).toHaveLength(1);
    expect(within(row).getAllByText('Waiting')).toHaveLength(1);
  });

  it('add a deck sends addDeck', async () => {
    const session = renderLobby({});

    await fireEvent.click(screen.getByRole('button', { name: 'Add a deck' }));

    expect(session.lobby).toHaveBeenCalledWith('addDeck');
  });

  it('load on slot 1 sends setDeck deck 1', async () => {
    const session = renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck 2 link' }), {
      target: { value: 'https://example.com/deck/2' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(session.lobby).toHaveBeenCalledWith('setDeck', {
      url: 'https://example.com/deck/2',
      deck: 1,
    });
  });

  it('addDeck hidden at 4 slots', () => {
    renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam, jo] });

    expect(screen.queryByRole('button', { name: 'Add a deck' })).toBeNull();
    expect(screen.queryByText(/Free seat/)).toBeNull();
  });

  it('shows one free seat per slot left', () => {
    renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

    expect(screen.getAllByText(/Free seat/)).toHaveLength(1);
  });

  it('remove shown only with 2+ slots', () => {
    renderLobby({});
    expect(screen.queryByRole('button', { name: /^Remove deck/ })).toBeNull();
  });

  it('removes one of several decks by its slot', async () => {
    const session = renderLobby({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

    expect(screen.getAllByRole('button', { name: /^Remove deck/ })).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 2' }));

    expect(session.lobby).toHaveBeenCalledWith('removeDeck', { deck: 1 });
  });

  it('start names missing deck', () => {
    renderLobby({
      you: asSam,
      players: [
        { ...alex, decks: [spiderMan, noDeck] },
        { ...sam, ready: true, decks: [captainMarvel] },
      ],
    });

    expect(screen.getByText("Waiting for Alex's deck.")).toBeTruthy();
  });

  it('counts the missing decks of one player', () => {
    renderLobby({
      you: asSam,
      players: [
        { ...alex, decks: [noDeck, noDeck] },
        { ...sam, ready: true, decks: [captainMarvel] },
      ],
    });

    expect(screen.getByText("Waiting for Alex's 2 decks.")).toBeTruthy();
  });

  it('renders hero names as text', () => {
    const hostile = '<img src="x" onerror="alert(1)">';
    renderLobby({
      players: [
        alex,
        { ...jo, decks: [{ ...spiderMan, heroName: hostile, deckName: '<b>bold</b>' }] },
      ],
    });

    expect(screen.getByText(hostile)).toBeTruthy();
    expect(screen.getByText('<b>bold</b>')).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect([...document.querySelectorAll('b')].some((b) => b.textContent === 'bold')).toBe(false);
  });

  it('shows a failed deck load under the slot that was loaded', async () => {
    const live = renderLive();
    await live.receive({
      type: 'view',
      version: 2,
      view: lobbyView([{ ...alex, decks: [spiderMan, noDeck] }, sam]),
    });
    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck 2 link' }), {
      target: { value: 'https://example.com/nope' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await live.receive({ type: 'error', code: 'deck', message: 'This deck link is not valid.' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('This deck link is not valid.');
    expect(alert.closest('.slot')?.querySelector('input')?.id).toBe(
      screen.getByRole('textbox', { name: 'Deck 2 link' }).id,
    );
  });

  it('keeps no typed link in a slot once an earlier slot is removed', async () => {
    const live = renderLive();
    await live.receive({
      type: 'view',
      version: 2,
      view: lobbyView([{ ...alex, decks: [noDeck, noDeck, noDeck] }, sam]),
    });
    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck 1 link' }), {
      target: { value: 'https://example.com/deck/1' },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 1' }));
    await live.receive({
      type: 'view',
      version: 3,
      view: lobbyView([{ ...alex, decks: [noDeck, noDeck] }, sam]),
    });

    // Deck 1 is the former deck 2 now: the link typed for the removed deck is gone.
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck 1 link' }).value).toBe('');
  });

  it('shows no failed deck load under another slot once a slot is removed', async () => {
    const live = renderLive();
    await live.receive({
      type: 'view',
      version: 2,
      view: lobbyView([{ ...alex, decks: [noDeck, noDeck, noDeck] }, sam]),
    });
    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck 2 link' }), {
      target: { value: 'https://example.com/nope' },
    });
    await fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[1]!);
    await live.receive({ type: 'error', code: 'deck', message: 'This deck link is not valid.' });
    expect(screen.getByRole('alert')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 1' }));
    await live.receive({
      type: 'view',
      version: 3,
      view: lobbyView([{ ...alex, decks: [noDeck, noDeck] }, sam]),
    });

    // Slot 1 now holds the former deck 3, which never failed to load.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
