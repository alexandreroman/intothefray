import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView, View } from '../lib/types';

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
  vi.mocked(loadAllCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(cardByCode).mockReset();
});

describe('Table', () => {
  it('renders a zone per area in order', async () => {
    render(Table, { view: makeView() });

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
    render(Table, { view: makeView() });
    await screen.findByRole('region', { name: /Rhino/ });
    expect(loadAllCards).toHaveBeenCalledOnce();
  });

  it('zone header text', async () => {
    render(Table, { view: makeView() });

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
    render(Table, { view });

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
    render(Table, { view });

    // 300 + 140 + 20, and the card itself gets the std box.
    expect(surfaceOf(/^Villain/).style.height).toBe('460px');
    const placed = surfaceOf(/^Villain/).querySelector<HTMLElement>('.card');
    expect(placed?.style.height).toBe('140px');
    expect(knownCard).not.toHaveBeenCalled();
  });

  it('shows a non-blocking error when the catalog fails to load', async () => {
    vi.mocked(loadAllCards).mockRejectedValue(new Error('offline'));
    render(Table, { view: makeView() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Card data could not be loaded',
    );
    expect(screen.getAllByRole('region')).toHaveLength(3);
  });

  it('dragging a separator resizes the zone above, snapped and never below its minimum', async () => {
    render(Table, { view: makeView() });
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

  it('zoom buttons clamp to 50–200 and persist', async () => {
    render(Table, { view: makeView() });
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

  it('restores the stored zoom and applies it as --z', () => {
    localStorage.setItem('itf-zoom', '1.5');
    const { container } = render(Table, { view: makeView() });

    expect(zoomLabel().textContent).toBe('150%');
    expect(container.querySelector<HTMLElement>('.table')?.style.getPropertyValue('--z')).toBe(
      '1.5',
    );
  });

  it('Ctrl + wheel zooms, a plain wheel does not', async () => {
    const { container } = render(Table, { view: makeView() });
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

  it('shows the keyboard shortcuts button as ?', () => {
    render(Table, { view: makeView() });
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' }).textContent?.trim()).toBe(
      '?',
    );
  });

  it('places the first player token in its zone', async () => {
    render(Table, { view: makeView() });

    const token = await screen.findByRole('img', { name: 'First player' });
    expect(token.getAttribute('src')).toBe(FIRST_PLAYER_TOKEN);
    const placed = token.closest<HTMLElement>('.fptoken');
    expect(placed?.style.left).toBe('860px');
    expect(placed?.style.top).toBe('40px');
    expect(surfaceOf(/^Alex/).contains(token)).toBe(true);
  });

  it('draws the first player token with the minimal theme', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(Table, { view: makeView() });

    const token = screen.getByRole('img', { name: 'First player' });
    expect(token.tagName.toLowerCase()).toBe('svg');
  });

  it('shows the top card of a pile that lists its cards', async () => {
    const view = makeView({
      cards: [card('t', { code: '01001', zone: 'pile', x: 0, y: 0 })],
      piles: [pile('x0', { kind: 'discard', owner: 0, area: 'p0', count: 1, cards: ['t'] })],
    });
    render(Table, { view });

    const top = await within(screen.getByRole('region', { name: /^Alex/ })).findByRole('img', {
      name: 'Spider-Man',
    });
    expect(top.getAttribute('src')).toBe('01001.png');
  });
});
