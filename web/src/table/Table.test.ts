import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { interaction, LINGER_MS } from './interaction.svelte';
import { knownCard, loadGameCards, loadIndex, type CardInfo } from '../lib/catalog';
import type { Lang } from '../lib/lang';
import surfaceSource from './Surface.svelte?raw';
import { cutShort } from '../lib/overflowTip.testing';
import { clearPrefMemory } from '../lib/prefs';
import type { CardView as TableCard, Index, PackFace, PileView, View } from '../lib/types';
import { fakeSession, infoFrom } from './fixtures.testing';

// The card language, as each test chooses: Options does not offer French, so no stored choice gives it.
const cardLang = vi.hoisted(() => ({ current: 'en' as Lang }));

vi.mock('../lib/lang', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/lang')>()),
  storedLang: () => cardLang.current,
}));

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
}));

afterEach(() => {
  cardLang.current = 'en';
});

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

const FIRST_PLAYER_TOKEN = 'https://img.intothefray.xyz/assets/first-player-v2.avif';

// The catalog of the fixture: code -> face 0.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01094': [{ name: 'Rhino', type: 'villain', stage: 'I' }],
  '01097': [{ name: 'The Break-In!', type: 'main_scheme', size: 'land' }],
  '01001': [{ name: 'Spider-Man', type: 'hero' }],
  '01010': [{ name: 'Giant form', type: 'hero', size: 'dstd' }],
};

const infoOf = infoFrom(FACES);

function card(id: string, extra: Partial<TableCard>): TableCard {
  return { id, face: 0, back: 'player', owner: -1, zone: 'table', x: 0, y: 0, z: 1, ...extra };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 3, ...extra };
}

/**
 * Rhino with two players; the viewer is Sam, seated second (p1). As the setup
 * lays them out: the villain's row at the top, Alex's row 330 below it, then
 * Sam's, each starting with its deck and discard pile.
 */
function makeView(extra: { cards?: TableCard[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('v', { code: '01094', back: 'villain', x: 360, y: 30 }),
    card('s', { code: '01097', back: 'encounter', x: 520, y: 30 }),
    card('a', { code: '01001', owner: 0, x: 360, y: 500 }),
    card('b', { code: '01001', owner: 1, x: 360, y: 830 }),
    card('h', { code: '01001', owner: 1, zone: 'hand', x: 0, y: 0 }),
  ];
  const piles = extra.piles ?? [
    pile('enc', { kind: 'encounter', x: 0, y: 30 }),
    pile('d0', { owner: 0, x: 0, y: 500 }),
    pile('d1', { owner: 1, x: 0, y: 830 }),
    pile('x1', { kind: 'discard', owner: 1, x: 160, y: 830, count: 0 }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 1, host: false, areas: ['p1'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        online: true,
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 6 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 5 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: 40 },
    },
    log: [],
  };
}

function surface(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.tablewrap .surface');
  if (!element) {
    throw new Error('no surface');
  }
  return element;
}

/** Chooses the item of that label in the open context menu, on the table or over a box. */
async function choose(label: string): Promise<void> {
  const menu = document.querySelector<HTMLElement>('.table-menu.context');
  const item = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
    (candidate) => candidate.querySelector('span')?.textContent === label,
  );
  if (!item) {
    throw new Error(`no menu item ${label}`);
  }
  await fireEvent.click(item);
}

/** Waits for the catalog: the villain shows its face. */
async function catalogLoaded(): Promise<void> {
  await within(surface()).findByRole('img', { name: 'Rhino' });
}

/** The ids of the cards and piles the surface draws, in drawing order. */
function shownIds(): string[] {
  return [...surface().querySelectorAll<HTMLElement>(':scope > [data-id]')].map(
    (element) => element.dataset.id ?? '',
  );
}

function ownerBoxes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.surface .ownerbox')];
}

/** The chips of an owner's frame (-1: the villain's), by their accessible names. */
function chipNames(owner: number): string[] {
  const chips = document.querySelectorAll<HTMLElement>(
    `.surface .chips[data-owner="${owner}"] button`,
  );
  return [...chips].map((chip) => chip.getAttribute('aria-label') ?? '');
}

