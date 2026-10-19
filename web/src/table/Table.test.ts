import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { interaction, LINGER_MS } from './interaction.svelte';
import { knownCard, loadGameCards, loadIndex, type CardInfo } from '../lib/catalog';
import type {
  Area,
  CardView as TableCard,
  Index,
  PackFace,
  PileView,
  PresenceState,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
}));

/**
 * Svelte's size bindings (bind:clientHeight) share one ResizeObserver, made on
 * first use: this one lets a test tell it an element was resized.
 */
class ManualResizeObserver {
  static readonly all: ManualResizeObserver[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    ManualResizeObserver.all.push(this);
  }

  static resized(target: Element): void {
    const entries = [{ target } as ResizeObserverEntry];
    for (const observer of ManualResizeObserver.all) {
      observer.callback(entries, observer as unknown as ResizeObserver);
    }
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ManualResizeObserver;

// The pack index of the fixture: what the top bar's crumb names.
const INDEX: Index = {
  version: 1,
  lang: 'en',
  packs: [],
  scenarios: [
    { id: 'rhino', name: 'Rhino', pack: 'core', image: '', supported: true, recommended: [] },
  ],
  sets: [
    { code: 'bomb_scare', name: 'Bomb Scare', pack: 'core', kind: 'modular' },
    { code: 'masters_of_evil', name: 'Masters of Evil', pack: 'core', kind: 'modular' },
  ],
};

const FIRST_PLAYER_TOKEN =
  'https://card-table.app/images/table/first_player_token_marvelchampions.png';

// The catalog of the fixture: code -> face 0.
const FACES: Record<string, Partial<PackFace>> = {
  '01094': { name: 'Rhino', type: 'villain', stage: 'I' },
  '01097': { name: 'The Break-In!', type: 'main_scheme', size: 'land' },
  '01001': { name: 'Spider-Man', type: 'hero' },
  '01010': { name: 'Giant form', type: 'hero', size: 'dstd' },
};

function infoOf(code: string): CardInfo | null {
  const face = FACES[code];
  if (!face) {
    return null;
  }
  const full: PackFace = { name: '', type: '', size: 'std', images: [`${code}.png`], ...face };
  return { card: { code, faces: [full], back: 'player', quantity: 1 }, face: 0 };
}

function card(id: string, extra: Partial<TableCard>): TableCard {
  return { id, face: 0, back: 'player', owner: -1, zone: 'table', x: 0, y: 0, z: 1, ...extra };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 3, ...extra };
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

/** Rhino with two players; the viewer is Sam, seated second (area p1). */
function makeView(extra: { cards?: TableCard[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('v', { code: '01094', back: 'villain', area: 'villain', x: 10, y: 0 }),
    card('s', { code: '01097', back: 'encounter', area: 'villain', x: 130, y: 0 }),
    card('a', { code: '01001', owner: 0, area: 'p0', x: 0, y: 0 }),
    card('b', { code: '01001', owner: 1, area: 'p1', x: 0, y: 0 }),
    card('h', { code: '01001', owner: 1, zone: 'hand', x: 0, y: 0 }),
  ];
  const piles = extra.piles ?? [
    pile('enc', { kind: 'encounter', area: 'villain', x: 500 }),
    pile('d0', { owner: 0, area: 'p0', x: 600 }),
    pile('d1', { owner: 1, area: 'p1', x: 600 }),
    pile('x1', { kind: 'discard', owner: 1, area: 'p1', x: 720, count: 0 }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 1, host: false, area: 'p1' },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        area: 'p0',
        heroName: 'Spider-Man',
        ready: true,
        handCount: 6,
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        area: 'p1',
        heroName: 'Ant-Man',
        ready: true,
        handCount: 5,
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
  };
}

function surfaceOf(name: RegExp): HTMLElement {
  const surface = screen.getByRole('region', { name }).querySelector<HTMLElement>('.surface');
  if (!surface) {
    throw new Error(`no surface in ${String(name)}`);
  }
  return surface;
}

/** Where a pile of a zone lies, found by its id. */
function pileLeft(zone: RegExp, id: string): string | undefined {
  const region = screen.getByRole('region', { name: zone });
  return region.querySelector<HTMLElement>(`.pile[data-id="${id}"]`)?.style.left;
}

function zoomLabel(): HTMLElement {
  return screen.getByRole('button', { name: 'Back to 100%' });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(loadIndex).mockResolvedValue(INDEX);
});

afterEach(() => {
  vi.useRealTimers();
  interaction.reset();
  vi.mocked(loadGameCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(loadIndex).mockReset();
});

describe('Table', () => {
  it('renders a zone per area in order', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    const zones = await screen.findAllByRole('region');
    expect(zones.map((z) => z.getAttribute('data-area'))).toEqual(['villain', 'p1', 'p0']);

    // Table cards and piles of each area, in that area's zone only; the hand is not on the table.
    const count = (zone: HTMLElement, selector: string) => zone.querySelectorAll(selector).length;
    const [villain, own, other] = zones as [HTMLElement, HTMLElement, HTMLElement];
    expect(count(villain, '.surface > .card:not(.pile)')).toBe(2);
    expect(count(villain, '.surface > .pile')).toBe(1);
    expect(count(own, '.surface > .card:not(.pile)')).toBe(1);
    expect(count(own, '.surface > .pile')).toBe(2);
    expect(count(other, '.surface > .card:not(.pile)')).toBe(1);
    expect(count(other, '.surface > .pile')).toBe(1);
  });

  it('loads the cards of its game once for every zone', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await screen.findByRole('region', { name: /Rhino/ });
    expect(loadGameCards).toHaveBeenCalledExactlyOnceWith('g1');
  });

  it('zone header text', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    // The villain's zone is named in a caption box.
    const villain = await screen.findByRole('region', { name: 'Villain Rhino · stage I' });
    expect(within(villain).getByText('Villain').classList).toContain('caption');

    // A player's zone has their seat colour, and the viewer's own says so.
    const own = screen.getByRole('region', { name: 'Sam · Ant-Man · you · 5 cards in hand' });
    expect(own.getAttribute('style')).toContain('--seat: var(--p2)');
    expect(own.querySelector('.seat')).not.toBeNull();
    expect(
      within(own).getByText('· Ant-Man · you · 5 cards in hand', { exact: false }),
    ).toBeTruthy();

    const other = screen.getByRole('region', { name: 'Alex · Spider-Man · 6 cards in hand' });
    expect(other.getAttribute('style')).toContain('--seat: var(--p1)');
    expect(within(other).queryByText('Villain')).toBeNull();
  });

  it('zone height grows with a low card', async () => {
    const view = makeView({
      cards: [
        card('v', { code: '01094', back: 'villain', area: 'villain', x: 10, y: 0 }),
        // A double-size card (200 high) whose top is at 300: 300 + 200 + 20.
        card('g', { code: '01010', area: 'villain', x: 200, y: 300 }),
      ],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });

    await waitFor(() => {
      expect(surfaceOf(/^Villain/).style.height).toBe('520px');
    });
    // An empty zone keeps one card row plus 60.
    expect(surfaceOf(/^Alex/).style.height).toBe('200px');
  });

  it('sizes cards as std until the catalog is loaded', () => {
    vi.mocked(loadGameCards).mockReturnValue(new Promise(() => {}));
    const view = makeView({
      cards: [card('g', { code: '01010', area: 'villain', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });

    // 300 + 140 + 20, and the card itself gets the std box.
    expect(surfaceOf(/^Villain/).style.height).toBe('460px');
    const placed = surfaceOf(/^Villain/).querySelector<HTMLElement>('.card');
    expect(placed?.style.height).toBe('140px');
    expect(knownCard).not.toHaveBeenCalled();
  });

  it('shows a non-blocking error when the catalog fails to load', async () => {
    vi.mocked(loadGameCards).mockRejectedValue(new Error('offline'));
    render(Table, { session: fakeSession(), view: makeView() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Card data could not be loaded',
    );
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('after a failed load, every card is a std placeholder, as its zone is sized', async () => {
    vi.mocked(loadGameCards).mockRejectedValue(new Error('offline'));
    const view = makeView({
      cards: [card('g', { code: '01010', area: 'villain', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });
    await screen.findByRole('alert');

    const surface = surfaceOf(/^Villain/);
    // 300 + 140 + 20: the zone counts the card as std, and the card is drawn std.
    expect(surface.style.height).toBe('460px');
    await Promise.resolve();
    expect(surface.querySelector<HTMLElement>('.card')?.style.height).toBe('140px');
    expect(within(surface).queryByRole('img', { name: 'Giant form' })).toBeNull();
  });

  it('dragging a separator resizes the zone above, snapped and never below its minimum', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const handle = await screen.findByTitle("Drag to resize the villain's zone");

    await fireEvent.pointerDown(handle, { clientY: 100 });
    await fireEvent.pointerMove(window, { clientY: 157 });
    expect(surfaceOf(/^Villain/).style.height).toBe('260px');

    await fireEvent.pointerMove(window, { clientY: -500 });
    expect(surfaceOf(/^Villain/).style.height).toBe('200px');

    await fireEvent.pointerUp(window);
    await fireEvent.pointerMove(window, { clientY: 400 });
    expect(surfaceOf(/^Villain/).style.height).toBe('200px');

    // Mine can be resized too; another player's zone follows its cards.
    expect(screen.getByTitle('Drag to resize your zone')).toBeTruthy();
    expect(screen.getAllByTitle(/^Drag to resize/)).toHaveLength(2);
  });

  it('a separator drag counts the pointer move in table units at any zoom', async () => {
    localStorage.setItem('itf-zoom', '2');
    render(Table, { session: fakeSession(), view: makeView() });
    const handle = await screen.findByTitle("Drag to resize the villain's zone");

    await fireEvent.pointerDown(handle, { clientY: 100 });
    await fireEvent.pointerMove(window, { clientY: 157 });
    // 57 px at 200 % are 28.5 units: 228.5, snapped to 230.
    expect(surfaceOf(/^Villain/).style.height).toBe('230px');
  });

  it('zoom buttons clamp to 50–200 and persist', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    expect(zoomLabel().textContent).toBe('100%');

    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 15; i++) {
      await fireEvent.click(zoomIn);
    }
    expect(zoomLabel().textContent).toBe('200%');
    expect(localStorage.getItem('itf-zoom')).toBe('2');

    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    for (let i = 0; i < 20; i++) {
      await fireEvent.click(zoomOut);
    }
    expect(zoomLabel().textContent).toBe('50%');
    expect(localStorage.getItem('itf-zoom')).toBe('0.5');

    await fireEvent.click(zoomIn);
    expect(zoomLabel().textContent).toBe('60%');

    await fireEvent.click(zoomLabel());
    expect(zoomLabel().textContent).toBe('100%');
    expect(localStorage.getItem('itf-zoom')).toBe('1');
  });

  it('restores the stored zoom and applies it as --z to the whole page', () => {
    localStorage.setItem('itf-zoom', '1.5');
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(zoomLabel().textContent).toBe('150%');
    // On the page rather than the table only: a drag layer outside the table needs it too.
    expect(container.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--z')).toBe('1.5');
  });

  it('Ctrl + wheel zooms, a plain wheel does not', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const wrap = container.querySelector('.tablewrap');
    if (!wrap) {
      throw new Error('no table wrap');
    }

    await fireEvent.wheel(wrap, { deltaY: -100 });
    expect(zoomLabel().textContent).toBe('100%');

    await fireEvent.wheel(wrap, { deltaY: -20, ctrlKey: true });
    expect(zoomLabel().textContent).toBe('120%');

    await fireEvent.wheel(wrap, { deltaY: 1000, metaKey: true });
    expect(zoomLabel().textContent).toBe('50%');
  });

  it('shows the keyboard shortcuts button as a keyboard, with ? as its key', () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const keys = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(keys.textContent?.trim()).toBe('');
    expect(keys.querySelector('svg rect')).toBeTruthy();
    // The app's tooltip names it with its key, as every zoom button's does.
    expect(keys.dataset).toMatchObject({ tip: 'Keyboard shortcuts', kbd: '?' });
    expect(keys.getAttribute('aria-keyshortcuts')).toBe('?');
    const kbds = ['Zoom out', 'Back to 100%', 'Zoom in'].map(
      (name) => screen.getByRole('button', { name }).dataset.kbd,
    );
    expect(kbds).toEqual(['−', '0', '+']);
  });

  it("keeps the out-of-play piles where the server sets them, in each zone's rail", async () => {
    const view = makeView();
    view.table?.piles.push(
      pile('vic', { kind: 'victory', area: 'villain', x: 240, y: 20, count: 0 }),
      pile('aside', { kind: 'aside', area: 'villain', x: 360, y: 20, count: 0 }),
      pile('aside1', { kind: 'aside', owner: 1, area: 'p1', x: 240, y: 20, count: 0 }),
    );
    // Each zone scroller shows 1200 table units at 100 %, past its 24 px padding on each side.
    // The zoom is pinned: prefs keep earlier tests' zoom in memory.
    localStorage.setItem('itf-zoom', '1');
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1248);
    try {
      render(Table, { session: fakeSession(), view });
      await screen.findByRole('region', { name: /Rhino/ });

      expect(surfaceOf(/^Villain/).style.width).toBe('1200px');
      expect(pileLeft(/^Villain/, 'vic')).toBe('240px');
      expect(pileLeft(/^Villain/, 'aside')).toBe('360px');
      expect(pileLeft(/^Sam/, 'aside1')).toBe('240px');
      expect(pileLeft(/^Villain/, 'enc')).toBe('500px');
    } finally {
      width.mockRestore();
    }
  });

  it('widens a zone past its rightmost pile, out-of-play ones included', async () => {
    const view = makeView();
    view.table?.piles.push(pile('aside', { kind: 'aside', area: 'villain', x: 800, count: 0 }));
    render(Table, { session: fakeSession(), view });
    await screen.findByRole('region', { name: /Rhino/ });

    // The set-aside pile ends at 900: 900 + 140.
    expect(surfaceOf(/^Villain/).style.width).toBe('1040px');
    expect(pileLeft(/^Villain/, 'aside')).toBe('800px');
  });

  it('chips count what is scrolled out of a zone, and scroll to it', async () => {
    localStorage.setItem('itf-zoom', '1');
    // Each zone scroller shows 200 table units.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(248);
    try {
      render(Table, { session: fakeSession(), view: makeView() });
      const villain = await screen.findByRole('region', { name: /Rhino/ });
      const scroller = villain.querySelector<HTMLElement>('.zscroll');
      if (!scroller) {
        throw new Error('no scroller');
      }
      const scrollTo = vi.fn();
      scroller.scrollTo = scrollTo;

      // At the start, the encounter deck (x 500) is out of view on the right.
      expect(within(villain).queryByRole('button', { name: /on the left/ })).toBeNull();
      const right = within(villain).getByRole('button', { name: '1 more on the right' });
      expect(right.textContent?.trim()).toBe('1 →');
      await fireEvent.click(right);
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 484, behavior: 'smooth' });

      // Scrolled to 600 px: Rhino and the main scheme are out on the left.
      Object.defineProperty(scroller, 'scrollLeft', { value: 600, configurable: true });
      await fireEvent.scroll(scroller);
      const left = within(villain).getByRole('button', { name: '2 more on the left' });
      expect(left.textContent?.trim()).toBe('← 2');
      expect(within(villain).queryByRole('button', { name: /on the right/ })).toBeNull();
      // Back to the nearest one, the main scheme at 130.
      await fireEvent.click(left);
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 114, behavior: 'smooth' });
    } finally {
      width.mockRestore();
    }
  });

  it('shows no chip before the zone is measured', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const villain = await screen.findByRole('region', { name: /Rhino/ });
    expect(within(villain).queryByRole('button', { name: /more on the/ })).toBeNull();
  });

