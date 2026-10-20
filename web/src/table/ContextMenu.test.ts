import { createEvent, fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { LONG_PRESS_MS } from './longPress';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man', type: 'hero' }],
  '01094': [{ name: 'Rhino', type: 'villain', stage: 'I' }],
  '01099': [{ name: 'Black Cat', type: 'ally' }],
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

/** Rhino with Alex (p0, the viewer) and Sam (p1). */
function makeView(extra: { cards?: TableCard[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine', { x: 0, tokens: { dmg: 6 } }),
    card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
    card('h', { zone: 'hand' }),
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
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 1 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: [
        pile('deck:p0', { owner: 0, x: 600, count: 34 }),
        pile('deck:p1', { owner: 1, x: 600, y: 300 }),
        pile('enc', { kind: 'encounter', x: 900, count: 29 }),
      ],
      hands: { p0: ['h'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
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

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
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
}

async function renderTable(view = makeView()) {
  // The visible table, and the menus' width: jsdom lays nothing out.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('tablewrap')) {
      return rect(0, 50, 1000, 700);
    }
    if (this.classList.contains('table-menu')) {
      // 200 wide, where it is placed.
      return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, 200, 0);
    }
    return rect(0, 0, 0, 0);
  });
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await screen.findByRole('img', { name: 'Rhino' });
  return { session, ...result };
}

/**
 * Right-clicks the element at that point, pressing the button first as a mouse
 * does; returns the context menu event, to check what it prevented.
 */
async function rightClick(target: Element, x = 120, y = 80): Promise<Event> {
  await fireEvent.pointerDown(target, { button: 2, clientX: x, clientY: y });
  const event = createEvent.contextMenu(target, { clientX: x, clientY: y });
  await fireEvent(target, event);
  return event;
}

function contextMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.table-menu.context');
}

/** The labels of a menu's items, without their keys. */
function labels(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.querySelector('span')?.textContent ?? '');
}

function menuItem(menu: HTMLElement, label: string): HTMLElement {
  const found = within(menu)
    .getAllByRole('menuitem')
    .find((item) => item.querySelector('span')?.textContent === label);
  if (!found) {
    throw new Error(`no item ${label}`);
  }
  return found;
}

/** What the menu's header shows: its eyebrow, its name, a pile's count, and their colour. */
function headerOf(menu: HTMLElement): {
  eyebrow?: string;
  name?: string;
  count?: string;
  color: string;
} {
  const title = menu.querySelector<HTMLElement>('.title');
  if (!title) {
    throw new Error('no header');
  }
  const count = title.querySelector('.count')?.textContent;
  return {
    eyebrow: title.querySelector('.eyebrow')?.textContent ?? undefined,
    name: title.querySelector('.name')?.textContent ?? undefined,
    ...(count === undefined ? {} : { count }),
    color: title.style.getPropertyValue('--owner'),
  };
}

