import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { fanPositions, HAND_CARD_NARROW } from './layout';
import { knownCard, loadGameCards, loadIndex } from '../lib/catalog';
import type { CardView as TableCard, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
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
      firstPlayer: { x: 860, y: 40 },
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

function sidePanel(): HTMLElement | null {
  return screen.queryByRole('complementary', { name: 'History' });
}

/** The preview over the table. */
function peek(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.peek');
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockReturnValue(null);
  vi.mocked(loadIndex).mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Table on a narrow screen', () => {
  it('narrow layout shows the preview over the table, and no history', async () => {
    mockScreen(true);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(sidePanel()).toBeNull();
    expect(screen.queryByRole('list', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    // Nothing to preview: nothing over the table.
    expect(peek(container)).toBeNull();

    const hand = screen.getByRole('list', { name: 'Your hand' });
    await fireEvent.pointerEnter(within(hand).getAllByRole('listitem')[0] as HTMLElement);
    const preview = peek(container);
    expect(preview).not.toBeNull();
    expect(within(preview as HTMLElement).getByLabelText('Focus')).toBeTruthy();
    expect(
      within(preview as HTMLElement).getByRole('img', { name: 'Player card back' }),
    ).toBeTruthy();
  });

  it('wide layout keeps the history column, the preview floating over the table', async () => {
    mockScreen(false);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(within(sidePanel() as HTMLElement).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(within(sidePanel() as HTMLElement).queryByLabelText('Focus')).toBeNull();
    expect(peek(container)).toBeNull();

    const hand = screen.getByRole('list', { name: 'Your hand' });
    await fireEvent.pointerEnter(within(hand).getAllByRole('listitem')[0] as HTMLElement);
    expect(within(peek(container) as HTMLElement).getByLabelText('Focus')).toBeTruthy();
  });

  it('follows the window as it narrows', async () => {
    const lists = mockScreen(false);
    render(Table, { session: fakeSession(), view: makeView() });
    expect(sidePanel()).not.toBeNull();

    for (const list of lists) {
      list.resize(true);
    }
    await tick();
    expect(sidePanel()).toBeNull();
  });

  it('narrow layout floats an Undo button over the table', async () => {
    mockScreen(true);
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView() });

    const undo = screen.getByRole('button', { name: 'Undo last action' });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.dataset.tip).toBe('Nothing of yours to undo');
    await fireEvent.click(undo);
    expect(session.act).not.toHaveBeenCalled();

    await rerender({ session, view: { ...makeView(), canUndo: true } });
    expect(undo.getAttribute('aria-disabled')).toBe('false');
    expect(undo.dataset.tip).toBe('Undo last action');
    await fireEvent.click(undo);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' });
  });

  it('wide layout has its Undo in the side column only', () => {
    mockScreen(false);
    render(Table, { session: fakeSession(), view: makeView() });

    const [undo, ...others] = screen.getAllByRole('button', { name: 'Undo last action' });
    expect(others).toHaveLength(0);
    expect(sidePanel()?.contains(undo as HTMLElement)).toBe(true);
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
