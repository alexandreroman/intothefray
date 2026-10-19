import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { FOCUS_MARGINS, TABLE_EDGE, TABLE_EDGE_BOTTOM } from './focus';
import { fanPositions, HAND_CARD_NARROW } from './layout';
import { knownCard, loadGameCards, loadIndex } from '../lib/catalog';
import type { CardView as TableCard, PresenceState, View } from '../lib/types';
import tableSource from './Table.svelte?raw';
import sidePanelSource from './SidePanel.svelte?raw';
import zoomSource from './ZoomControl.svelte?raw';

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

/** A face-up card of Sam's in play: hovered, it is previewed (a hand card or a back is not). */
const IN_PLAY: TableCard = {
  id: 't1',
  code: '01001',
  face: 0,
  back: 'player',
  owner: 0,
  zone: 'table',
  x: 300,
  y: 0,
  z: 1,
};

/** Rhino with the viewer, Sam, alone at the table, holding three cards, one card in play. */
function makeView(): View {
  const hand = [handCard('h1'), handCard('h2'), handCard('h3')];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Sam',
        color: 0,
        host: true,
        ready: true,
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: hand.length }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [...hand, IN_PLAY],
      piles: [],
      stages: [],
      hands: { p0: hand.map((card) => card.id) },
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
function cardInPlay(): HTMLElement {
  return document.querySelector<HTMLElement>('.surface .card[data-id="t1"]')!;
}

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

    await fireEvent.pointerEnter(cardInPlay());
    const preview = peek(container);
    expect(preview).not.toBeNull();
    expect(within(preview as HTMLElement).getByLabelText('Card preview')).toBeTruthy();
  });

  it('wide layout keeps the history column, the preview floating over the table', async () => {
    mockScreen(false);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(within(sidePanel() as HTMLElement).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(within(sidePanel() as HTMLElement).queryByLabelText('Card preview')).toBeNull();
    expect(peek(container)).toBeNull();

    await fireEvent.pointerEnter(cardInPlay());
    expect(within(peek(container) as HTMLElement).getByLabelText('Card preview')).toBeTruthy();
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' }, 0);
  });

  it('narrow layout ignores a collapsed history: no strip, the floating Undo', () => {
    localStorage.setItem('itf-history-collapsed', '1');
    mockScreen(true);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(container.querySelector('.app')?.classList).not.toContain('history-collapsed');
    expect(sidePanel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand history' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Undo last action' })).toHaveLength(1);
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

describe('Table in the window', () => {
  it('locks the page while it shows: only the surface scrolls', () => {
    mockScreen(false);
    const page = document.documentElement;
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    expect(page.classList).toContain('fixed-screen');

    unmount();
    expect(page.classList).not.toContain('fixed-screen');
  });

  it('keeps the page and the table to the window, clipping the lowered hand', () => {
    // jsdom applies no stylesheet: the rules themselves are checked.
    const pageRule = /:global\(html\.fixed-screen body\) \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(pageRule).toMatch(/height:\s*100%/);
    expect(pageRule).toMatch(/overflow:\s*hidden/);
    const appRule = /\n {2}\.app \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(appRule).toMatch(/height:\s*100dvh/);
    expect(appRule).toMatch(/overflow:\s*clip/);
  });

  it('lines the preview, the zoom control and the player selector up on one edge', async () => {
    mockScreen(false);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.style.getPropertyValue('--edge')).toBe(`${TABLE_EDGE}px`);

    await fireEvent.pointerEnter(cardInPlay());
    // At home, bottom right: the same room on the right as the controls under it.
    const panel = peek(container)!;
    expect(panel.classList).toContain('bottom-right');
    expect(panel.style.margin.split(' ')[1]).toBe(`${TABLE_EDGE}px`);
    const cornerRule = /\n {2}\.corner \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(cornerRule).toMatch(/margin: 0 var\(--edge\) var\(--edge-bottom\) 0;/);
    const pickerRule = /\n {2}\.seatpick \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(pickerRule).toMatch(/margin: 0 0 var\(--edge-bottom\) var\(--edge\);/);
    // The history's Undo button keeps the same room under it: its bottom edge on the zoom
    // control's.
    expect(app.style.getPropertyValue('--edge-bottom')).toBe(`${TABLE_EDGE_BOTTOM}px`);
    const undoRule = /\n {2}\.undo \{([^}]*)\}/.exec(sidePanelSource)?.[1];
    expect(undoRule).toMatch(/padding: [^;]* var\(--edge-bottom\);/);
    expect(FOCUS_MARGINS.bottom).toBe(TABLE_EDGE_BOTTOM);
  });

  it("gives the player selector the zoom control's height, so that their edges line up", () => {
    const appRule = /\n {2}\.app \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(appRule).toMatch(/--bar-button: 32px;/);
    const zoomButtonRule = /\n {2}button \{([^}]*)\}/.exec(zoomSource)?.[1];
    expect(zoomButtonRule).toMatch(/height: var\(--bar-button\);/);
    const swatchesRule = /\n {2}\.seatpick \.seats \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(swatchesRule).toMatch(/height: var\(--bar-button\);/);
    const stepRule = /\n {2}\.seatpick \.step \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(stepRule).toMatch(/height: var\(--bar-button\);/);
  });
});