function bar(): HTMLElement | null {
  return screen.queryByRole('toolbar', { name: 'Actions' });
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

describe('the context menu', () => {
  it('opens at the pointer on a right click, with every action of the card', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    expect(bar()).not.toBeNull();

    const event = await rightClick(placed('mine'));
    expect(event.defaultPrevented).toBe(true);

    const menu = screen.getByRole('menu', { name: 'Spider-Man, Hero' });
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');
    // The header says what the card is and names it, in its owner's colour; it is no choice.
    expect(headerOf(menu)).toEqual({ eyebrow: 'Hero', name: 'Spider-Man', color: 'var(--p1)' });
    expect(labels(menu)).toEqual([
      'Exhaust',
      'Add a token',
      'Add a status',
      'Discard',
      'Move to',
      'Draw an arrow',
    ]);
    expect(menu.querySelectorAll('.msep')).toHaveLength(3);
    // The default action is in bold; each item shows its key; a submenu row its arrow.
    expect(menuItem(menu, 'Exhaust').classList).toContain('default');
    expect(menuItem(menu, 'Discard').querySelector('kbd')?.textContent).toBe('⌫');
    const tokens = menuItem(menu, 'Add a token');
    expect(tokens.getAttribute('aria-haspopup')).toBe('menu');
    expect(tokens.getAttribute('aria-expanded')).toBe('false');
    expect(tokens.textContent).toContain('▸');
    // The bar goes while the menu is open, and the menu has the focus.
    expect(bar()).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it('flips left of the pointer near the right edge of the table', async () => {
    await renderTable();
    await rightClick(placed('mine'), 950, 80);

    expect(contextMenu()?.style.left).toBe('750px');
  });

  it('runs a chosen item as the bar would, then closes', async () => {
    const { session } = await renderTable();
    await rightClick(placed('mine'));

    await fireEvent.click(menuItem(contextMenu()!, 'Exhaust'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' }, 0);
    expect(contextMenu()).toBeNull();
  });

  it('opens a submenu on a click, whose items run', async () => {
    const { session } = await renderTable();
    await rightClick(placed('mine'));

    await fireEvent.click(menuItem(contextMenu()!, 'Add a token'));
    const submenu = screen.getByRole('menu', { name: 'Add a token' });
    expect(labels(submenu)).toEqual(['Damage (6)', 'Threat', 'Counter']);
    // Right of the menu.
    expect(submenu.style.left).toBe('320px');

    await fireEvent.click(menuItem(submenu, 'Damage (6)'));
    expect(session.act).toHaveBeenCalledWith(
      { kind: 'token', card: 'mine', name: 'dmg', delta: 1 },
      0,
    );
    expect(contextMenu()).toBeNull();
  });

  it('opens a submenu on hover after a short rest', async () => {
    await renderTable();
    await rightClick(placed('mine'));
    vi.useFakeTimers();

    await fireEvent.pointerEnter(menuItem(contextMenu()!, 'Add a status'));
    expect(screen.queryByRole('menu', { name: 'Add a status' })).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    const submenu = screen.getByRole('menu', { name: 'Add a status' });
    expect(labels(submenu)).toEqual(['Stunned', 'Confused', 'Tough', 'Locked']);

    // Resting on a plain item closes it.
    await fireEvent.pointerEnter(menuItem(contextMenu()!, 'Exhaust'));
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByRole('menu', { name: 'Add a status' })).toBeNull();
  });

  it('follows a redraw of its element', async () => {
    const { rerender } = await renderTable();
    await rightClick(placed('mine'));
    await fireEvent.click(menuItem(contextMenu()!, 'Add a token'));

    const view = makeView();
    view.table!.cards[0]!.tokens = { dmg: 7 };
    await rerender({ view });
    expect(labels(screen.getByRole('menu', { name: 'Add a token' }))[0]).toBe('Damage (7)');

    // The card leaves the table: its menu goes with it.
    const gone = makeView();
    gone.table!.cards = gone.table!.cards.filter((c) => c.id !== 'mine');
    await rerender({ view: gone });
    expect(contextMenu()).toBeNull();
  });

  it('greys out what the villain cannot do, and does nothing with it', async () => {
    const { session } = await renderTable();
    await rightClick(placed('v'));
    const menu = screen.getByRole('menu', { name: 'Rhino, Villain, stage I' });

    const discard = menuItem(menu, 'Discard');
    expect(discard.getAttribute('aria-disabled')).toBe('true');
    expect(discard.dataset.tip).toBe(
      'The villain card stays on the table: choose another card to show',
    );
    await fireEvent.click(discard);
    const moveTo = menuItem(menu, 'Move to');
    await fireEvent.click(moveTo);
    expect(session.act).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu', { name: 'Move to' })).toBeNull();
    expect(contextMenu()).not.toBeNull();
  });

  it('names a pile with its count, and runs its default action', async () => {
    const { session } = await renderTable();
    await rightClick(placed('deck:p0'));
    const menu = screen.getByRole('menu', { name: 'Your deck, 34 cards' });

    expect(labels(menu)).toEqual(['Draw 1', 'Draw X', 'Top X', 'Search', 'Discard X', 'Shuffle']);
    expect(menuItem(menu, 'Draw 1').classList).toContain('default');
    await fireEvent.click(menuItem(menu, 'Draw 1'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'draw', n: 1 }, 0);
  });

  it("heads a villain card with its type and stage, in the villain's colour", async () => {
    await renderTable();
    await rightClick(placed('v'));

    expect(headerOf(contextMenu()!)).toEqual({
      eyebrow: 'Villain · Stage I',
      name: 'Rhino',
      color: 'var(--villain)',
    });
  });

  it("heads a player's ally and a face-down card in the owner's seat colour", async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
      card('cat', { code: '01099', x: 0 }),
      card('down', { code: undefined, faceDown: true, x: 150 }),
    ];
    await renderTable(makeView({ cards }));

    await rightClick(placed('cat'));
    expect(screen.getByRole('menu', { name: 'Black Cat, Ally' })).toBe(contextMenu());
    expect(headerOf(contextMenu()!)).toEqual({
      eyebrow: 'Ally',
      name: 'Black Cat',
      color: 'var(--p1)',
    });
    await fireEvent.keyDown(contextMenu()!, { key: 'Escape' });

    await rightClick(placed('down'));
    expect(headerOf(screen.getByRole('menu', { name: 'Face-down card' }))).toEqual({
      eyebrow: 'Face down',
      name: 'Face-down card',
      color: 'var(--p1)',
    });
  });

  it("heads a pile with its owner, its kind and a count pill, in the owner's colour", async () => {
    await renderTable();
    await rightClick(placed('deck:p0'));
    expect(headerOf(contextMenu()!)).toEqual({
      eyebrow: 'Alex · Spider-Man',
      name: 'Deck',
      count: '34',
      color: 'var(--p1)',
    });
    await fireEvent.keyDown(contextMenu()!, { key: 'Escape' });

    await rightClick(placed('enc'));
    const menu = screen.getByRole('menu', { name: 'Encounter deck, 29 cards' });
    expect(headerOf(menu)).toEqual({
      eyebrow: 'Villain',
      name: 'Encounter deck',
      count: '29',
      color: 'var(--villain)',
    });
  });

  it('starts an arrow from the card', async () => {
    await renderTable();
    await rightClick(placed('mine'));

    await fireEvent.click(menuItem(contextMenu()!, 'Draw an arrow'));
    expect(interaction.arrowFrom).toBe('mine');
    expect(contextMenu()).toBeNull();
  });

  it('closes with Escape, or a press outside it', async () => {
    await renderTable();
    await rightClick(placed('mine'));
    await fireEvent.keyDown(contextMenu()!, { key: 'Escape' });
    expect(contextMenu()).toBeNull();

    await rightClick(placed('mine'));
    await fireEvent.pointerDown(document.body);
    expect(contextMenu()).toBeNull();
  });

  it('steps through its items with the arrow keys', async () => {
    await renderTable();
    await rightClick(placed('mine'));
    const menu = contextMenu()!;

    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(menuItem(menu, 'Exhaust'));
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(menuItem(menu, 'Add a token'));

    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    const submenu = screen.getByRole('menu', { name: 'Add a token' });
    await vi.waitFor(() => expect(document.activeElement).toBe(menuItem(submenu, 'Damage (6)')));
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'Add a token' })).toBeNull();
    expect(document.activeElement).toBe(menuItem(menu, 'Add a token'));
  });

  it('prevents the native menu on an empty spot of the table, without a menu of its own', async () => {
    await renderTable();
    const surface = document.querySelector('.tablewrap .surface')!;

    const event = await rightClick(surface);
    expect(event.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();
  });

  it('leaves the native menu outside the table, and on hand cards', async () => {
    await renderTable();

    const history = screen.getByRole('complementary', { name: 'History' });
    expect((await rightClick(history)).defaultPrevented).toBe(false);
    const hand = within(screen.getByRole('list', { name: 'Your hand' })).getByRole('listitem');
    expect((await rightClick(hand)).defaultPrevented).toBe(false);
    expect(contextMenu()).toBeNull();
  });

  it('opens on a long touch, which neither drags nor taps', async () => {
    await renderTable();
    vi.useFakeTimers();
    const mine = placed('mine');

    await fireEvent.pointerDown(mine, { pointerType: 'touch', clientX: 40, clientY: 90 });
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
    const menu = screen.getByRole('menu', { name: 'Spider-Man, Hero' });
    expect(menu.style.left).toBe('40px');
    expect(menu.style.top).toBe('90px');
    // The press is over: moving the finger drags nothing, lifting it taps nothing.
    expect(interaction.held).toBeNull();
    await fireEvent.pointerMove(mine, {
      pointerType: 'touch',
      clientX: 140,
      clientY: 190,
      buttons: 1,
    });
    expect(interaction.dragging).toBeNull();
    await fireEvent.pointerUp(mine, { pointerType: 'touch' });
    await fireEvent.click(mine);
    expect(interaction.locked).toBe(false);
    expect(contextMenu()).not.toBeNull();
  });

  it('opens on no touch that moves or lifts too soon', async () => {
    await renderTable();
    vi.useFakeTimers();
    const mine = placed('mine');

    await fireEvent.pointerDown(mine, { pointerType: 'touch', clientX: 40, clientY: 90 });
    await fireEvent.pointerMove(mine, {
      pointerType: 'touch',
      clientX: 60,
      clientY: 90,
      buttons: 1,
    });
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
    expect(contextMenu()).toBeNull();
    await fireEvent.pointerUp(mine, { pointerType: 'touch' });

    await fireEvent.pointerDown(mine, { pointerType: 'touch', clientX: 40, clientY: 90 });
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS / 2);
    await fireEvent.pointerUp(mine, { pointerType: 'touch' });
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
    expect(contextMenu()).toBeNull();
  });

  it('opens on no long touch of a hand card', async () => {
    await renderTable();
    vi.useFakeTimers();
    const hand = within(screen.getByRole('list', { name: 'Your hand' })).getByRole('listitem');

    await fireEvent.pointerDown(hand, { pointerType: 'touch' });
    await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
    expect(contextMenu()).toBeNull();
  });
});
