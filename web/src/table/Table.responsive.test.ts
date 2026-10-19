import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { fanPositions, HAND_CARD_NARROW } from './layout';
import { knownCard, loadGameCards } from '../lib/catalog';
import type { CardView as TableCard, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

/** A media query list whose match can be changed, as a resized window would. */
class FakeMediaQueryList extends EventTarget {
  onchange = null;

  constructor(
    readonly media: string,
    public matches: boolean,
  ) {
    super();
  }

  addListener(): void {}
  removeListener(): void {}

  resize(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

/** Makes every media query match (narrow) or not (wide), and returns the lists handed out. */
function mockScreen(narrow: boolean): FakeMediaQueryList[] {
  const lists: FakeMediaQueryList[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = new FakeMediaQueryList(query, narrow);
    lists.push(list);
    return list as unknown as MediaQueryList;
  });
  return lists;
}

function handCard(id: string): TableCard {
  return { id, face: 0, back: 'player', owner: 0, zone: 'hand', x: 0, y: 0, z: 0 };
}

/** Rhino with the viewer, Sam, alone at the table, holding three cards. */
function makeView(): View {
  const hand = [handCard('h1'), handCard('h2'), handCard('h3')];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 0, host: true, area: 'p0' },
    players: [
      {
        name: 'Sam',
        color: 0,
        host: true,
        area: 'p0',
        heroName: 'Spider-Man',
        ready: true,
        handCount: hand.length,
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: hand,
      piles: [],
      stages: [],
      hand: hand.map((card) => card.id),
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
  };
}

function fakeSession() {
  return {
    act: vi.fn(() => 1),
    lobby: vi.fn(() => true),
    lastError: null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
    viewGap: 0,
  };
}

function sidePanel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Preview and history' });
}

function sideToggle(): HTMLElement {
  return screen.getByRole('button', { name: 'Preview and history' });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Table on a narrow screen', () => {
  it('narrow layout uses a drawer', async () => {
    mockScreen(true);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector('.app') as HTMLElement;

    // Closed, the drawer is off the screen and out of reach of the keyboard.
    expect(sidePanel().classList).not.toContain('open');
    expect(sidePanel().inert).toBe(true);
    expect(sideToggle().getAttribute('aria-pressed')).toBe('false');

    await fireEvent.click(sideToggle());
    expect(sidePanel().classList).toContain('open');
    expect(sidePanel().inert).toBe(false);
    expect(sideToggle().getAttribute('aria-pressed')).toBe('true');
    // The drawer is not the desktop column: its preference stays untouched.
    expect(app.classList).not.toContain('side-hidden');
    expect(localStorage.getItem('itf-side-hidden')).toBeNull();

    await fireEvent.click(within(sidePanel()).getByRole('button', { name: 'Close' }));
    expect(sidePanel().classList).not.toContain('open');
    expect(sidePanel().inert).toBe(true);
  });

  it('wide layout keeps the column, without a close button', () => {
    mockScreen(false);
    render(Table, { session: fakeSession(), view: makeView() });

    expect(sidePanel().inert).toBe(false);
    expect(within(sidePanel()).queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('follows the window as it narrows', async () => {
    const lists = mockScreen(false);
    render(Table, { session: fakeSession(), view: makeView() });

    for (const list of lists) {
      list.resize(true);
    }
    await fireEvent.click(sideToggle());

    expect(sidePanel().classList).toContain('open');
    expect(within(sidePanel()).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('narrow hand uses smaller cards', () => {
    mockScreen(true);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(800);
    render(Table, { session: fakeSession(), view: makeView() });

    const hand = screen.getByRole('list', { name: 'Your hand' });
    expect(hand.style.getPropertyValue('--card-w')).toBe(`${HAND_CARD_NARROW.w}px`);
    expect(hand.style.getPropertyValue('--card-h')).toBe(`${HAND_CARD_NARROW.h}px`);

    const slots = fanPositions(3, 800, HAND_CARD_NARROW.w);
    const xs = within(hand)
      .getAllByRole('listitem')
      .map((item) => item.style.getPropertyValue('--x'));
    expect(xs).toEqual(slots.map((slot) => `${slot.x}px`));
  });
});
