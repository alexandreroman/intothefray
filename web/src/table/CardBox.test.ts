import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import boxSource from './CardBox.svelte?raw';
import { compareCardNumbers, pileLabel, tileActions, type TileAction } from './boxes';
import { interaction, LONG_PRESS_MS } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  CardView as TableCard,
  PackFace,
  PileView,
  PresenceState,
  PrivateView,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01020': [{ name: 'Web-Shooter' }],
  '01021': [{ name: 'Swinging Web Kick' }],
  '01022': [{ name: 'Backflip' }],
  '01094': [{ name: 'Rhino', stage: 'I', type: 'villain' }],
  '01095': [{ name: 'Rhino', stage: 'II', type: 'villain' }],
  '01097': [
    { name: 'The Break-In!', stage: '1A', type: 'main_scheme', size: 'land' },
    { name: 'The Break-In!', stage: '1B', type: 'main_scheme', size: 'land' },
  ],
  '01098': [
    { name: 'Crime Wave', stage: '2A', type: 'main_scheme', size: 'land' },
    { name: 'Crime Wave', stage: '2B', type: 'main_scheme', size: 'land' },
  ],
  '01100': [{ name: 'Hard to Keep Down' }],
};

function infoOf(code: string): CardInfo | null {
  const faces = FACES[code];
  if (!faces) {
    return null;
  }
  const full = faces.map((face): PackFace => ({
    name: '',
    type: '',
    size: 'std',
    images: [`${code}.png`],
    ...face,
  }));
  return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0 };
}

function card(id: string, extra: Partial<TableCard> = {}): TableCard {
  return {
    id,
    code: '01001',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    x: 0,
    y: 0,
    z: 1,
    ...extra,
  };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 30, ...extra };
}

/** Three cards of Alex's deck, top first: Web-Shooter, Swinging Web Kick, Backflip. */
const DECK_TOP = ['c1', 'c2', 'c3'];

function inDeck(id: string, code: string): TableCard {
  return card(id, { code, zone: 'pile' });
}