function chip(pile: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface .chip[data-pile="${pile}"]`);
  if (!element) {
    throw new Error(`no chip for ${pile}`);
  }
  return element;
}

/** Rhino's table with out-of-play piles: two cards in the victory display, the scenario's set-aside cards empty. */
function withOutOfPlay(view: View): View {
  const inPile = (id: string, owner: number) => card(id, { code: '01001', owner, zone: 'pile' });
  view.table!.cards.push(inPile('q1', -1), inPile('q2', -1), inPile('q3', 0));
  view.table!.cards.push(inPile('q4', 1), inPile('q5', 1), inPile('q6', 1));
  view.table!.piles.push(
    pile('vic', { kind: 'victory', x: 0, y: 30, count: 2, cards: ['q1', 'q2'] }),
    pile('saside', { kind: 'aside', x: 0, y: 30, count: 0, cards: [] }),
    pile('aside:p0', { kind: 'aside', owner: 0, x: 0, y: 500, count: 1, cards: ['q3'] }),
    pile('aside:p1', {
      kind: 'aside',
      owner: 1,
      x: 0,
      y: 830,
      count: 3,
      cards: ['q4', 'q5', 'q6'],
    }),
  );
  return view;
}
function zoomLabel(): HTMLElement {
  return screen.getByRole('button', { name: 'Back to 100%' });
}

/** The preview floating over the table: only there while something is previewed. */
function preview(): HTMLElement {
  return screen.getByLabelText('Card preview');
}

function noPreview(): boolean {
  return screen.queryByLabelText('Card preview') === null;
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
  it('draws every table card and pile on one surface; the hand is not on the table', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    expect(document.querySelectorAll('.tablewrap .surface')).toHaveLength(1);
    const ids = (selector: string) =>
      [...surface().querySelectorAll<HTMLElement>(selector)].map((element) => element.dataset.id);
    expect(ids(':scope > .card:not(.pile)')).toEqual(['v', 's', 'a', 'b']);
    expect(ids(':scope > .pile')).toEqual(['enc', 'd0', 'd1', 'x1']);
    expect(surface().querySelector('[data-id="b"]')?.getAttribute('style')).toContain('top: 830px');
  });

  it('loads the cards of its game once', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    expect(loadGameCards).toHaveBeenCalledExactlyOnceWith('g1');
  });

  it("shows an owner's full name in a tooltip when it is cut short", async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    const name = ownerBoxes()[1]!.querySelector<HTMLElement>('.owner')!;
    cutShort(name);
    await fireEvent.pointerOver(name);
    expect(name.dataset.tip).toBe('Alex · Spider-Man');
  });

  it("frames each owner's deck and discard pile, named after them and their hero, their hand count as tip", async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    const boxes = ownerBoxes();
    // The hero is named even for a player with one deck.
    expect(boxes.map((box) => box.querySelector('.owner')?.textContent)).toEqual([
      'Villain',
      'Alex · Spider-Man',
      'Sam · Ant-Man',
    ]);
    // Screen readers read the hand count, which the pointer finds in the tooltip.
    expect(boxes.map((box) => box.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Villain',
      'Alex · Spider-Man : 6 cards in hand',
      'Sam · Ant-Man : 5 cards in hand',
    ]);
    expect(boxes.map((box) => box.style.getPropertyValue('--owner'))).toEqual([
      'var(--villain)',
      'var(--p1)',
      'var(--p2)',
    ]);
    expect(boxes.map((box) => box.dataset.tip)).toEqual([
      undefined,
      '6 cards in hand',
      '5 cards in hand',
    ]);
    // Around Sam's deck (0, 830) and discard pile (160, 830), 10 units off their edges.
    const sam = boxes[2]!;
    expect([sam.style.left, sam.style.top, sam.style.width, sam.style.height]).toEqual([
      '-10px',
      '820px',
      '320px',
      '216px',
    ]);
  });

  it('draws no out-of-play pile on the table', async () => {
    const view = makeView();
    view.table?.piles.push(
      pile('vic', { kind: 'victory', x: 0, y: 30, count: 2, cards: ['q1', 'q2'] }),
      pile('saside', { kind: 'aside', x: 0, y: 30, count: 0 }),
      pile('aside:p1', { kind: 'aside', owner: 1, x: 0, y: 830, count: 0 }),
    );
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    for (const id of ['vic', 'saside', 'aside:p1']) {
      expect(surface().querySelector(`[data-id="${id}"]`)).toBeNull();
    }
  });

  it("opens each owner's out-of-play piles from chips on their frame, with their counts", async () => {
    render(Table, { session: fakeSession(), view: withOutOfPlay(makeView()) });
    await catalogLoaded();

    // The villain's frame: the victory display, then the scenario's set-aside cards.
    expect(chipNames(-1)).toEqual(['Victory display (2)', 'Set-aside cards (0): empty']);
    // Each player's frame: their own set-aside cards.
    expect(chipNames(0)).toEqual(['Set-aside cards (1)']);
    expect(chipNames(1)).toEqual(['Set-aside cards (3)']);
    expect(chip('vic').dataset.tip).toBe('Victory display (2)');
    expect(chip('vic').textContent?.trim()).toBe('2');
    expect(chip('vic').getAttribute('aria-disabled')).toBe('false');
    // The name leaves room for its frame's chips.
    expect(ownerBoxes().map((box) => box.style.getPropertyValue('--chips'))).toEqual([
      '2',
      '1',
      '1',
    ]);

    await fireEvent.click(chip('vic'));
    const box = screen.getByRole('dialog', { name: 'Victory display' });
    expect(within(box).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows no chip for an out-of-play pile the table does not have', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    expect(document.querySelector('.surface .chips')).toBeNull();
    expect(ownerBoxes().map((box) => box.style.getPropertyValue('--chips'))).toEqual([
      '0',
      '0',
      '0',
    ]);
  });

  it('an empty out-of-play pile has a dimmed chip that opens nothing', async () => {
    render(Table, { session: fakeSession(), view: withOutOfPlay(makeView()) });
    await catalogLoaded();

    const empty = chip('saside');
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    expect(empty.dataset.tip).toBe('Set-aside cards (0): empty');
    await fireEvent.click(empty);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives each chip a hit area of 44 screen px on a touch screen, whatever the zoom', () => {
    const coarse = /@media \(pointer: coarse\) \{[\s\S]*?\.chip::before \{([^}]*)\}/.exec(
      surfaceSource,
    )?.[1];
    // 44px in table units, which the surface's zoom turns back into 44 screen px.
    expect(coarse).toMatch(/--hit: calc\(44px \/ var\(--z, 1\)\);/);
    expect(coarse).toMatch(/width: max\(100%, var\(--hit\)\);/);
    expect(coarse).toMatch(/height: max\(100%, var\(--hit\)\);/);
    // Invisible, and under the chips' faces.
    expect(coarse).not.toMatch(/background|border/);
    expect(coarse).toMatch(/z-index: -1;/);
  });

  it('a spectator opens the out-of-play piles from their chips too', async () => {
    const view = withOutOfPlay(makeView());
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    await fireEvent.click(chip('aside:p1'));
    expect(screen.getByRole('dialog', { name: "Sam's set-aside cards" })).toBeTruthy();
  });

  it('leaves room past the rightmost and the lowest card', async () => {
    const view = makeView({
      // A double-size card, 196 by 280, at 200, 300.
      cards: [card('g', { code: '01010', x: 200, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });

    // 200 + 196 + 200 wide, 300 + 280 + 300 tall.
    await waitFor(() => {
      expect(surface().style.width).toBe('596px');
    });
    expect(surface().style.height).toBe('880px');
  });

  it('sizes cards as std until the catalog is loaded', () => {
    vi.mocked(loadGameCards).mockReturnValue(new Promise(() => {}));
    const view = makeView({
      cards: [card('g', { code: '01010', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });

    // 300 + 196 + 300, and the card itself gets the std box.
    expect(surface().style.height).toBe('796px');
    expect(surface().querySelector<HTMLElement>('.card')?.style.height).toBe('196px');
    expect(knownCard).not.toHaveBeenCalled();
  });

  it('does not keep the size measured before the catalog is loaded', async () => {
    let loaded = () => {};
    vi.mocked(loadGameCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
    // The main scheme is landscape (140 high), but counts as std (196) until its size is known.
    const view = makeView({
      cards: [card('s', { code: '01097', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });
    expect(surface().style.height).toBe('796px');

    loaded();
    // 300 + 140 + 300.
    await waitFor(() => {
      expect(surface().style.height).toBe('740px');
    });
  });

  it('shows a non-blocking error when the catalog fails to load', async () => {
    vi.mocked(loadGameCards).mockRejectedValue(new Error('offline'));
    render(Table, { session: fakeSession(), view: makeView() });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Card data could not be loaded',
    );
    expect(surface().querySelectorAll('.card:not(.pile)')).toHaveLength(4);
  });

  it('after a failed load, every card is a std placeholder, as the surface is sized', async () => {
    vi.mocked(loadGameCards).mockRejectedValue(new Error('offline'));
    const view = makeView({
      cards: [card('g', { code: '01010', x: 0, y: 300 })],
      piles: [],
    });
    render(Table, { session: fakeSession(), view });
    await screen.findByRole('alert');

    // 300 + 196 + 300: the surface counts the card as std, and the card is drawn std.
    expect(surface().style.height).toBe('796px');
    await Promise.resolve();
    expect(surface().querySelector<HTMLElement>('.card')?.style.height).toBe('196px');
    expect(within(surface()).queryByRole('img', { name: 'Giant form' })).toBeNull();
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

  it('places the first player token on the table', async () => {
    render(Table, { session: fakeSession(), view: makeView() });

    const token = await screen.findByRole('img', { name: 'First player' });
    expect(token.getAttribute('src')).toBe(FIRST_PLAYER_TOKEN);
    const placed = token.closest<HTMLElement>('.marker');
    expect(placed?.style.left).toBe('860px');
    expect(placed?.style.top).toBe('40px');
    expect(surface().contains(token)).toBe(true);
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
      piles: [pile('x0', { kind: 'discard', owner: 0, count: 1, cards: ['t'] })],
    });
    render(Table, { session: fakeSession(), view });

    const top = await within(surface()).findByRole('img', { name: 'Spider-Man' });
    expect(top.getAttribute('src')).toBe('01001.png');
  });

  it('shows the top card of a side deck that shows it, and the back of one that does not', async () => {
    const view = makeView({
      cards: [card('i', { code: '01001', owner: 1, zone: 'pile', home: 'side:p1:0' })],
      piles: [
        pile('side:p1:0', {
          kind: 'sideDeck',
          owner: 1,
          x: 360,
          y: 830,
          count: 5,
          label: 'Invocation',
          topFaceUp: true,
          cards: ['i'],
        }),
        pile('side:p1:1', { kind: 'sideDeck', owner: 1, x: 520, y: 830, count: 5, label: 'Sense' }),
      ],
    });
    render(Table, { session: fakeSession(), view });

    const top = await within(surface()).findByRole('img', { name: 'Spider-Man' });
    expect(top.closest<HTMLElement>('.pile')?.dataset.id).toBe('side:p1:0');
    const sense = surface().querySelector('.pile[data-id="side:p1:1"]');
    expect(sense?.querySelector('img')?.getAttribute('alt')).toBe('Player card back');
  });

  it("captions a side deck's own back on its pile and on its face-down cards", async () => {
    const view = makeView({
      cards: [
        card('v', { code: '01094', back: 'villain', x: 360, y: 30 }),
        card('l', { owner: 1, home: 'side:p1:0', faceDown: true, x: 700, y: 830 }),
        // Its deck is not on the table: its back has no caption.
        card('g', { owner: 1, home: 'side:p1:9', faceDown: true, x: 900, y: 830 }),
      ],
      piles: [
        pile('side:p1:0', {
          kind: 'sideDeck',
          owner: 1,
          x: 360,
          y: 830,
          count: 2,
          label: 'Labor',
          back: 'player',
        }),
      ],
    });
    render(Table, { session: fakeSession(), view });

    const backs = await within(surface()).findAllByRole('img', { name: 'Labor card back' });
    expect(backs.map((back) => back.closest<HTMLElement>('[data-id]')?.dataset.id)).toEqual([
      'side:p1:0',
      'l',
    ]);
    expect(backs.map((back) => back.querySelector('.caption')?.textContent)).toEqual([
      'LABOR',
      'LABOR',
    ]);
    const plain = within(surface()).getByRole('img', { name: 'Player card back' });
    expect(plain.closest<HTMLElement>('[data-id]')?.dataset.id).toBe('g');
  });

  it('moves the Focus panel to a corner clear of the hovered card', async () => {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('tablewrap')) {
        return rect(0, 0, 1000, 800);
      }
      // Rhino lies under the bottom right corner.
      return (this as HTMLElement).dataset.id === 'v' ? rect(800, 500, 140, 196) : rect(0, 0, 0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(450);
    try {
      render(Table, { session: fakeSession(), view: makeView() });
      await catalogLoaded();

      await fireEvent.pointerEnter(surface().querySelector('.card[data-id="v"]') as HTMLElement);
      // The facing corner on the same edge.
      const panel = preview().closest('.peek');
      expect(panel?.classList).toContain('bottom-left');

      // Another card clear of the bottom right corner: the panel goes back home, drawn afresh
      // there, so that it fades in.
      await fireEvent.pointerEnter(surface().querySelector('.card[data-id="a"]') as HTMLElement);
      expect(preview().closest('.peek')?.classList).toContain('bottom-right');
      expect(preview().closest('.peek')).not.toBe(panel);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('stays put as the pointer moves: only the hovered card counts', async () => {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('tablewrap')) {
        return rect(0, 0, 1000, 800);
      }
      return rect(0, 0, 10, 10);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(450);
    try {
      render(Table, { session: fakeSession(), view: makeView() });
      await catalogLoaded();
      await fireEvent.pointerEnter(surface().querySelector('.card[data-id="a"]') as HTMLElement);
      expect(preview().closest('.peek')?.classList).toContain('bottom-right');

      // Over the bottom right corner: the panel stays home.
      await fireEvent.pointerMove(window, { clientX: 900, clientY: 600 });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(preview().closest('.peek')?.classList).toContain('bottom-right');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('rings the hovered card or pile, and keeps the ring of the one whose menu is open', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    const rhino = surface().querySelector<HTMLElement>('.card[data-id="v"]')!;
    const deck = surface().querySelector<HTMLElement>('.pile[data-id="d1"]')!;

    await fireEvent.pointerEnter(rhino);
    expect(rhino.classList).toContain('hovered');
    await fireEvent.pointerEnter(deck);
    expect(deck.classList).toContain('hovered');
    expect(rhino.classList).not.toContain('hovered');

    // A tap opens the villain's menu: its ring stays while the finger, or the pointer, goes on.
    await fireEvent.pointerDown(rhino, { pointerType: 'touch' });
    await fireEvent.click(rhino);
    await fireEvent.pointerEnter(deck);
    expect(rhino.classList).toContain('hovered');
    expect(deck.classList).not.toContain('hovered');
  });

  it('hovering a card previews it; leaving it clears the preview after a linger', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    const villain = surface();
    const rhino = await within(villain).findByRole('img', { name: 'Rhino' });

    await fireEvent.pointerEnter(rhino.closest('.card') as HTMLElement);
    expect(within(preview()).getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe(
      '01094.png',
    );

    // The main scheme is landscape.
    const scheme = within(villain).getByRole('img', { name: 'The Break-In!' });
    await fireEvent.pointerEnter(scheme.closest('.card') as HTMLElement);
    expect(within(preview()).getByRole('img', { name: 'The Break-In!' }).classList).toContain(
      'land',
    );

    vi.useFakeTimers();
    await fireEvent.pointerLeave(scheme.closest('.card') as HTMLElement);
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(within(preview()).getByRole('img', { name: 'The Break-In!' })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1);
    expect(noPreview()).toBe(true);
  });

  it('shows no preview for a card back: a face-down card, a deck; nor for an empty pile', async () => {
    const view = makeView({
      cards: [
        card('f', { code: '01001', faceDown: true, back: 'player' }),
        card('up', { code: '01001', x: 200 }),
      ],
      piles: [
        pile('enc', { kind: 'encounter', x: 500 }),
        pile('x1', { kind: 'discard', owner: 1, x: 720, count: 0 }),
      ],
    });
    const { container } = render(Table, { session: fakeSession(), view });
    const table = surface();

    await fireEvent.pointerEnter(table.querySelector('.card[data-id="f"]') as HTMLElement);
    expect(noPreview()).toBe(true);

    // A face-up card is previewed; a deck then clears it rather than show its back.
    await fireEvent.pointerEnter(table.querySelector('.card[data-id="up"]') as HTMLElement);
    expect(noPreview()).toBe(false);
    await fireEvent.pointerEnter(table.querySelector('.pile') as HTMLElement);
    expect(noPreview()).toBe(true);

    await fireEvent.pointerEnter(container.querySelector('.pile.empty') as HTMLElement);
    expect(noPreview()).toBe(true);
  });

  it('fades the preview out as it goes; another card swaps in without a fade', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    await fireEvent.pointerEnter(surface().querySelector('.card[data-id="a"]') as HTMLElement);
    const panel = preview().closest('.peek');
    expect(panel?.classList).not.toContain('leaving');

    await fireEvent.pointerEnter(surface().querySelector('.card[data-id="b"]') as HTMLElement);
    expect(preview().closest('.peek')).toBe(panel);

    interaction.release();
    await tick();
    // Still drawn while it fades out, though no longer a preview for assistive technologies.
    expect(noPreview()).toBe(true);
    const leaving = document.querySelector('.peek') as HTMLElement;
    expect(leaving.classList).toContain('leaving');
    expect(leaving.querySelector('.frame')?.getAttribute('aria-hidden')).toBe('true');
    // Gone once its fade-out ends.
    await fireEvent.animationEnd(leaving);
    expect(document.querySelector('.peek')).toBeNull();
  });

  it('hovering a history line rings its cards on the table', async () => {
    const view = makeView();
    view.log = [
      { who: 'Sam', color: 1, text: 'exhausted Rhino', at: new Date().toISOString(), cards: ['v'] },
    ];
    render(Table, { session: fakeSession(), view });
    const villain = surface();
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
    view.table = { ...view.table!, hands: { p1: ['h2', 'h'] } };
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

  it("hovering a hand card shows no preview, and clears a table card's", async () => {
    const view = makeView();
    view.table = { ...view.table!, hands: { p1: ['h'] } };
    render(Table, { session: fakeSession(), view });
    const hand = screen.getByRole('list', { name: 'Your hand' });
    const inHand = await within(hand).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.pointerEnter(surface().querySelector('.card[data-id="a"]') as HTMLElement);
    expect(noPreview()).toBe(false);

    await fireEvent.pointerEnter(inHand.closest('li') as HTMLElement);
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h' });
    expect(noPreview()).toBe(true);
  });

  it('undo sends the undo action', async () => {
    const session = fakeSession();
    const view = { ...makeView(), canUndo: true };
    render(Table, { session, view });

    await fireEvent.click(screen.getByRole('button', { name: 'Undo last action' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'undo' }, 1);
  });

  it('shows the side panel, which holds the history only', () => {
    localStorage.setItem('itf-side-hidden', '1');
    render(Table, { session: fakeSession(), view: makeView() });

    const side = screen.getByRole('complementary', { name: 'History' });
    expect(within(side).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(within(side).queryByLabelText('Card preview')).toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
  });

  it('collapses the history to a strip keeping Undo, remembered for the viewer', async () => {
    const session = fakeSession();
    const view = { ...makeView(), canUndo: true };
    const { container, unmount } = render(Table, { session, view });
    const app = container.querySelector<HTMLElement>('.app')!;
    const side = screen.getByRole('complementary', { name: 'History' });
    expect(app.classList).not.toContain('history-collapsed');

    const collapse = screen.getByRole('button', { name: 'Collapse history' });
    expect(collapse.getAttribute('aria-controls')).toBe(side.id);
    await fireEvent.click(collapse);
    expect(app.classList).toContain('history-collapsed');
    expect(screen.queryByRole('list', { name: 'History' })).toBeNull();
    expect(localStorage.getItem('itf-history-collapsed')).toBe('1');
    // The focus goes to the button that took its place.
    const expand = screen.getByRole('button', { name: 'Expand history' });
    await waitFor(() => expect(document.activeElement).toBe(expand));
    await fireEvent.click(within(side).getByRole('button', { name: 'Undo last action' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' }, 1);
    unmount();

    // The next table opens collapsed.
    const again = render(Table, { session: fakeSession(), view });
    expect(again.container.querySelector('.app')?.classList).toContain('history-collapsed');
    await fireEvent.click(screen.getByRole('button', { name: 'Expand history' }));
    expect(again.container.querySelector('.app')?.classList).not.toContain('history-collapsed');
    expect(screen.getByRole('list', { name: 'History' })).toBeTruthy();
    expect(localStorage.getItem('itf-history-collapsed')).toBe('0');
  });

  it('floats the preview over the table, only while something is previewed', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    expect(noPreview()).toBe(true);

    await fireEvent.pointerEnter(surface().querySelector('.card[data-id="v"]') as HTMLElement);
    expect(preview().closest('.peek')?.parentElement).toBe(container.querySelector('.app'));
    expect(within(preview()).getByRole('img', { name: 'Rhino' })).toBeTruthy();
    // A framed panel at the bottom right, wider for a landscape card.
    const panel = preview().closest<HTMLElement>('.peek')!;
    expect(panel.querySelector('.tab')).toBeNull();
    expect(panel.classList).toContain('bottom-right');
    expect(panel.classList).not.toContain('land');
    await fireEvent.pointerEnter(surface().querySelector('.card[data-id="s"]') as HTMLElement);
    expect(preview().closest('.peek')?.classList).toContain('land');
  });

  it('names the scenario and its modular sets in the top bar, not the difficulty', async () => {
    const view = makeView();
    view.config = {
      ...view.config,
      difficulty: 'expert',
      modulars: ['bomb_scare', 'masters_of_evil'],
    };
    const { container } = render(Table, { session: fakeSession(), view });

    await waitFor(() => {
      expect(container.querySelector('header .crumbs')?.textContent?.trim()).toBe(
        'Rhino / Bomb Scare / Masters of Evil',
      );
    });
  });

  it('shows card names, images, history and crumbs in French when chosen', async () => {
    cardLang.current = 'fr';
    // Built once, as the catalog keeps its cards: a localized face is made once per face.
    const english = infoOf('01094')!;
    const rhino: CardInfo = {
      ...english,
      card: {
        ...english.card,
        faces: english.card.faces.map((face) => ({
          ...face,
          localized: { fr: { name: 'Rhinocéros', images: ['fr/01094.webp'] } },
        })),
      },
    };
    vi.mocked(knownCard).mockImplementation((code) => (code === '01094' ? rhino : infoOf(code)));
    vi.mocked(loadIndex).mockResolvedValue({
      ...INDEX,
      scenarios: INDEX.scenarios.map((s) => ({ ...s, localized: { fr: { name: 'Rhinocéros' } } })),
      sets: INDEX.sets.map((s) =>
        s.code === 'bomb_scare' ? { ...s, localized: { fr: { name: 'Alerte à la bombe' } } } : s,
      ),
    });
    const view = makeView();
    view.config = { ...view.config, modulars: ['bomb_scare', 'masters_of_evil'] };
    view.log = [
      {
        who: 'Alex',
        color: 0,
        text: 'flipped Rhino',
        at: new Date().toISOString(),
        parts: [
          { text: 'flipped ' },
          { text: 'Rhino', card: true, ref: { card: '01094', face: 0 } },
        ],
      },
    ];
    const { container } = render(Table, { session: fakeSession(), view });

    const villain = await within(surface()).findByRole('img', { name: 'Rhinocéros' });
    expect(villain.getAttribute('src')).toBe('fr/01094.webp');
    const history = screen.getByRole('list', { name: 'History' });
    expect(within(history).getByText('Rhinocéros').tagName).toBe('B');
    await waitFor(() => {
      expect(container.querySelector('header .crumbs')?.textContent?.trim()).toBe(
        'Rhinocéros / Alerte à la bombe / Masters of Evil',
      );
    });
  });

  it('shows no crumb when the pack index cannot be loaded', async () => {
    vi.mocked(loadIndex).mockRejectedValue(new Error('offline'));
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    expect(container.querySelector('header .crumbs')).toBeNull();
  });

  it('Ready all readies every card, whoever owns it; spectators have no such button', async () => {
    const session = fakeSession();
    const view = makeView();
    const { unmount } = render(Table, { session, view });
    // Nothing exhausted: the button is off.
    const button = screen.getByRole('button', { name: 'Ready all cards' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    unmount();

    // Sam (p1) readies Alex's (p0) card: it does not need to be Sam's.
    const tired = makeView({
      cards: [card('a', { code: '01001', owner: 0, x: 360, y: 360, exhausted: true })],
    });
    render(Table, { session, view: tired });
    await fireEvent.click(screen.getByRole('button', { name: 'Ready all cards' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'readyAll' }, 1);
    document.body.replaceChildren();

    render(Table, {
      session: fakeSession(),
      view: { ...view, you: { role: 'spectator', name: 'Kim', color: -1, host: false } },
    });
    expect(screen.queryByRole('button', { name: 'Ready all cards' })).toBeNull();
  });

  it('grabs what the viewer can drag, points at the piles that only have a menu', async () => {
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    const at = (id: string) => surface().querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;
    // Sam (p1): every table card, their own deck and the encounter deck.
    for (const id of ['a', 'b', 'v', 'd1', 'enc']) {
      expect(at(id).classList, id).toContain('grab');
    }
    // Alex's deck is private: it has a menu, nothing to drag.
    expect(at('d0').classList).not.toContain('grab');
    expect(at('d0').classList).not.toContain('inert');
    // An empty pile has no menu: it is not even pointed at.
    expect(at('x1').classList).toContain('inert');
    unmount();

    render(Table, {
      session: fakeSession(),
      view: { ...makeView(), you: { role: 'spectator', name: 'Kim', color: -1, host: false } },
    });
    expect(surface().querySelectorAll('.card.grab')).toHaveLength(0);
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
});

describe('Table surface size', () => {
  // The table shows 1248 by 948 px, 1200 by 900 past the scroller's 24 px padding.
  let visible = { w: 1248, h: 948 };

  beforeEach(() => {
    visible = { w: 1248, h: 948 };
    localStorage.setItem('itf-zoom', '1');
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('tablewrap') ? visible.w : 0;
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('tablewrap') ? visible.h : 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Resizes the window: the table shows `w` by `h` px. */
  function resizeTable(container: HTMLElement, w: number, h: number): Promise<void> {
    visible = { w, h };
    const wrap = container.querySelector('.tablewrap');
    if (!wrap) {
      throw new Error('no table');
    }
    ManualResizeObserver.resized(wrap);
    return tick();
  }

  it('fills what shows of the table, in table units at the zoom', async () => {
    // One card, from 800 to 940: the surface needs 1140 units of width.
    const view = makeView({ cards: [card('v', { code: '01094', x: 800, y: 0 })], piles: [] });
    const { container } = render(Table, { session: fakeSession(), view });
    await waitFor(() => {
      expect([surface().style.width, surface().style.height]).toEqual(['1200px', '900px']);
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    // 1200 by 900 px at 90 % are 1333.3 by 1000 units, rounded down.
    expect([surface().style.width, surface().style.height]).toEqual(['1333px', '1000px']);

    await resizeTable(container, 648, 1848);
    // 600 by 1800 px at 90 % are 666.7 by 2000 units: the card needs more width.
    expect([surface().style.width, surface().style.height]).toEqual(['1140px', '2000px']);
  });

  it('zooms around the pointer, keeping the table spot under it in place', async () => {
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const wrap = container.querySelector<HTMLElement>('.tablewrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(wrap, 'scrollLeft', { value: 100, writable: true });
    Object.defineProperty(wrap, 'scrollTop', { value: 50, writable: true });

    // The pointer at 524, 424: 600, 450 px into the surface, past the scroller's padding.
    await fireEvent.wheel(wrap, { deltaY: -20, ctrlKey: true, clientX: 524, clientY: 424 });
    expect(zoomLabel().textContent).toBe('120%');
    // At 120 %, that spot is 720, 540 px into the surface: still under the pointer.
    await waitFor(() => {
      expect([wrap.scrollLeft, wrap.scrollTop]).toEqual([220, 140]);
    });
  });
});

describe('Table view modes', () => {
  beforeEach(() => {
    localStorage.setItem('itf-zoom', '1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPrefMemory();
  });

  function viewButton(name: string): HTMLElement {
    return within(screen.getByRole('group', { name: 'Table view' })).getByRole('button', { name });
  }

  it('switches between all the rows and the villain with one player, remembered', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();
    expect(viewButton('All').getAttribute('aria-pressed')).toBe('true');
    expect(shownIds()).toEqual(['enc', 'd0', 'd1', 'x1', 'v', 's', 'a', 'b']);
    expect(screen.queryByRole('radiogroup', { name: 'Player shown' })).toBeNull();

    await fireEvent.click(viewButton('Villain + player'));
    expect(viewButton('Villain + player').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('itf-view')).toBe('focus');
    // Sam, the viewer, by default: Alex's row is hidden, Sam's drawn right under the villain's.
    expect(shownIds()).toEqual(['enc', 'd1', 'x1', 'v', 's', 'b']);
    const sam = surface().querySelector<HTMLElement>('[data-id="b"]')!;
    expect(sam.style.top).toBe('500px');
    expect(ownerBoxes().map((box) => box.querySelector('.owner')?.textContent)).toEqual([
      'Villain',
      'Sam · Ant-Man',
    ]);
  });

  it("picks the player whose row shows, at the bottom left, the viewer's own first", async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    const picker = screen.getByRole('radiogroup', { name: 'Player shown' });
    const swatches = within(picker).getAllByRole('radio');
    // Each named with its player and hero, in its label and tooltip. Only the chosen one is tabbed to.
    expect(
      swatches.map((swatch) => [
        swatch.getAttribute('aria-label'),
        swatch.dataset.tip,
        swatch.getAttribute('aria-checked'),
        swatch.tabIndex,
      ]),
    ).toEqual([
      ['Alex · Spider-Man', 'Alex · Spider-Man', 'false', -1],
      ['Sam · Ant-Man', 'Sam · Ant-Man', 'true', 0],
    ]);
    // Only the current entry names its hero beside its avatar.
    expect(picker.querySelector('[aria-checked="true"] .txt')?.textContent).toBe('Ant-Man');
    // Two players: no previous and next buttons.
    expect(screen.queryByRole('button', { name: 'Next hero' })).toBeNull();

    await fireEvent.click(within(picker).getByRole('radio', { name: 'Alex · Spider-Man' }));
    expect(shownIds()).toEqual(['enc', 'd0', 'v', 's', 'a']);
    expect(surface().querySelector<HTMLElement>('[data-id="a"]')?.style.top).toBe('500px');
  });

  it('steps round the table with three players or more', async () => {
    localStorage.setItem('itf-view', 'focus');
    const view = makeView();
    view.players.push({
      name: 'Kim',
      color: 2,
      host: false,
      ready: true,
      online: true,
      decks: [{ area: 'p2', ready: true, handCount: 0 }],
    });
    view.table!.piles.push(pile('d2', { owner: 2, x: 0, y: 1160 }));
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    const picker = screen.getByRole('radiogroup', { name: 'Player shown' });
    const checked = () =>
      within(picker)
        .getAllByRole('radio', { checked: true })
        .map((swatch) => swatch.getAttribute('aria-label'));
    expect(checked()).toEqual(['Sam · Ant-Man']);
    await fireEvent.click(screen.getByRole('button', { name: 'Next hero' }));
    expect(checked()).toEqual(['Kim']);
    await fireEvent.click(screen.getByRole('button', { name: 'Next hero' }));
    expect(checked()).toEqual(['Alex · Spider-Man']);
    await fireEvent.click(screen.getByRole('button', { name: 'Previous hero' }));
    expect(checked()).toEqual(['Kim']);
  });

  it('moves the shown player and the focus with the arrow keys', async () => {
    localStorage.setItem('itf-view', 'focus');
    const view = makeView();
    view.players.push({
      name: 'Kim',
      color: 2,
      host: false,
      ready: true,
      online: true,
      decks: [{ area: 'p2', ready: true, handCount: 0 }],
    });
    view.table!.piles.push(pile('d2', { owner: 2, x: 0, y: 1160 }));
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    const picker = screen.getByRole('radiogroup', { name: 'Player shown' });
    const sam = within(picker).getByRole('radio', { name: 'Sam · Ant-Man' });
    sam.focus();
    await fireEvent.keyDown(sam, { key: 'ArrowRight' });
    const kim = within(picker).getByRole('radio', { name: 'Kim' });
    await waitFor(() => expect(document.activeElement).toBe(kim));
    expect(kim.getAttribute('aria-checked')).toBe('true');
    // Round the table, both ways.
    await fireEvent.keyDown(kim, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Alex · Spider-Man'),
    );
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement).toBe(kim));
    await fireEvent.keyDown(kim, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(sam));
  });

  it('offers no choice with one player: the table shows everything', async () => {
    localStorage.setItem('itf-view', 'focus');
    const view = makeView();
    view.players = [view.players[1]!];
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    expect(screen.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Player shown' })).toBeNull();
    expect(shownIds()).toContain('a');
  });

  it('sends where a card is dropped on the table, not where it is drawn', async () => {
    localStorage.setItem('itf-view', 'focus');
    // The surface at the top left of the screen: elements show where their styles put them.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const style = (this as HTMLElement).style;
      const inSurface = this.closest('.surface') !== null && !this.classList.contains('surface');
      const left = inSurface ? Number.parseFloat(style.left) || 0 : 0;
      const top = inSurface ? Number.parseFloat(style.top) || 0 : 0;
      const width = inSurface ? Number.parseFloat(style.width) || 0 : 1000;
      const height = inSurface ? Number.parseFloat(style.height) || 0 : 900;
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const session = fakeSession();
    render(Table, { session, view: makeView() });
    await catalogLoaded();

    // Sam's identity lies at 360, 830 on the table, drawn at 360, 500.
    const sam = surface().querySelector<HTMLElement>('[data-id="b"]')!;
    await fireEvent.pointerDown(sam, { clientX: 400, clientY: 540, pointerType: 'mouse' });
    await fireEvent.pointerMove(window, { clientX: 500, clientY: 590, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 500, clientY: 590 });

    // Its corner drawn at 460, 550: 460, 880 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'move',
        card: 'b',
        x: 460,
        y: 880,
      },
      1,
    );
  });
});

describe('several decks', () => {
  /**
   * Alex (colour 0) plays two decks: Spider-Man (p0) and Ant-Man (p1); Sam
   * (colour 1) one, She-Hulk (p2). The viewer is Alex, whose hands hold a
   * Spider-Man card (p0) and a Rhino (p1).
   */
  function makeTwoDeckView(): View {
    const view = makeView({
      cards: [
        card('v', { code: '01094', back: 'villain', x: 360, y: 30 }),
        card('s', { code: '01097', back: 'encounter', x: 520, y: 30 }),
        card('a', { code: '01001', owner: 0, x: 360, y: 500 }),
        card('b', { code: '01001', owner: 1, x: 360, y: 830 }),
        card('c', { code: '01001', owner: 2, x: 360, y: 1160 }),
        card('h0', { code: '01001', owner: 0, zone: 'hand' }),
        card('h1', { code: '01094', owner: 1, zone: 'hand' }),
      ],
      piles: [
        pile('enc', { kind: 'encounter', x: 0, y: 30 }),
        pile('d0', { owner: 0, x: 0, y: 500 }),
        pile('d1', { owner: 1, x: 0, y: 830 }),
        pile('d2', { owner: 2, x: 0, y: 1160 }),
      ],
    });
    view.you = { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] };
    view.players = [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        online: true,
        decks: [
          { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 1 },
          { area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 1 },
        ],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p2', heroName: 'She-Hulk', ready: true, handCount: 4 }],
      },
    ];
    view.table = { ...view.table!, hands: { p0: ['h0'], p1: ['h1'] } };
    return view;
  }

  function hand(): HTMLElement {
    return screen.getByRole('list', { name: 'Your hand' });
  }

  function handNames(): (string | null)[] {
    return within(hand())
      .queryAllByRole('img')
      .map((image) => image.getAttribute('alt'));
  }

  /** The hero selector at the bottom left, as "Villain + player" names it. */
  function picker(): HTMLElement {
    return screen.getByRole('radiogroup', { name: 'Player shown' });
  }

  function checkedDeck(name = 'Player shown'): (string | null)[] {
    return within(screen.getByRole('radiogroup', { name }))
      .getAllByRole('radio', { checked: true })
      .map((swatch) => swatch.getAttribute('aria-label'));
  }

  it('hand shows selected deck', async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    expect(handNames()).toEqual(['Spider-Man']);
  });

  it("lists the viewer's own decks in the selector of the All view, picking the hand shown", async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    const handPicker = screen.getByRole('radiogroup', { name: 'Hand shown' });
    const swatches = within(handPicker).getAllByRole('radio');
    expect(swatches.map((swatch) => swatch.getAttribute('aria-label'))).toEqual([
      'Alex · Spider-Man',
      'Alex · Ant-Man',
    ]);
    // Each with its hand size.
    expect(swatches.map((swatch) => swatch.querySelector('.n')?.textContent)).toEqual(['1', '1']);
    expect(checkedDeck('Hand shown')).toEqual(['Alex · Spider-Man']);

    await fireEvent.click(within(handPicker).getByRole('radio', { name: 'Alex · Ant-Man' }));
    expect(checkedDeck('Hand shown')).toEqual(['Alex · Ant-Man']);
    expect(handNames()).toEqual(['Rhino']);
    // Every row still shows.
    expect(shownIds()).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it("follows Q in the All view's selector", async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    await fireEvent.keyDown(window, { key: 'q' });
    expect(checkedDeck('Hand shown')).toEqual(['Alex · Ant-Man']);
  });

  it('keeps the Focus panel off the bottom left corner while the selector shows in the All view', async () => {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('tablewrap')) {
        return rect(0, 0, 1000, 800);
      }
      // Rhino lies under the bottom right corner.
      return (this as HTMLElement).dataset.id === 'v' ? rect(800, 500, 140, 196) : rect(0, 0, 0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(450);
    try {
      render(Table, { session: fakeSession(), view: makeTwoDeckView() });
      await catalogLoaded();
      expect(screen.getByRole('radiogroup', { name: 'Hand shown' })).toBeTruthy();

      await fireEvent.pointerEnter(surface().querySelector('.card[data-id="v"]') as HTMLElement);
      // The bottom left corner holds the selector: the panel takes the top left one.
      expect(preview().closest('.peek')?.classList).toContain('top-left');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('lists every seat in the selector of the Villain + player view', async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await catalogLoaded();

    const swatches = within(picker()).getAllByRole('radio');
    expect(
      swatches.map((swatch) => [swatch.getAttribute('aria-label'), swatch.dataset.tip]),
    ).toEqual([
      ['Alex · Spider-Man', 'Alex · Spider-Man'],
      ['Alex · Ant-Man', 'Alex · Ant-Man'],
      ['Sam · She-Hulk', 'Sam · She-Hulk'],
    ]);
    expect(checkedDeck()).toEqual(['Alex · Spider-Man']);
  });

  it("shows another player's row and no hand when their swatch is picked", async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    // In "Villain + player", an own deck shows its row and its hand.
    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Alex · Ant-Man' }));
    expect(handNames()).toEqual(['Rhino']);
    expect(shownIds()).toContain('b');

    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Sam · She-Hulk' }));
    expect(checkedDeck()).toEqual(['Sam · She-Hulk']);
    expect(shownIds()).toContain('c');
    expect(shownIds()).not.toContain('b');
    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();
  });

  it("shows an own deck's hand again when its swatch is picked after another player's", async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Sam · She-Hulk' }));
    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();

    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Alex · Spider-Man' }));
    expect(checkedDeck()).toEqual(['Alex · Spider-Man']);
    expect(handNames()).toEqual(['Spider-Man']);
  });

  it('shows no selector to a player with one deck in the All view', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('Q selects next deck', async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    await fireEvent.keyDown(window, { key: 'q' });
    expect(handNames()).toEqual(['Rhino']);
    // Round the viewer's decks.
    await fireEvent.keyDown(window, { key: 'q' });
    expect(handNames()).toEqual(['Spider-Man']);
  });

  it("Q shows the next own deck's row in the Villain + player view", async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Sam · She-Hulk' }));
    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();

    await fireEvent.keyDown(window, { key: 'q' });
    expect(checkedDeck()).toEqual(['Alex · Ant-Man']);
    expect(handNames()).toEqual(['Rhino']);
    expect(shownIds()).toContain('b');
    expect(shownIds()).not.toContain('c');
  });

  it('Shift + ← / → steps round every seat in the Villain + player view', async () => {
    localStorage.setItem('itf-view', 'focus');
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(checkedDeck()).toEqual(['Alex · Ant-Man']);
    expect(handNames()).toEqual(['Rhino']);
    expect(shownIds()).toContain('b');

    // Another player's seat: their row, no hand.
    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(checkedDeck()).toEqual(['Sam · She-Hulk']);
    expect(shownIds()).toContain('c');
    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();

    // Round the table, both ways.
    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(checkedDeck()).toEqual(['Alex · Spider-Man']);
    await fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    expect(checkedDeck()).toEqual(['Sam · She-Hulk']);
  });

  it("Shift + ← / → steps among the viewer's own decks in the All view", async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });

    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(handNames()).toEqual(['Rhino']);
    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(handNames()).toEqual(['Spider-Man']);
    await fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    expect(handNames()).toEqual(['Rhino']);
  });

  it('leaves Shift + ← / → to the browser for a player with one deck in the All view', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    await catalogLoaded();

    expect(await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })).toBe(true);
  });

  it('leaves Shift + ← / → to the browser for a spectator in the All view', async () => {
    const view = makeTwoDeckView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    expect(await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })).toBe(true);
  });

  it('action sends credited seat', async () => {
    const session = fakeSession();
    render(Table, { session, view: makeTwoDeckView() });
    await catalogLoaded();

    // Spider-Man (seat 0) is selected; the card belongs to Ant-Man, Alex's seat 1.
    await fireEvent.click(surface().querySelector<HTMLElement>('.card[data-id="b"]')!);
    await choose('Exhaust');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'b' }, 1);
  });

  it('credits an action on a shared card to the selected deck', async () => {
    const session = fakeSession();
    render(Table, { session, view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.keyDown(window, { key: 'q' });

    await fireEvent.click(surface().querySelector<HTMLElement>('.card[data-id="v"]')!);
    await choose('Exhaust');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'v' }, 1);
  });

  it("credits an action on a shared card to the last own deck while another player's swatch is picked", async () => {
    localStorage.setItem('itf-view', 'focus');
    const session = fakeSession();
    render(Table, { session, view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Alex · Ant-Man' }));
    await fireEvent.click(within(picker()).getByRole('radio', { name: 'Sam · She-Hulk' }));

    await fireEvent.click(surface().querySelector<HTMLElement>('.card[data-id="s"]')!);
    await choose('Exhaust');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 's' }, 1);
  });

  it('credits a box action on an own card of a shared pile to the card', async () => {
    const session = fakeSession();
    const view = makeTwoDeckView();
    view.table!.cards.push(card('x', { code: '01001', owner: 1, zone: 'pile' }));
    view.table!.piles.push(pile('vic', { kind: 'victory', x: 0, y: 30, count: 1, cards: ['x'] }));
    view.table!.private = { pile: 'vic', mode: 'search', cards: ['x'] };
    render(Table, { session, view });
    await catalogLoaded();

    // Spider-Man (seat 0) is selected; the card belongs to Ant-Man, Alex's seat 1.
    const box = screen.getByRole('dialog');
    await fireEvent.click(box.querySelector<HTMLElement>('.tile[data-id="x"] .img')!);
    await choose('Discard');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'x' }, 1);
  });

  it('lists the next deck and hero stepping keys in the shortcuts sheet of the All view', async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await catalogLoaded();

    await fireEvent.keyDown(window, { key: '?' });
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('Next deck')).toBeTruthy();
    expect(sheet.getByText('Previous / next hero')).toBeTruthy();
  });

  it('leaves the hero stepping keys out of the shortcuts sheet for a spectator in the All view', async () => {
    const view = makeTwoDeckView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    await fireEvent.keyDown(window, { key: '?' });
    expect(within(screen.getByRole('dialog')).queryByText('Previous / next hero')).toBeNull();
  });

  it('keeps the selected deck across new views', async () => {
    const result = render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await within(hand()).findByRole('img', { name: 'Spider-Man' });
    await fireEvent.keyDown(window, { key: 'q' });

    await result.rerender({ session: fakeSession(), view: makeTwoDeckView() });
    expect(handNames()).toEqual(['Rhino']);
  });

  it('frame label two decks', async () => {
    render(Table, { session: fakeSession(), view: makeTwoDeckView() });
    await catalogLoaded();

    const frames = ownerBoxes().map((box) => box.querySelector('.owner')?.textContent);
    expect(frames).toEqual(['Villain', 'Alex · Spider-Man', 'Alex · Ant-Man', 'Sam · She-Hulk']);
    // Each deck its own hand count; one player, one colour.
    expect(ownerBoxes().map((box) => box.dataset.tip)).toEqual([
      undefined,
      '1 card in hand',
      '1 card in hand',
      '4 cards in hand',
    ]);
    expect(ownerBoxes().map((box) => box.style.getPropertyValue('--owner'))).toEqual([
      'var(--villain)',
      'var(--p1)',
      'var(--p1)',
      'var(--p2)',
    ]);
  });

  it('shows a spectator no hand and no selector in the All view', async () => {
    const view = makeTwoDeckView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    render(Table, { session: fakeSession(), view });
    await catalogLoaded();

    expect(screen.queryByRole('list', { name: 'Your hand' })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('a selected group', () => {
  /** Sam's two cards on the table, both selected. */
  async function renderGroup() {
    const view = makeView();
    view.table!.cards.push(card('b2', { code: '01001', owner: 1, x: 520, y: 830, z: 2 }));
    const session = fakeSession();
    render(Table, { session, view });
    await catalogLoaded();
    interaction.setGroup(new Set(['b', 'b2']));
    return session;
  }

  const placed = (id: string) => surface().querySelector<HTMLElement>(`.card[data-id="${id}"]`)!;

  const GROUP_DISCARD = {
    kind: 'group',
    actions: [
      { kind: 'discard', card: 'b' },
      { kind: 'discard', card: 'b2' },
    ],
  };

  it('menu Discard on a selected card discards the whole selection', async () => {
    const session = await renderGroup();
    await fireEvent.click(placed('b'));
    await choose('Discard 2 cards');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(GROUP_DISCARD, 1);
  });

  it('X over a selected card sends one group action, E still exhausts the one card', async () => {
    const session = await renderGroup();
    await fireEvent.pointerEnter(placed('b2'));
    await fireEvent.keyDown(window, { key: 'x' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith(GROUP_DISCARD, 1);

    session.act.mockClear();
    await fireEvent.keyDown(window, { key: 'e' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'b2' }, 1);
  });
});
