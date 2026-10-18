import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction, LINGER_MS } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { Area, CardView as TableCard, PackFace, PileView, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
}));

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
  return { card: { code, faces: [full], back: 'player', quantity: 1 }, face: 0, pack: 'core' };
}

function card(id: string, extra: Partial<TableCard>): TableCard {
  return { id, face: 0, back: 'player', owner: -1, zone: 'table', x: 0, y: 0, z: 1, ...extra };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 3, ...extra };
}

function fakeSession() {
  return { act: vi.fn(() => 1), lobby: vi.fn(() => true) };
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

/** Where an out-of-play pile of a zone lies, found by its badge. */
function outPileLeft(zone: RegExp, badge: string): string | undefined {
  const region = screen.getByRole('region', { name: zone });
  return within(region).getByRole('img', { name: badge }).closest<HTMLElement>('.pile')?.style.left;
}

function zoomLabel(): HTMLElement {
  return screen.getByRole('button', { name: 'Back to 100%' });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
});

afterEach(() => {
  vi.useRealTimers();
  interaction.reset();
  vi.mocked(loadAllCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(cardByCode).mockReset();
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

  it('loads the catalog once for every zone', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await screen.findByRole('region', { name: /Rhino/ });
    expect(loadAllCards).toHaveBeenCalledOnce();
  });

  it('zone header text', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    const villain = await screen.findByRole('region', { name: 'Villain — Rhino (stage I)' });
    expect(within(villain).getByText('(stage I)').classList).toContain('aside');

    const own = screen.getByRole('region', { name: 'Sam — Ant-Man (5 cards in hand)' });
    expect(within(own).getByText('Sam').getAttribute('style')).toContain('color: var(--p2)');
    expect(within(own).getByText('(5 cards in hand)').classList).toContain('aside');

    const other = screen.getByRole('region', { name: 'Alex — Spider-Man (6 cards in hand)' });
    expect(within(other).getByText('Alex').getAttribute('style') ?? '').not.toContain('color');
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
    vi.mocked(loadAllCards).mockReturnValue(new Promise(() => {}));
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
    vi.mocked(loadAllCards).mockRejectedValue(new Error('offline'));
    render(Table, { session: fakeSession(), view: makeView() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Card data could not be loaded',
    );
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('after a failed load, every card is a std placeholder, as its zone is sized', async () => {
    vi.mocked(loadAllCards).mockRejectedValue(new Error('offline'));
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
    expect(cardByCode).not.toHaveBeenCalled();
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
    expect(keys.title).toBe('Keyboard shortcuts (?)');
    expect(keys.getAttribute('aria-keyshortcuts')).toBe('?');
  });

  it('places the out-of-play piles at the right of their zone', async () => {
    const view = makeView();
    view.table?.piles.push(
      pile('vic', { kind: 'victory', area: 'villain', x: 1080, count: 0 }),
      pile('aside', { kind: 'aside', area: 'villain', x: 1200, count: 0 }),
      pile('aside1', { kind: 'aside', owner: 1, area: 'p1', x: 1200, count: 0 }),
    );
    // Each zone scroller shows 1200 table units at 100 %, past its 24 px padding on each side.
    // The zoom is pinned: prefs keep earlier tests' zoom in memory.
    localStorage.setItem('itf-zoom', '1');
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1248);
    try {
      render(Table, { session: fakeSession(), view });
      await screen.findByRole('region', { name: /Rhino/ });

      // The villain's zone is the visible width: 1200 − 10 − 100, then 120 to the left.
      expect(surfaceOf(/^Villain/).style.width).toBe('1200px');
      expect(outPileLeft(/^Villain/, 'Set-aside cards')).toBe('1090px');
      expect(outPileLeft(/^Villain/, 'Victory display')).toBe('970px');
      expect(outPileLeft(/^Sam/, 'Set-aside cards')).toBe('1090px');
      // Piles in play keep their place.
      expect(surfaceOf(/^Villain/).querySelector<HTMLElement>('.pile:not(.out)')?.style.left).toBe(
        '500px',
      );
    } finally {
      width.mockRestore();
    }
  });

  it('widens a zone past its cards in play to fit its out-of-play piles', async () => {
    const view = makeView();
    view.table?.piles.push(
      pile('vic', { kind: 'victory', area: 'villain', x: 1080, count: 0 }),
      pile('aside', { kind: 'aside', area: 'villain', x: 1200, count: 0 }),
    );
    render(Table, { session: fakeSession(), view });
    await screen.findByRole('region', { name: /Rhino/ });

    // The encounter deck ends at 600: 600 + 140 + 2 × 120.
    expect(surfaceOf(/^Villain/).style.width).toBe('980px');
    expect(outPileLeft(/^Villain/, 'Victory display')).toBe('750px');
    expect(outPileLeft(/^Villain/, 'Set-aside cards')).toBe('870px');
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
    const view = { ...makeView(), canUndo: true, undoText: 'exhausted Rhino' };
    render(Table, { session, view });

    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'undo' });
  });

  it('side toggle persists and toggles class', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector('.app') as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'Preview and history' });
    expect(app.classList).not.toContain('side-hidden');
    expect(toggle.title).toBe('Hide the preview and history');
    expect(toggle.querySelector('.pane')?.classList).toContain('filled');

    await fireEvent.click(toggle);
    expect(app.classList).toContain('side-hidden');
    expect(localStorage.getItem('itf-side-hidden')).toBe('1');
    expect(toggle.title).toBe('Show the preview and history');
    expect(toggle.querySelector('.pane')?.classList).not.toContain('filled');

    await fireEvent.click(toggle);
    expect(app.classList).not.toContain('side-hidden');
    expect(localStorage.getItem('itf-side-hidden')).toBe('');
  });

  it('restores a hidden side panel', () => {
    localStorage.setItem('itf-side-hidden', '1');
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    expect(container.querySelector('.app')?.classList).toContain('side-hidden');
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
    vi.mocked(loadAllCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
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