/** Rhino with Alex (p0, the viewer) and Sam (p1). */
function makeView(extra: { private?: PrivateView; cards?: TableCard[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine'),
    card('v', { code: '01094', owner: -1, back: 'villain', x: 10 }),
    card('v2', { code: '01095', owner: -1, back: 'villain', zone: 'stage' }),
    card('s', { code: '01097', owner: -1, back: 'encounter', x: 130 }),
    inDeck('c1', '01020'),
    inDeck('c2', '01021'),
    inDeck('c3', '01022'),
    card('q1', { code: '01100', owner: -1, back: 'encounter', zone: 'pile' }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        online: true,
        decks: [{ area: 'p0', ready: true, handCount: 0 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p1', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: [
        pile('deck:p0', { owner: 0, x: 600 }),
        pile('enc', { kind: 'encounter', x: 500, count: 20 }),
        pile('vic', { kind: 'victory', x: 700, count: 1, cards: ['q1'] }),
      ],
      hands: { p0: [] },
      stages: [
        { key: 'villain', label: 'Villain', current: 'v', cards: ['v', 'v2'] },
        { key: 'main', label: 'Main scheme', current: 's', cards: ['s'] },
      ],
      firstPlayer: { x: 860, y: 40 },
      private: extra.private,
    },
    log: [],
  };
}

function asSpectator(view: View): View {
  return { ...view, you: { role: 'spectator', name: 'Kim', color: -1, host: false } };
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

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await screen.findByRole('img', { name: 'Rhino' });
  return {
    session,
    rerender: (next: View) => result.rerender({ session, view: next }),
    unmount: () => result.unmount(),
  };
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

/** The chip opening an out-of-play pile, on its owner's frame (-1: the villain's). */
function chip(owner: number, name: string): HTMLElement {
  const chips = document.querySelector<HTMLElement>(`.surface .chips[data-owner="${owner}"]`);
  if (!chips) {
    throw new Error(`no chips on the frame of ${owner}`);
  }
  return within(chips).getByRole('button', { name });
}

function box(): HTMLElement {
  return screen.getByRole('dialog');
}

function tile(id: string): HTMLElement {
  const found = box().querySelector<HTMLElement>(`.tile[data-id="${id}"]`);
  if (!found) {
    throw new Error(`no tile ${id}`);
  }
  return found;
}

/** Clicks the face of a stage tile. */
async function pick(key: string) {
  await fireEvent.click(within(tile(key)).getByRole('button'));
}

/** The place badges of the tiles, in their order. */
function tileBadges(): string[] {
  return [...box().querySelectorAll('.pos')].map((badge) => badge.textContent ?? '');
}

/**
 * Three cards out of the deck, bottom to top as a public pile lists them: Swinging Web Kick,
 * Hard to Keep Down, Web-Shooter. Top first, they are not in card number order.
 */
const LOOSE = ['k', 'h', 'w'];

function withLooseCards(view: View): View {
  view.table!.cards.push(
    card('k', { code: '01021', zone: 'pile' }),
    card('h', { code: '01100', owner: -1, back: 'encounter', zone: 'pile' }),
    card('w', { code: '01020', zone: 'pile' }),
  );
  return view;
}

/** The names of the tiles, in their order. */
function tileNames(): string[] {
  return within(box())
    .queryAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label') ?? '');
}

/** The context menu open, over the box or on the table. */
function contextMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.table-menu.context');
}

/** Clicks a tile's card as a mouse does, at that point of the screen. */
async function clickTile(id: string, x = 120, y = 160): Promise<void> {
  const image = tile(id).querySelector<HTMLElement>('.img') as HTMLElement;
  await fireEvent.pointerDown(image, { clientX: x, clientY: y, button: 0 });
  await fireEvent.pointerUp(image, { clientX: x, clientY: y, button: 0 });
  await fireEvent.click(image, { clientX: x, clientY: y });
}

/** Clicks a card or pile of the table, as a mouse does. */
async function clickPlaced(id: string): Promise<void> {
  await fireEvent.pointerDown(placed(id), { button: 0 });
  await fireEvent.pointerUp(placed(id), { button: 0 });
  await fireEvent.click(placed(id));
}

/** The labels of the open menu's items, without their keys. */
function menuLabels(): string[] {
  const menu = contextMenu();
  if (!menu) {
    throw new Error('no menu');
  }
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.querySelector('span')?.textContent ?? '');
}

function menuItem(label: string): HTMLElement {
  const found = within(contextMenu()!)
    .getAllByRole('menuitem')
    .find((item) => item.querySelector('span')?.textContent === label);
  if (!found) {
    throw new Error(`no item ${label}`);
  }
  return found;
}

const SEARCH: PrivateView = { pile: 'deck:p0', mode: 'search', cards: DECK_TOP };
const LOOK: PrivateView = { pile: 'deck:p0', mode: 'top', cards: DECK_TOP };

function domRect(left: number, top: number, width: number, height: number): DOMRect {
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
  };
}

/** Lays the tiles out on one row, 150 apart: the n-th tile of the grid spans 150 n to 150 n + 132. */
function layOutTiles(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const tileOf = this.closest('.tile');
    if (tileOf && this.classList.contains('img')) {
      const index = [...document.querySelectorAll('.mgrid .tile')].indexOf(tileOf);
      return domRect(index * 150, 100, 132, 185);
    }
    return domRect(0, 0, 0, 0);
  });
}

beforeEach(() => {
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(loadGameCards).mockReset();
  vi.mocked(knownCard).mockReset();
  interaction.reset();
});