  it('places the first player token in its zone', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    const token = await screen.findByRole('img', { name: 'First player' });
    expect(token.getAttribute('src')).toBe(FIRST_PLAYER_TOKEN);
    const placed = token.closest<HTMLElement>('.fptoken');
    expect(placed?.style.left).toBe('860px');
    expect(placed?.style.top).toBe('40px');
    expect(surfaceOf(/^Alex/).contains(token)).toBe(true);
  });

  it('draws the first player token with the minimal theme', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(Table, { session: fakeSession(), view: makeView() });

    const token = screen.getByRole('img', { name: 'First player' });
    expect(token.tagName.toLowerCase()).toBe('svg');
  });

  it('shows the top card of a pile that lists its cards', async () => {
    const view = makeView({
      cards: [card('t', { code: '01001', zone: 'pile', x: 0, y: 0 })],
      piles: [pile('x0', { kind: 'discard', owner: 0, area: 'p0', count: 1, cards: ['t'] })],
    });
    render(Table, { session: fakeSession(), view });

    const top = await within(screen.getByRole('region', { name: /^Alex/ })).findByRole('img', {
      name: 'Spider-Man',
    });
    expect(top.getAttribute('src')).toBe('01001.png');
  });

  it('hovering a card previews it; leaving it clears the preview after a linger', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const preview = screen.getByLabelText('Card preview');
    const villain = await screen.findByRole('region', { name: /Rhino/ });
    const rhino = await within(villain).findByRole('img', { name: 'Rhino' });

    await fireEvent.pointerEnter(rhino.closest('.card') as HTMLElement);
    expect(within(preview).getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe(
      '01094.png',
    );

    // The main scheme is landscape.
    const scheme = within(villain).getByRole('img', { name: 'The Break-In!' });
    await fireEvent.pointerEnter(scheme.closest('.card') as HTMLElement);
    expect(within(preview).getByRole('img', { name: 'The Break-In!' }).classList).toContain('land');

    vi.useFakeTimers();
    await fireEvent.pointerLeave(scheme.closest('.card') as HTMLElement);
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(within(preview).getByRole('img', { name: 'The Break-In!' })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1);
    expect(preview.textContent).toContain('Hover a card');
    expect(container.querySelector('.preview .art')).toBeNull();
  });

  it('previews the back of a face-down card; a deck keeps it, an empty pile clears it', async () => {
    localStorage.setItem('itf-theme', 'minimal');
    const view = makeView({
      cards: [card('f', { code: '01001', faceDown: true, back: 'player', area: 'villain' })],
      piles: [
        pile('enc', { kind: 'encounter', area: 'villain', x: 500 }),
        pile('x1', { kind: 'discard', owner: 1, area: 'p1', x: 720, count: 0 }),
      ],
    });
    const { container } = render(Table, { session: fakeSession(), view });
    const preview = screen.getByLabelText('Card preview');
    const surface = surfaceOf(/^Villain/);

    await fireEvent.pointerEnter(surface.querySelector('.card:not(.pile)') as HTMLElement);
    expect(within(preview).getByRole('img', { name: 'Player card back' })).toBeTruthy();

    // A deck shows nothing new: the preview keeps the card seen before.
    await fireEvent.pointerEnter(surface.querySelector('.pile') as HTMLElement);
    expect(within(preview).getByRole('img', { name: 'Player card back' })).toBeTruthy();

    // An empty pile shows nothing.
    await fireEvent.pointerEnter(container.querySelector('.pile.empty') as HTMLElement);
    expect(preview.textContent).toContain('Hover a card');
  });

  it('hovering a history line rings its cards on the table', async () => {
    const view = makeView();
    view.log = [
      { who: 'Sam', color: 1, text: 'exhausted Rhino', at: new Date().toISOString(), cards: ['v'] },
    ];
    render(Table, { session: fakeSession(), view });
    const villain = await screen.findByRole('region', { name: /Rhino/ });
    const rhino = await within(villain).findByRole('img', { name: 'Rhino' });
    const placed = rhino.closest('.card') as HTMLElement;
    expect(placed.classList).not.toContain('highlighted');

    const entry = within(screen.getByRole('list', { name: 'History' })).getByRole('listitem');
    await fireEvent.pointerEnter(entry);
    expect(placed.classList).toContain('highlighted');

    await fireEvent.pointerLeave(entry);
    expect(placed.classList).not.toContain('highlighted');
  });

  it("shows the viewer's hand in order; spectators have none", async () => {
    const view = makeView();
    view.table?.cards.push(card('h2', { code: '01094', owner: 1, zone: 'hand' }));
    view.table = { ...view.table!, hand: ['h2', 'h'] };
    const player = render(Table, { session: fakeSession(), view });

    const hand = screen.getByRole('list', { name: 'Your hand' });
    await within(hand).findByRole('img', { name: 'Spider-Man' });
    const names = within(hand)
      .getAllByRole('img')
      .map((image) => image.getAttribute('alt'));
    expect(names).toEqual(['Rhino', 'Spider-Man']);
    player.unmount();

    render(Table, {
      session: fakeSession(),
      view: { ...view, you: { role: 'spectator', name: 'Kim', color: -1, host: false } },
    });
    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();
  });

  it('hovering a hand card previews it', async () => {
    const view = makeView();
    view.table = { ...view.table!, hand: ['h'] };
    render(Table, { session: fakeSession(), view });
    const hand = screen.getByRole('list', { name: 'Your hand' });
    const inHand = await within(hand).findByRole('img', { name: 'Spider-Man' });

    await fireEvent.pointerEnter(inHand.closest('li') as HTMLElement);
    const preview = screen.getByLabelText('Card preview');
    expect(within(preview).getByRole('img', { name: 'Spider-Man' }).getAttribute('src')).toBe(
      '01001.png',
    );
  });

  it('undo sends the undo action', async () => {
    const session = fakeSession();
    const view = { ...makeView(), canUndo: true };
    render(Table, { session, view });

    await fireEvent.click(screen.getByRole('button', { name: 'Undo last action' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'undo' });
  });

  it('always shows the side panel, with no toggle', () => {
    localStorage.setItem('itf-side-hidden', '1');
    render(Table, { session: fakeSession(), view: makeView() });

    const side = screen.getByRole('complementary', { name: 'Preview and history' });
    expect(within(side).getByLabelText('Card preview')).toBeTruthy();
    expect(within(side).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Preview and history' })).toBeNull();
  });

  it('names the scenario, its difficulty and its modular sets in the top bar', async () => {
    const view = makeView();
    view.config = {
      ...view.config,
      difficulty: 'expert',
      modulars: ['bomb_scare', 'masters_of_evil'],
    };
    const { container } = render(Table, { session: fakeSession(), view });

    await waitFor(() => {
      expect(container.querySelector('header .crumbs')?.textContent?.trim()).toBe(
        'Rhino / Expert / Bomb Scare / Masters of Evil',
      );
    });
  });

  it('shows no crumb when the pack index cannot be loaded', async () => {
    vi.mocked(loadIndex).mockRejectedValue(new Error('offline'));
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await screen.findByRole('region', { name: /Rhino/ });
    expect(container.querySelector('header .crumbs')).toBeNull();
  });

  it('end game asks for confirmation (host only)', async () => {
    const guest = render(Table, { session: fakeSession(), view: makeView() });
    expect(screen.queryByRole('button', { name: 'End game' })).toBeNull();
    guest.unmount();

    const session = fakeSession();
    const view = makeView();
    view.you = { ...view.you, host: true };
    render(Table, { session, view });

    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    let dialog = screen.getByRole('alertdialog', { name: 'End this game for everyone?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Escape cancels too.
    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(session.lobby).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    dialog = screen.getByRole('alertdialog', { name: 'End this game for everyone?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(session.lobby).toHaveBeenCalledExactlyOnceWith('end');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the villain and own zones only grow on their own; other zones fit both ways', async () => {
    const low = (id: string, area: Area) => card(id, { code: '01001', area, x: 200, y: 300 });
    const high = (id: string, area: Area) => card(id, { code: '01001', area, x: 200, y: 0 });
    const viewWith = (cards: TableCard[]) => makeView({ cards, piles: [] });

    const { rerender } = render(Table, {
      session: fakeSession(),
      view: viewWith([low('v', 'villain'), low('b', 'p1'), low('a', 'p0')]),
    });
    // 300 + 140 + 20 in every zone.
    await waitFor(() => {
      expect(surfaceOf(/^Villain/).style.height).toBe('460px');
    });
    expect(surfaceOf(/^Sam/).style.height).toBe('460px');
    expect(surfaceOf(/^Alex/).style.height).toBe('460px');

    await rerender({
      session: fakeSession(),
      view: viewWith([high('v', 'villain'), high('b', 'p1'), high('a', 'p0')]),
    });
    expect(surfaceOf(/^Villain/).style.height).toBe('460px');
    expect(surfaceOf(/^Sam/).style.height).toBe('460px');
    expect(surfaceOf(/^Alex/).style.height).toBe('200px');

    // A grown zone can still be shrunk by hand, down to its cards.
    const handle = screen.getByTitle("Drag to resize the villain's zone");
    await fireEvent.pointerDown(handle, { clientY: 400 });
    await fireEvent.pointerMove(window, { clientY: 0 });
    await fireEvent.pointerUp(window);
    expect(surfaceOf(/^Villain/).style.height).toBe('200px');
  });

  it('does not keep the heights measured before the catalog is loaded', async () => {
    let loaded = () => {};
    vi.mocked(loadGameCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
    // The main scheme is landscape (100 high), but counts as std (140) until its size is known.
    const view = makeView({
      cards: [card('s', { code: '01097', area: 'villain', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });
    expect(surfaceOf(/^Villain/).style.height).toBe('460px');

    loaded();
    // 300 + 100 + 20.
    await waitFor(() => {
      expect(surfaceOf(/^Villain/).style.height).toBe('420px');
    });
  });

  it('a separator drag captures the pointer, keeping the resize cursor', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const handle = await screen.findByTitle("Drag to resize the villain's zone");
    const capture = vi.fn();
    handle.setPointerCapture = capture;

    await fireEvent.pointerDown(handle, { clientY: 100, pointerId: 7 });
    expect(capture).toHaveBeenCalledWith(7);
  });
});

describe('Table zone heights', () => {
  // The table shows 1590 px (until a test resizes it), and the zone headers and separators take
  // 90 of them.
  const VISIBLE = 1590;
  const CHROME = 90;

  let visible = VISIBLE;

  /** Lays the table out as a browser would, as far as the zone heights go. */
  function stubLayout(): void {
    visible = VISIBLE;
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('tablewrap') ? visible : 0;
    });
    // From the top of the first zone to the bottom of the last; the surfaces count for nothing.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const height = this.classList.contains('zsec') ? CHROME : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height } as DOMRect;
    });
  }

  const heights = () => [/^Villain/, /^Sam/, /^Alex/].map((name) => surfaceOf(name).style.height);

  /** Resizes the window: the table shows `height` px. */
  function resizeTable(container: HTMLElement, height: number): Promise<void> {
    visible = height;
    const wrap = container.querySelector('.tablewrap');
    if (!wrap) {
      throw new Error('no table');
    }
    ManualResizeObserver.resized(wrap);
    return tick();
  }

  beforeEach(stubLayout);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits the visible height in thirds for two players', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    await waitFor(() => {
      expect(heights()).toEqual(['500px', '500px', '500px']);
    });
  });

  it('follows the zoom, the last zone taking the rounding', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await waitFor(() => {
      expect(heights()).toEqual(['500px', '500px', '500px']);
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    // 1500 px at 110 % are 1363.6 units: 454 each, and the last one gets the rest, rounded up.
    expect(heights()).toEqual(['454px', '454px', '456px']);
  });

  it('gives a zone taller than its share what it needs, from the last one', async () => {
    const view = makeView({
      cards: [card('g', { code: '01010', area: 'villain', x: 200, y: 400 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });

    // 400 + 200 + 20 for the villain's zone.
    await waitFor(() => {
      expect(heights()).toEqual(['620px', '500px', '380px']);
    });
  });

  it('a resized zone only changes the last one', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const handle = await screen.findByTitle("Drag to resize the villain's zone");
    await waitFor(() => {
      expect(heights()).toEqual(['500px', '500px', '500px']);
    });

    await fireEvent.pointerDown(handle, { clientY: 100 });
    await fireEvent.pointerMove(window, { clientY: 200 });
    await fireEvent.pointerUp(window);
    expect(heights()).toEqual(['600px', '500px', '400px']);
  });

  it('follows the visible height when the window is resized', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await waitFor(() => {
      expect(heights()).toEqual(['500px', '500px', '500px']);
    });

    await resizeTable(container, 1290);
    expect(heights()).toEqual(['400px', '400px', '400px']);
  });

  it('a zone its cards kept under its share follows the share once they move up', async () => {
    // 300 + 140 + 20: under the 500 share.
    const low = card('v', { code: '01001', area: 'villain', x: 200, y: 300 });
    const high = card('v', { code: '01001', area: 'villain', x: 200, y: 0 });
    const { container, rerender } = render(Table, {
      session: fakeSession(),
      view: makeView({ cards: [low], piles: [] }),
    });
    await waitFor(() => {
      expect(heights()).toEqual(['500px', '500px', '500px']);
    });

    await rerender({ session: fakeSession(), view: makeView({ cards: [high], piles: [] }) });
    await resizeTable(container, 990);
    expect(heights()).toEqual(['300px', '300px', '300px']);
  });

  it('a zone its cards took past its share stays that tall once they move up', async () => {
    // 500 + 140 + 20: past the 500 share.
    const low = card('v', { code: '01001', area: 'villain', x: 200, y: 500 });
    const high = card('v', { code: '01001', area: 'villain', x: 200, y: 0 });
    const { container, rerender } = render(Table, {
      session: fakeSession(),
      view: makeView({ cards: [low], piles: [] }),
    });
    await waitFor(() => {
      expect(heights()).toEqual(['660px', '500px', '340px']);
    });

    await rerender({ session: fakeSession(), view: makeView({ cards: [high], piles: [] }) });
    expect(heights()).toEqual(['660px', '500px', '340px']);
    await resizeTable(container, 990);
    expect(heights()).toEqual(['660px', '300px', '200px']);
  });
});