describe('CardBox', () => {
  it('search box lists private cards top first with count title', async () => {
    await renderTable(makeView({ private: SEARCH }));

    const dialog = box();
    expect(screen.getByRole('dialog', { name: 'Search Your deck (3 cards)' })).toBe(dialog);
    // The count is dimmed.
    expect(dialog.querySelector('.aside')?.textContent).toBe('(3 cards)');
    expect(tileNames()).toEqual(['Web-Shooter', 'Swinging Web Kick', 'Backflip']);
    expect(tile('c1').textContent).toContain('#1');
    expect(tile('c3').textContent).toContain('#3');

    // The filter goes by name; nothing left shows the message.
    const filter = within(dialog).getByRole('textbox', { name: 'Filter by name' });
    await fireEvent.input(filter, { target: { value: 'web' } });
    expect(tileNames()).toEqual(['Web-Shooter', 'Swinging Web Kick']);
    await fireEvent.input(filter, { target: { value: 'zzz' } });
    expect(tileNames()).toEqual([]);
    expect(within(dialog).getByText('No card matches.')).toBeTruthy();

    expect(within(dialog).getByRole('button', { name: 'Close without shuffling' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Shuffle & close' })).toBeTruthy();
  });

  it('shows its cards about as large as the preview, which a box keeps hidden', async () => {
    await renderTable(makeView({ private: SEARCH }));

    // Wide enough for five 220 px columns, never wider than the window.
    expect(box().style.width).toBe('min(1200px, 100%)');
    const grid = /\n {2}\.mgrid \{([^}]*)\}/.exec(boxSource)?.[1] ?? '';
    expect(grid).toMatch(/--min-tile: 220px;/);
    expect(grid).toMatch(
      /grid-template-columns: repeat\(auto-fill, minmax\(var\(--min-tile\), 1fr\)\);/,
    );
    expect(grid).toMatch(/overflow-y: auto;/);
    expect(boxSource).toMatch(/const MIN_TILE = 220;/);
  });

  it('shows two columns of tiles on a phone', () => {
    const phone = /@media \(max-width: 600px\) \{\s*\.mgrid \{([^}]*)\}/.exec(boxSource)?.[1];
    // 2 × 130 px and the 14 px gap fit in a 390 px window's box, its grid's padding taken off.
    expect(phone).toMatch(/--min-tile: 130px;/);
  });

  it("names the deck's hero in the title of a player with two decks", async () => {
    const view = makeView({ private: SEARCH });
    view.you = { ...view.you, areas: ['p0', 'p1'] };
    view.players = [
      {
        ...view.players[0]!,
        decks: [
          { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 0 },
          { area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 0 },
        ],
      },
    ];
    await renderTable(view);

    expect(screen.getByRole('dialog', { name: 'Search Your Spider-Man deck (3 cards)' })).toBe(
      box(),
    );
  });

  it('look box titles the top count and closes with Close', async () => {
    const { session } = await renderTable(makeView({ private: LOOK }));

    expect(screen.getByRole('dialog', { name: 'Top 3 of Your deck' })).toBeTruthy();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('look box reorder sends reorderTop', async () => {
    const { session } = await renderTable(makeView({ private: LOOK }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });

    // A live preview: the card follows the pointer, its slot already where it would go.
    expect(document.querySelector('.tile-ghost')).not.toBeNull();
    expect(tileNames()).toEqual(['Swinging Web Kick', 'Backflip', 'Web-Shooter']);
    expect(tile('c1').classList.contains('lifting')).toBe(true);

    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'reorderTop',
        pile: 'deck:p0',
        cards: ['c2', 'c3', 'c1'],
      },
      0,
    );
    expect(document.querySelector('.tile-ghost')).toBeNull();
    // The new order stays while the server answers.
    expect(tileNames()).toEqual(['Swinging Web Kick', 'Backflip', 'Web-Shooter']);
  });

  it('a card that leaves during a reorder is not sent', async () => {
    const { session, rerender } = await renderTable(makeView({ private: LOOK }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });
    // Another player takes Backflip meanwhile.
    await rerender(makeView({ private: { ...LOOK, cards: ['c1', 'c2'] } }));
    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'reorderTop',
        pile: 'deck:p0',
        cards: ['c2', 'c1'],
      },
      0,
    );
  });

  it('search tiles cannot be reordered', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });

    expect(document.querySelector('.tile-ghost')).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('shuffle & close sends closeView shuffle', async () => {
    const { session, rerender } = await renderTable(makeView({ private: SEARCH }));

    await fireEvent.click(within(box()).getByRole('button', { name: 'Shuffle & close' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView', where: 'shuffle' }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();

    // The server closes the view; a new search opens a new box.
    await rerender(makeView());
    await rerender(makeView({ private: SEARCH }));
    session.act.mockClear();
    expect(box()).toBeTruthy();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close without shuffling' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' }, 0);
  });

  it('keeps the box open when the socket is down and a close is not sent', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    session.act.mockReturnValue(null as never);

    await fireEvent.click(within(box()).getByRole('button', { name: 'Shuffle & close' }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView', where: 'shuffle' }, 0);
    expect(box()).toBeTruthy();
  });

  it('keeps a tile when its action is not sent', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    session.act.mockReturnValue(null as never);
    await clickTile('c1');

    await fireEvent.click(menuItem('Put at the bottom of the deck'));

    expect(session.act).toHaveBeenCalledOnce();
    expect(tile('c1')).toBeTruthy();
  });

  it('escape closes a search like Close', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stage box marks the face on the table and sends chooseStage', async () => {
    const { session } = await renderTable();
    await clickPlaced('v');
    await fireEvent.click(menuItem('Change card…'));

    expect(screen.getByRole('dialog', { name: 'Villain: choose the card to show' })).toBeTruthy();
    // Opening a box lets go of the table: its menu goes.
    expect(contextMenu()).toBeNull();
    expect(interaction.hovered).toBeNull();
    expect(tileNames()).toEqual(['Rhino (stage I)', 'Rhino (stage II)']);
    const shown = tile('v:0');
    expect(shown.classList.contains('shown')).toBe(true);
    expect(shown.textContent).toContain('On the table');
    expect(tile('v2:0').textContent).not.toContain('On the table');

    // The face on the table is not a choice.
    await pick('v:0');
    expect(session.act).not.toHaveBeenCalled();

    await pick('v2:0');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'chooseStage',
        stage: 'villain',
        card: 'v2',
        face: 0,
      },
      0,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stage box lists every face of the main scheme', async () => {
    const { session } = await renderTable();
    await clickPlaced('s');
    await fireEvent.click(menuItem('Change card…'));

    expect(tileNames()).toEqual(['The Break-In! (1A)', 'The Break-In! (1B)']);
    await pick('s:1');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'chooseStage',
        stage: 'main',
        card: 's',
        face: 1,
      },
      0,
    );
  });

  it('box updates when a card leaves', async () => {
    const { rerender } = await renderTable(makeView({ private: SEARCH }));
    await clickTile('c2');
    expect(contextMenu()).not.toBeNull();

    // Another action takes the card away: its tile and its menu go.
    const cards = makeView().table?.cards ?? [];
    const drawn = cards.map((c) => (c.id === 'c2' ? { ...c, zone: 'hand' as const } : c));
    await rerender(makeView({ cards: drawn, private: { ...SEARCH, cards: ['c1', 'c3'] } }));
    expect(tileNames()).toEqual(['Web-Shooter', 'Backflip']);
    expect(screen.getByRole('dialog', { name: 'Search Your deck (2 cards)' })).toBeTruthy();
    expect(contextMenu()).toBeNull();

    await rerender(makeView({ private: { ...SEARCH, cards: [] } }));
    expect(within(box()).getByText('Nothing left here.')).toBeTruthy();
  });

  it('rings the hovered tile, not one sliding under a resting pointer', async () => {
    const { rerender } = await renderTable(makeView({ private: SEARCH }));
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
    await fireEvent.pointerEnter(tile('c2'), { clientX: 100, clientY: 100 });
    expect(tile('c2').classList).toContain('hovered');
    await fireEvent.pointerLeave(tile('c2'));
    expect(tile('c2').classList).not.toContain('hovered');
    await fireEvent.pointerEnter(tile('c2'), { clientX: 100, clientY: 100 });

    // Another player draws it: the next card takes its place under the pointer.
    await rerender(makeView({ private: { ...SEARCH, cards: ['c1', 'c3'] } }));
    await fireEvent.pointerEnter(tile('c3'), { clientX: 100, clientY: 100 });
    expect(tile('c3').classList).not.toContain('hovered');

    // A real move hovers it.
    await fireEvent.pointerMove(window, { clientX: 101, clientY: 100 });
    await fireEvent.pointerEnter(tile('c3'), { clientX: 101, clientY: 100 });
    expect(tile('c3').classList).toContain('hovered');
  });

  it("opens a tile's menu at the pointer on a click, headed with its pile and place", async () => {
    await renderTable(makeView({ private: SEARCH }));
    await clickTile('c3', 140, 210);

    const menu = screen.getByRole('menu', { name: 'Backflip, Your deck · #3' });
    expect(menu).toBe(contextMenu());
    // Inside the box's dialog, so that it shows over it.
    expect(box().contains(menu)).toBe(true);
    expect(menu.style.left).toBe('140px');
    expect(menu.style.top).toBe('210px');
    // The pile as the box title names it and the place, in the owner's colour, over the card's name.
    const title = menu.querySelector<HTMLElement>('.title')!;
    expect(title.querySelector('.eyebrow')?.textContent).toBe('Your deck · #3');
    expect(title.querySelector('.name')?.textContent).toBe('Backflip');
    expect(title.style.getPropertyValue('--owner')).toBe('var(--p1)');
    // What takes the card, then what sends it away; Play is the default.
    expect(menuLabels()).toEqual(['Draw', 'Play', 'Discard', 'Put at the bottom of the deck']);
    expect(menu.querySelectorAll('.msep')).toHaveLength(1);
    expect(menuItem('Play').classList).toContain('default');
    expect(menuItem('Draw').classList).not.toContain('default');
    // The tile stays ringed while its menu is open.
    expect(tile('c3').classList).toContain('hovered');
  });

  it("heads an out-of-play tile's menu with its pile only, in the villain's colour", async () => {
    await renderTable();
    await fireEvent.click(chip(-1, 'Victory display (1)'));
    await clickTile('q1');

    const title = contextMenu()!.querySelector<HTMLElement>('.title')!;
    expect(title.querySelector('.eyebrow')?.textContent).toBe('Victory display');
    expect(title.querySelector('.name')?.textContent).toBe('Hard to Keep Down');
    expect(title.style.getPropertyValue('--owner')).toBe('var(--villain)');
  });

  it("opens a tile's menu on a right click too, never the browser's", async () => {
    await renderTable(makeView({ private: SEARCH }));
    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;

    await fireEvent.pointerDown(image, { button: 2 });
    const event = createEvent.contextMenu(image, { clientX: 50, clientY: 60 });
    await fireEvent(image, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu', { name: 'Web-Shooter, Your deck · #1' })).toBeTruthy();
  });

  it('opens nothing, nor the native menu, on the contextmenu a long touch fires on a tile', async () => {
    await renderTable(makeView({ private: SEARCH }));
    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;

    // The press that began it was a touch.
    await fireEvent.pointerDown(image, {
      button: 0,
      clientX: 50,
      clientY: 60,
      pointerType: 'touch',
    });
    const afterTouch = createEvent.contextMenu(image, { clientX: 50, clientY: 60 });
    await fireEvent(image, afterTouch);
    await fireEvent.pointerUp(image, { button: 0, clientX: 50, clientY: 60, pointerType: 'touch' });
    expect(afterTouch.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();

    // The event says it itself, as Chrome's does.
    await fireEvent.pointerDown(image, { button: 2, clientX: 50, clientY: 60 });
    const touch = new PointerEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 60,
      pointerType: 'touch',
    });
    await fireEvent(image, touch);
    expect(touch.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();

    // A mouse right click still opens it.
    await fireEvent.pointerDown(image, {
      button: 2,
      clientX: 50,
      clientY: 60,
      pointerType: 'mouse',
    });
    const rightClick = createEvent.contextMenu(image, { clientX: 50, clientY: 60 });
    await fireEvent(image, rightClick);
    expect(rightClick.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu', { name: 'Web-Shooter, Your deck · #1' })).toBe(contextMenu());
  });

  it('opens nothing on the click iOS fires after a long touch press on a tile; a short tap opens it', async () => {
    await renderTable(makeView({ private: SEARCH }));
    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    // A press held that long, in ms: the events' time stamps (jsdom's Date.now) say how long.
    const touchFor = async (ms: number): Promise<void> => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
      const touch = { button: 0, clientX: 50, clientY: 60, pointerType: 'touch' };
      await fireEvent.pointerDown(image, touch);
      now.mockReturnValue(10_000 + ms);
      await fireEvent.pointerUp(image, touch);
      await fireEvent.click(image, { clientX: 50, clientY: 60 });
      now.mockRestore();
    };

    await touchFor(LONG_PRESS_MS + 100);
    expect(contextMenu()).toBeNull();

    await touchFor(200);
    expect(screen.getByRole('menu', { name: 'Web-Shooter, Your deck · #1' })).toBe(contextMenu());
  });

  it('a second click on the tile closes its menu; a click on another tile opens that one', async () => {
    await renderTable(makeView({ private: SEARCH }));
    await clickTile('c1');
    expect(contextMenu()).not.toBeNull();

    await clickTile('c1');
    expect(contextMenu()).toBeNull();

    await clickTile('c1');
    await clickTile('c2');
    expect(screen.getByRole('menu', { name: 'Swinging Web Kick, Your deck · #2' })).toBe(
      contextMenu(),
    );
  });

  it('plays a card to the first free slot from its menu, then closes it', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    await clickTile('c1');

    await fireEvent.click(menuItem('Play'));
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        card: 'c1',
        // The first free slot of Alex's row from 760, past the deck at 600 (keys.ts).
        x: 980,
        y: 0,
      },
      0,
    );
    expect(contextMenu()).toBeNull();
    // The box stays open.
    expect(box()).toBeTruthy();
  });

  it('draws, discards or puts a card at the bottom of the deck from its menu', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));

    await clickTile('c1');
    await fireEvent.click(menuItem('Draw'));
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'toHand', card: 'c1' }, 0);

    await clickTile('c2');
    await fireEvent.click(menuItem('Discard'));
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discard', card: 'c2' }, 0);

    await clickTile('c3');
    await fireEvent.click(menuItem('Put at the bottom of the deck'));
    expect(session.act).toHaveBeenLastCalledWith(
      { kind: 'toDeck', card: 'c3', where: 'bottom' },
      0,
    );
    // Put at the bottom, it leaves the box, though it stays in the pile.
    expect(tileNames()).not.toContain('Backflip');
  });

  it('shuffles an out-of-play card into its deck from its menu', async () => {
    const { session } = await renderTable();
    await fireEvent.click(chip(-1, 'Victory display (1)'));
    await clickTile('q1');

    expect(menuLabels()).toEqual([
      'Play',
      'Discard',
      'Put at the bottom of the deck',
      'Shuffle into its deck',
    ]);
    await fireEvent.click(menuItem('Shuffle into its deck'));
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'q1', where: 'shuffle' },
      0,
    );
  });

  it('closes the tile menu with Escape first, then the box', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    await clickTile('c1');
    const menu = contextMenu()!;
    expect(document.activeElement).toBe(menu);

    await fireEvent.keyDown(menu, { key: 'Escape' });
    expect(contextMenu()).toBeNull();
    expect(box()).toBeTruthy();
    expect(session.act).not.toHaveBeenCalled();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' }, 0);
  });

  it('takes the focus into the tile menu only once it shows: a hidden menu cannot have it', async () => {
    // Browsers refuse the focus to an element under visibility: hidden, as the menu is until placed.
    const focusedWhilePlaced: boolean[] = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.classList.contains('table-menu')) {
        focusedWhilePlaced.push(this.classList.contains('placed'));
      }
      focus.call(this, options);
    });
    await renderTable(makeView({ private: SEARCH }));
    await clickTile('c1');

    await waitFor(() => expect(document.activeElement).toBe(contextMenu()));
    expect(focusedWhilePlaced).toEqual([true]);
  });

  it('closes the tile menu with Escape first wherever the focus is, then the box', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    await clickTile('c1');
    // The focus left in the box itself, as a press on a tile leaves it there.
    box().focus();

    // A real key: dispatched on the focused element, bubbling up to the window.
    const escape = () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    escape();
    await tick();
    expect(contextMenu()).toBeNull();
    expect(box()).toBeTruthy();
    expect(tileNames()).toHaveLength(3);
    expect(session.act).not.toHaveBeenCalled();

    escape();
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' }, 0);
  });

  it('opens no menu with the click that ends a reorder of the top cards', async () => {
    const { session } = await renderTable(makeView({ private: LOOK }));
    layOutTiles();

    // Web-Shooter is dragged to the end, then back over its own slot, and let go there.
    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });
    await fireEvent.click(tile('c1').querySelector<HTMLElement>('.img') as HTMLElement);
    expect(session.act).toHaveBeenCalledOnce();
    expect(contextMenu()).toBeNull();

    // A plain click on a tile of the box opens its menu.
    await clickTile('c2', 160, 150);
    expect(contextMenu()).not.toBeNull();
  });

  it("shuffles the scenario's set-aside cards into the encounter deck from their box", async () => {
    const view = makeView();
    view.table!.piles.push(
      pile('saside', { kind: 'aside', count: 1, cards: ['q1'] }),
      pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['q1'] }),
    );
    const { session } = await renderTable(view);
    await fireEvent.click(chip(-1, 'Set-aside cards (1)'));

    await fireEvent.click(
      within(box()).getByRole('button', { name: 'Shuffle into the encounter deck' }),
    );
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'shuffleIn', pile: 'saside' }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("offers no shuffle in for another player's set-aside cards, nor to a spectator", async () => {
    const view = makeView();
    view.table!.piles.push(
      pile('deck:p1', { owner: 1, x: 800 }),
      pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['q1'] }),
      pile('saside', { kind: 'aside', count: 1, cards: ['q1'] }),
    );
    const player = await renderTable(view);
    await fireEvent.click(chip(1, 'Set-aside cards (1)'));
    expect(within(box()).queryByRole('button', { name: /^Shuffle into/ })).toBeNull();
    player.unmount();

    await renderTable(asSpectator(view));
    await fireEvent.click(chip(-1, 'Set-aside cards (1)'));
    expect(within(box()).queryByRole('button', { name: /^Shuffle into/ })).toBeNull();
  });

  it('browse lists a public pile without the server', async () => {
    const { session } = await renderTable();
    // The victory display is not drawn on the table: a chip on the villain's frame opens it.
    expect(document.querySelector('.surface [data-id="vic"]')).toBeNull();
    await fireEvent.click(chip(-1, 'Victory display (1)'));

    expect(screen.getByRole('dialog', { name: 'Victory display' })).toBeTruthy();
    expect(tileNames()).toEqual(['Hard to Keep Down']);
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    expect(session.act).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives the focus back to a clicked chip without a focus ring', async () => {
    await renderTable();
    const victory = chip(-1, 'Victory display (1)');
    const focus = vi.spyOn(victory, 'focus');

    // A mouse press focuses the button it clicks; jsdom does not.
    await fireEvent.pointerDown(victory);
    victory.focus();
    await fireEvent.click(victory, { detail: 1 });
    expect(document.activeElement).not.toBe(victory);
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));

    expect(document.activeElement).toBe(victory);
    expect(focus).toHaveBeenLastCalledWith({ focusVisible: false });
  });

  it('gives the focus back to a chip pressed from the keyboard, ring and all', async () => {
    await renderTable();
    const victory = chip(-1, 'Victory display (1)');
    victory.focus();
    const focus = vi.spyOn(victory, 'focus');

    // Enter on a button clicks it.
    await fireEvent.keyDown(victory, { key: 'Enter' });
    await fireEvent.click(victory, { detail: 0 });
    expect(document.activeElement).not.toBe(victory);
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(victory);
    expect(focus).toHaveBeenLastCalledWith();
  });

  it('out-of-play piles list their cards by card number, with no place badge', async () => {
    const view = withLooseCards(makeView());
    view.table!.piles = view.table!.piles.map((p) =>
      p.id === 'vic' ? { ...p, count: 3, cards: LOOSE } : p,
    );
    view.table!.piles.push(pile('saside', { kind: 'aside', count: 3, cards: LOOSE }));
    await renderTable(view);

    for (const name of ['Victory display (3)', 'Set-aside cards (3)']) {
      await fireEvent.click(chip(-1, name));
      expect(tileNames()).toEqual(['Web-Shooter', 'Swinging Web Kick', 'Hard to Keep Down']);
      expect(tileBadges()).toEqual([]);
      await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    }
  });

  it('a browsed discard pile lists its cards top first, with their place', async () => {
    const view = withLooseCards(makeView());
    view.table!.piles.push(
      pile('disc:p0', { kind: 'discard', owner: 0, x: 650, count: 3, cards: LOOSE }),
    );
    // Players search a discard pile through the server; spectators browse it.
    await renderTable(asSpectator(view));

    await clickPlaced('disc:p0');
    await fireEvent.click(menuItem('Browse…'));
    expect(tileNames()).toEqual(['Web-Shooter', 'Hard to Keep Down', 'Swinging Web Kick']);
    expect(tileBadges()).toEqual(['#1', '#2', '#3']);
  });

  it('stage box lists its cards by card number, each face A before B', async () => {
    const view = makeView();
    view.table!.cards.push(
      card('s2', { code: '01098', owner: -1, back: 'encounter', zone: 'stage' }),
    );
    view.table!.stages = [
      { key: 'villain', label: 'Villain', current: 'v', cards: ['v2', 'v'] },
      { key: 'main', label: 'Main scheme', current: 's', cards: ['s2', 's'] },
    ];
    await renderTable(view);

    await clickPlaced('v');
    await fireEvent.click(menuItem('Change card…'));
    expect(tileNames()).toEqual(['Rhino (stage I)', 'Rhino (stage II)']);
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));

    await clickPlaced('s');
    await fireEvent.click(menuItem('Change card…'));
    expect(tileNames()).toEqual([
      'The Break-In! (1A)',
      'The Break-In! (1B)',
      'Crime Wave (2A)',
      'Crime Wave (2B)',
    ]);
  });

  it('an empty encounter deck has no menu: its frame still opens the victory display', async () => {
    const view = makeView();
    view.table!.piles = view.table!.piles.map((p) => (p.id === 'enc' ? { ...p, count: 0 } : p));
    await renderTable(view);

    await clickPlaced('enc');
    expect(contextMenu()).toBeNull();
    await fireEvent.click(chip(-1, 'Victory display (1)'));
    expect(screen.getByRole('dialog', { name: 'Victory display' })).toBeTruthy();
  });

  it('spectator cannot open look', async () => {
    const { session } = await renderTable(asSpectator(makeView()));

    await fireEvent.pointerEnter(placed('deck:p0'));
    await clickPlaced('deck:p0');
    expect(contextMenu()).toBeNull();
    await fireEvent.keyDown(window, { key: 'l' });
    await fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // The encounter deck has no menu; the villain's frame opens the victory display, read-only:
    // no tile actions.
    await clickPlaced('enc');
    expect(contextMenu()).toBeNull();
    await fireEvent.click(chip(-1, 'Victory display (1)'));
    await clickTile('q1');
    expect(contextMenu()).toBeNull();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    expect(session.act).not.toHaveBeenCalled();
  });

  it('spectator gets no stage button on the villain nor the main scheme', async () => {
    await renderTable(asSpectator(makeView()));

    await clickPlaced('v');
    expect(contextMenu()).toBeNull();
    await clickPlaced('s');
    expect(contextMenu()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('tileActions', () => {
  function actionsOf(id: string, pileId: string, view = makeView()): TileAction[] {
    const table = view.table;
    const found = table?.cards.find((c) => c.id === id);
    const from = table?.piles.find((p) => p.id === pileId);
    if (!found || !from) {
      throw new Error(`no ${id} in ${pileId}`);
    }
    return tileActions(found, from, { view, selected: 0, sizeOf: () => 'std' });
  }

  it('an out-of-play encounter card goes back to the encounter deck', () => {
    const actions = actionsOf('q1', 'vic');
    expect(actions.map((a) => a.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(actions.find((a) => a.id === 'bottom')?.run()).toEqual({
      kind: 'toDeck',
      card: 'q1',
      where: 'bottom',
    });
    expect(actions.find((a) => a.id === 'shuffle')?.run()).toEqual({
      kind: 'toDeck',
      card: 'q1',
      where: 'shuffle',
    });
  });

  it('a card of the own deck can be drawn', () => {
    const actions = actionsOf('c1', 'deck:p0');
    expect(actions.map((a) => a.id)).toEqual(['draw', 'play', 'discard', 'bottom']);
    expect(actions[0]?.run()).toEqual({ kind: 'toHand', card: 'c1' });
    expect(actions.find((a) => a.id === 'discard')?.run()).toEqual({ kind: 'discard', card: 'c1' });
  });

  it('a discard pile offers Draw to its owner only', () => {
    const view = makeView();
    view.table?.piles.push(
      pile('disc:p0', { kind: 'discard', owner: 0, count: 1, cards: ['c1'] }),
      pile('disc:p1', { kind: 'discard', owner: 1, count: 1, cards: ['c1'] }),
    );
    expect(actionsOf('c1', 'disc:p0', view).map((a) => a.id)).toEqual(['draw', 'play', 'shuffle']);
    // The viewer's own card still shuffles into the viewer's deck.
    expect(actionsOf('c1', 'disc:p1', view).map((a) => a.id)).toEqual(['play', 'shuffle']);
  });

  it("another player's set-aside cards cannot be touched", () => {
    const view = makeView();
    view.table?.piles.push(pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['c1'] }));
    expect(actionsOf('c1', 'aside:p1', view)).toEqual([]);
  });
});

describe('compareCardNumbers', () => {
  it('orders by code, then by id, with the cards without a code last', () => {
    const cards = [
      card('faceDown', { code: undefined }),
      card('b', { code: '01043b' }),
      card('later', { code: '01100' }),
      card('a2', { code: '01043a' }),
      card('a1', { code: '01043a' }),
      card('first', { code: '01020' }),
    ];
    expect(cards.sort(compareCardNumbers).map((c) => c.id)).toEqual([
      'first',
      'a1',
      'a2',
      'b',
      'later',
      'faceDown',
    ]);
  });
});

describe('pileLabel', () => {
  it('names piles from the viewer side', () => {
    const view = makeView();
    const label = (p: PileView) => pileLabel(p, view);
    expect(label(pile('deck:p0', { owner: 0 }))).toBe('Your deck');
    expect(label(pile('disc:p1', { kind: 'discard', owner: 1 }))).toBe("Sam's discard");
    expect(label(pile('aside:p0', { kind: 'aside', owner: 0 }))).toBe('Your set-aside cards');
    expect(label(pile('saside', { kind: 'aside' }))).toBe('Set-aside cards');
    expect(label(pile('enc', { kind: 'encounter' }))).toBe('Encounter deck');
    expect(label(pile('encd', { kind: 'encounterDiscard' }))).toBe('Encounter discard');
    expect(label(pile('vic', { kind: 'victory' }))).toBe('Victory display');
  });
});
