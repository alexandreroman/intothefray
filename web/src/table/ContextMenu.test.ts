import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import menuSource from './ContextMenu.svelte?raw';
import tableSource from './Table.svelte?raw';
import { interaction, LONG_PRESS_MS } from './interaction.svelte';
import { TOUCH_MODE_QUERY } from './touch';
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
  '01002': [
    { name: 'Peter Parker', type: 'alter_ego' },
    { name: 'Spider-Man', type: 'hero' },
  ],
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
function makeView(extra: { cards?: TableCard[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine', { x: 0, tokens: { dmg: 6 } }),
    card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
    card('h', { zone: 'hand' }),
  ];
  const piles = extra.piles ?? [
    pile('deck:p0', { owner: 0, x: 600, count: 34 }),
    pile('deck:p1', { owner: 1, x: 600, y: 300 }),
    pile('enc', { kind: 'encounter', x: 900, count: 29 }),
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
      piles,
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

/**
 * Clicks the element at that point as a mouse or a finger does: a press, a
 * release that does not move, then the click.
 */
async function click(
  target: Element,
  x = 120,
  y = 80,
  init: { pointerType?: string; altKey?: boolean } = {},
): Promise<void> {
  await fireEvent.pointerDown(target, { button: 0, clientX: x, clientY: y, ...init });
  await fireEvent.pointerUp(target, { button: 0, clientX: x, clientY: y, ...init });
  await fireEvent.click(target, { clientX: x, clientY: y, altKey: init.altKey ?? false });
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

/**
 * Taps the element with a finger held down that long, in ms: the events' time
 * stamps (jsdom's Date.now) say how long the press lasted.
 */
async function touchFor(target: Element, ms: number, x = 120, y = 80): Promise<void> {
  const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
  const touch = { button: 0, clientX: x, clientY: y, pointerType: 'touch' };
  await fireEvent.pointerDown(target, touch);
  now.mockReturnValue(10_000 + ms);
  await fireEvent.pointerUp(target, touch);
  await fireEvent.click(target, { clientX: x, clientY: y });
  now.mockRestore();
}

/** The hint of the arrow mode, above the card the arrow starts from. */
function arrowHint(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.arrowhint');
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
    expect(menuItem(menu, 'Discard').querySelector('kbd')?.textContent).toBe('X');
    const tokens = menuItem(menu, 'Add a token');
    expect(tokens.getAttribute('aria-haspopup')).toBe('menu');
    expect(tokens.getAttribute('aria-expanded')).toBe('false');
    expect(tokens.textContent).toContain('▸');
    // The menu has the focus: the arrow keys reach its items.
    expect(document.activeElement).toBe(menu);
  });

  it('flips left of the pointer near the right edge of the table', async () => {
    await renderTable();
    await rightClick(placed('mine'), 950, 80);

    expect(contextMenu()?.style.left).toBe('750px');
  });

  it('runs a chosen item, then closes', async () => {
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

  it.each([
    {
      row: 'Move to',
      item: 'Hand',
      action: { kind: 'toHand', card: 'mine' },
    },
    {
      row: 'Add a token',
      item: 'Damage (6)',
      action: { kind: 'token', card: 'mine', name: 'dmg', delta: 1 },
    },
  ])(
    'keeps the $row submenu open on hover over its items, which run',
    async ({ row, item, action }) => {
      const { session } = await renderTable();
      await rightClick(placed('mine'));
      vi.useFakeTimers();

      await fireEvent.pointerEnter(menuItem(contextMenu()!, row));
      await vi.advanceTimersByTimeAsync(200);
      const submenu = screen.getByRole('menu', { name: row });

      // On its way to an item, the pointer enters the submenu, then the item: both keep it open.
      await fireEvent.pointerEnter(submenu);
      await fireEvent.pointerEnter(menuItem(submenu, item));
      await vi.advanceTimersByTimeAsync(1000);
      expect(screen.getByRole('menu', { name: row })).toBe(submenu);

      await fireEvent.click(menuItem(submenu, item));
      expect(session.act).toHaveBeenCalledWith(action, 0);
      expect(contextMenu()).toBeNull();
    },
  );

  it('closes the open submenu when the pointer rests on another row of the menu', async () => {
    await renderTable();
    await rightClick(placed('mine'));
    vi.useFakeTimers();

    await fireEvent.pointerEnter(menuItem(contextMenu()!, 'Move to'));
    await vi.advanceTimersByTimeAsync(200);
    const submenu = screen.getByRole('menu', { name: 'Move to' });
    await fireEvent.pointerEnter(submenu);
    await fireEvent.pointerEnter(menuItem(submenu, 'Hand'));

    await fireEvent.pointerEnter(menuItem(contextMenu()!, 'Discard'));
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByRole('menu', { name: 'Move to' })).toBeNull();
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

    const reason = 'The villain card stays on the table: choose another card to show';
    const discard = menuItem(menu, 'Discard');
    expect(discard.getAttribute('aria-disabled')).toBe('true');
    expect(discard.dataset.tip).toBe(reason);
    // Screen readers read the reason with the item; its name stays its label and its key.
    expect(screen.getByRole('menuitem', { name: 'DiscardX', description: reason })).toBe(discard);
    const moveTo = menuItem(menu, 'Move to');
    expect(screen.getByRole('menuitem', { name: 'Move to', description: reason })).toBe(moveTo);
    // An enabled item has no reason.
    expect(menuItem(menu, 'Exhaust').hasAttribute('aria-describedby')).toBe(false);
    expect(menuItem(menu, 'Exhaust').hasAttribute('data-tip')).toBe(false);
    await fireEvent.click(discard);
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

  it('shows the reason of a disabled item under its label under a finger, within the menu width', () => {
    const hidden = /\n {2}\.reason \{([^}]*)\}/.exec(menuSource)?.[1];
    expect(hidden).toMatch(/position: absolute;/);
    expect(hidden).toMatch(/clip-path: inset\(50%\);/);
    const coarse =
      /@media \(pointer: coarse\) \{\s*\.table-menu button\.has-reason \{[^}]*\}\s*\.table-menu button > \.reason \{([^}]*)\}/.exec(
        menuSource,
      )?.[1];
    expect(coarse).toMatch(/position: static;/);
    expect(coarse).toMatch(/flex: 1 0 100%;/);
    expect(coarse).toMatch(/white-space: normal;/);
    // It wraps within the labels' width rather than widening the menu.
    expect(coarse).toMatch(/contain: inline-size;/);
    expect(coarse).toMatch(/color: var\(--muted\);/);
  });

  it('closes on Tab, which lets the focus move on', async () => {
    await renderTable();
    await rightClick(placed('mine'));
    const menu = screen.getByRole('menu', { name: 'Spider-Man, Hero' });
    menuItem(menu, 'Exhaust').focus();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(tab);
    await tick();
    expect(contextMenu()).toBeNull();
    // The browser moves the focus as Tab does.
    expect(tab.defaultPrevented).toBe(false);

    // From a submenu too.
    await rightClick(placed('mine'));
    await fireEvent.click(menuItem(contextMenu()!, 'Add a token'));
    within(screen.getByRole('menu', { name: 'Add a token' }))
      .getAllByRole('menuitem')[0]!
      .focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    await tick();
    expect(contextMenu()).toBeNull();
  });

  it('prevents the native menu on an empty spot of the table, without a menu of its own', async () => {
    await renderTable();
    const surface = document.querySelector('.tablewrap .surface')!;

    const event = await rightClick(surface);
    expect(event.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();
  });

  it('prevents the native menu anywhere on the screen, opening no menu off the table', async () => {
    const { container } = await renderTable();

    const history = screen.getByRole('complementary', { name: 'History' });
    expect((await rightClick(history)).defaultPrevented).toBe(true);
    const hand = within(screen.getByRole('list', { name: 'Your hand' })).getByRole('listitem');
    expect((await rightClick(hand)).defaultPrevented).toBe(true);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect((await rightClick(zoomIn)).defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();

    // A text field keeps it, to paste in.
    const field = container.querySelector('.app')!.appendChild(document.createElement('input'));
    expect((await rightClick(field)).defaultPrevented).toBe(false);
  });

  it('opens no callout of iOS anywhere on the screen, but in a text field', () => {
    const app = /\n {2}\.app \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(app).toMatch(/-webkit-touch-callout: none;/);
    const fields =
      /\n {2}\.app :global\(:is\(input, textarea, \[contenteditable\]\)\) \{([^}]*)\}/.exec(
        tableSource,
      )?.[1];
    expect(fields).toMatch(/-webkit-touch-callout: default;/);
  });
});

describe('opening the context menu with a click', () => {
  it('opens at the pointer on a plain click on a card or a pile', async () => {
    await renderTable();

    await click(placed('mine'), 140, 90);
    const menu = screen.getByRole('menu', { name: 'Spider-Man, Hero' });
    expect(menu.style.left).toBe('140px');
    expect(menu.style.top).toBe('90px');
    expect(document.activeElement).toBe(menu);

    // A click on another element opens that one's menu instead, where it is clicked.
    await click(placed('deck:p0'), 610, 120);
    const deck = screen.getByRole('menu', { name: 'Your deck, 34 cards' });
    expect(deck).toBe(contextMenu());
    expect(deck.style.left).toBe('610px');
    expect(labels(deck)[0]).toBe('Draw 1');
  });

  it('closes on a second click on the same element', async () => {
    await renderTable();
    await click(placed('mine'));
    expect(contextMenu()).not.toBeNull();

    await click(placed('mine'));
    expect(contextMenu()).toBeNull();
    // A third click opens it again.
    await click(placed('mine'));
    expect(contextMenu()).not.toBeNull();
  });

  it('opens at the tap point on a touch tap', async () => {
    await renderTable();

    await click(placed('v'), 320, 140, { pointerType: 'touch' });
    const menu = screen.getByRole('menu', { name: 'Rhino, Villain, stage I' });
    expect(menu.style.left).toBe('320px');
    expect(menu.style.top).toBe('140px');
    // A tap selects nothing on the table: the menu holds the card.
    expect(interaction.locked).toBe(false);
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'v' });
  });

  it('opens nothing, nor the native menu, on the contextmenu a long touch fires', async () => {
    await renderTable();

    // The press that began it was a touch.
    await fireEvent.pointerDown(placed('v'), {
      button: 0,
      clientX: 320,
      clientY: 140,
      pointerType: 'touch',
    });
    const afterTouch = createEvent.contextMenu(placed('v'), { clientX: 320, clientY: 140 });
    await fireEvent(placed('v'), afterTouch);
    await fireEvent.pointerUp(placed('v'), {
      button: 0,
      clientX: 320,
      clientY: 140,
      pointerType: 'touch',
    });
    expect(afterTouch.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();

    // The event says it itself, as Chrome's does.
    await fireEvent.pointerDown(placed('v'), { button: 2, clientX: 320, clientY: 140 });
    const touch = new PointerEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      clientY: 140,
      pointerType: 'touch',
    });
    await fireEvent(placed('v'), touch);
    expect(touch.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();

    // A mouse right click still opens it.
    expect((await rightClick(placed('v'), 320, 140)).defaultPrevented).toBe(true);
    expect(screen.getByRole('menu', { name: 'Rhino, Villain, stage I' })).toBe(contextMenu());
  });

  it('opens nothing on the click iOS fires after a long touch press; a short tap opens it', async () => {
    await renderTable();

    await touchFor(placed('v'), LONG_PRESS_MS + 100, 320, 140);
    expect(contextMenu()).toBeNull();

    await touchFor(placed('v'), 200, 320, 140);
    expect(screen.getByRole('menu', { name: 'Rhino, Villain, stage I' })).toBe(contextMenu());

    // A mouse held as long still clicks.
    await fireEvent.keyDown(window, { key: 'Escape' });
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    await fireEvent.pointerDown(placed('v'), { button: 0, clientX: 320, clientY: 140 });
    now.mockReturnValue(12_000);
    await fireEvent.pointerUp(placed('v'), { button: 0, clientX: 320, clientY: 140 });
    await fireEvent.click(placed('v'), { clientX: 320, clientY: 140 });
    expect(contextMenu()).not.toBeNull();
  });

  it("opens on macOS's Ctrl + click, a mouse contextmenu", async () => {
    await renderTable();

    await fireEvent.pointerDown(placed('v'), { button: 0, ctrlKey: true, pointerType: 'mouse' });
    const event = new PointerEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 320,
      clientY: 140,
      pointerType: 'mouse',
    });
    await fireEvent(placed('v'), event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu', { name: 'Rhino, Villain, stage I' })).toBe(contextMenu());
  });

  it('opens nothing with the click that ends a drag', async () => {
    await renderTable();

    await fireEvent.pointerDown(placed('mine'), { button: 0, clientX: 50, clientY: 90 });
    await fireEvent.pointerMove(window, { clientX: 250, clientY: 190, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 250, clientY: 190 });
    await fireEvent.click(placed('mine'), { clientX: 250, clientY: 190 });
    expect(contextMenu()).toBeNull();
  });

  it('opens nothing with Alt + click, which pings', async () => {
    await renderTable();

    await click(placed('mine'), 120, 80, { altKey: true });
    expect(contextMenu()).toBeNull();
  });

  it('opens nothing on a hand card, nor on an empty pile', async () => {
    const view = makeView();
    view.table!.piles = view.table!.piles.map((p) => (p.id === 'enc' ? { ...p, count: 0 } : p));
    await renderTable(view);

    await click(within(screen.getByRole('list', { name: 'Your hand' })).getByRole('listitem'));
    expect(contextMenu()).toBeNull();
    await click(placed('enc'));
    expect(contextMenu()).toBeNull();
  });

  it("says whose another player's deck is in a dialog, with nothing to choose", async () => {
    await renderTable();

    await click(placed('deck:p1'));
    // No menu without items: a dialog, described by its note.
    expect(screen.queryByRole('menu')).toBeNull();
    const dialog = screen.getByRole('dialog', {
      name: "Sam's deck, 30 cards",
      description: 'Belongs to Sam: only they can use it.',
    });
    expect(dialog).toBe(contextMenu());
    expect(within(dialog).queryAllByRole('menuitem')).toHaveLength(0);
    expect(document.activeElement).toBe(dialog);

    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(contextMenu()).toBeNull();
  });

  it('offers a spectator Browse… on a public pile, and nothing on a card', async () => {
    const view = makeView({
      piles: [
        ...makeView().table!.piles,
        pile('disc:p0', { kind: 'discard', owner: 0, x: 750, count: 1, cards: ['gone'] }),
      ],
    });
    view.table!.cards.push(card('gone', { zone: 'pile' }));
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    await renderTable(view);

    await click(placed('mine'));
    expect(contextMenu()).toBeNull();
    await click(placed('v'));
    expect(contextMenu()).toBeNull();

    await click(placed('disc:p0'));
    expect(labels(contextMenu()!)).toEqual(['Browse…']);
    await fireEvent.click(menuItem(contextMenu()!, 'Browse…'));
    expect(screen.getByRole('dialog', { name: "Alex's discard" })).toBeTruthy();
  });

  it("opens a selected card's own menu and keeps the selection; another card's clears it", async () => {
    const cards = [
      card('mine', { x: 0 }),
      card('cat', { code: '01099', x: 150 }),
      card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    interaction.setGroup(new Set(['mine', 'cat']));

    await click(placed('mine'));
    expect(screen.getByRole('menu', { name: 'Spider-Man, Hero' })).toBe(contextMenu());
    expect([...interaction.group]).toEqual(['mine', 'cat']);
    // Its actions are that card's alone: a group only moves by drag.
    await fireEvent.click(menuItem(contextMenu()!, 'Exhaust'));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'mine' }, 0);
    expect(interaction.group.size).toBe(2);

    await click(placed('v'));
    expect(screen.getByRole('menu', { name: 'Rhino, Villain, stage I' })).toBe(contextMenu());
    expect(interaction.group.size).toBe(0);
  });

  it('closes with Escape wherever the focus is, which does nothing more', async () => {
    const cards = [
      card('mine', { x: 0 }),
      card('cat', { code: '01099', x: 150 }),
      card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    interaction.setGroup(new Set(['mine', 'cat']));
    await click(placed('mine'));
    await fireEvent.click(menuItem(contextMenu()!, 'Add a token'));
    expect(screen.getByRole('menu', { name: 'Add a token' })).toBeTruthy();
    // The focus left on the page, as a press elsewhere than the menu would leave it.
    (document.activeElement as HTMLElement | null)?.blur();

    // A real key: dispatched on the focused element, bubbling up to the window.
    const escape = () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    escape();
    await tick();
    expect(screen.queryByRole('menu', { name: 'Add a token' })).toBeNull();
    expect(contextMenu()).not.toBeNull();

    escape();
    await tick();
    expect(contextMenu()).toBeNull();
    // The selection stays: only the next Escape, with no menu open, lets go of it.
    expect(interaction.group.size).toBe(2);
    escape();
    expect(interaction.group.size).toBe(0);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('has items tall enough for a finger on a touch screen', () => {
    const coarse = /@media \(pointer: coarse\) \{\s*\.table-menu button \{([^}]*)\}/.exec(
      menuSource,
    );
    expect(coarse?.[1]).toMatch(/height: 44px;/);
  });
});

describe('what the menu runs', () => {
  it('shows Flip on a card with two faces once the catalog is loaded', async () => {
    let loaded: () => void = () => {};
    vi.mocked(loadGameCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
    // Before the load, the catalog knows nothing.
    vi.mocked(knownCard).mockReturnValue(null);
    const cards = [card('two', { code: '01002', x: 0 }), card('v', { code: '01094', owner: -1 })];
    render(Table, { session: fakeSession(), view: makeView({ cards }) });

    await click(placed('two'));
    expect(labels(contextMenu()!)).not.toContain('Flip');

    vi.mocked(knownCard).mockImplementation(infoOf);
    loaded();
    await waitFor(() => expect(labels(contextMenu()!)).toContain('Flip'));
  });

  it('Draw X asks how many cards, then draws them', async () => {
    const { session } = await renderTable();
    await click(placed('deck:p0'));

    await fireEvent.click(menuItem(contextMenu()!, 'Draw X'));
    expect(contextMenu()).toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Draw cards' });
    expect(dialog.textContent).toContain('How many cards do you draw?');
    expect(session.act).not.toHaveBeenCalled();

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Draw' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'draw', n: 5 }, 0);
  });

  it('Top X asks how many cards, then looks at them', async () => {
    const { session } = await renderTable();
    await click(placed('deck:p0'));

    await fireEvent.click(menuItem(contextMenu()!, 'Top X'));
    const dialog = screen.getByRole('dialog', { name: 'Look at the top cards' });
    expect(dialog.textContent).toContain('How many cards from the top of your deck?');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'One more' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Look' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'look', pile: 'deck:p0', n: 6 }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the count question follows its pile while it is open, and closes once it is empty', async () => {
    const { session, rerender } = await renderTable();
    const withEncounter = (count: number) =>
      makeView({
        piles: makeView().table!.piles.map((p) => (p.id === 'enc' ? { ...p, count } : p)),
      });
    await click(placed('enc'));
    await fireEvent.click(menuItem(contextMenu()!, 'Top X'));
    const dialog = screen.getByRole('dialog', { name: 'Look at the top cards' });

    // Sam deals encounter cards meanwhile: three are left.
    await rerender({ view: withEncounter(3) });
    const value = within(dialog).getByRole('spinbutton', { name: 'Number of cards' });
    expect(value.getAttribute('aria-valuenow')).toBe('3');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Look' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'look', pile: 'enc', n: 3 }, 0);

    await click(placed('enc'));
    await fireEvent.click(menuItem(contextMenu()!, 'Discard X'));
    expect(screen.getByRole('dialog', { name: 'Discard from the top' })).toBeTruthy();
    await rerender({ view: withEncounter(0) });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("lists an own discard pile's Search, then Shuffle into deck", async () => {
    const piles = [
      ...makeView().table!.piles,
      pile('disc:p0', { kind: 'discard', owner: 0, x: 750, count: 1, cards: ['gone'] }),
    ];
    const view = makeView({ piles });
    view.table!.cards.push(card('gone', { zone: 'pile' }));
    const { session } = await renderTable(view);

    await click(placed('disc:p0'));
    expect(labels(contextMenu()!)).toEqual(['Search', 'Shuffle into deck']);
    expect(menuItem(contextMenu()!, 'Search').classList).toContain('default');
    await fireEvent.click(menuItem(contextMenu()!, 'Shuffle into deck'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'shuffleBack', pile: 'disc:p0' }, 0);
  });

  it("lists an own side deck's actions, which draw from it, on its pile and its faceup top card", async () => {
    const piles = [
      ...makeView().table!.piles,
      pile('side:p0:0', {
        kind: 'sideDeck',
        owner: 0,
        x: 750,
        count: 4,
        label: 'Invocation',
        topFaceUp: true,
        cards: ['top'],
      }),
    ];
    const view = makeView({ piles });
    view.table!.cards.push(card('top', { code: '01099', zone: 'pile', home: 'side:p0:0' }));
    const { session } = await renderTable(view);

    // Its top card shows face up on the pile, which opens the pile's menu.
    await click(within(placed('side:p0:0')).getByRole('img', { name: 'Black Cat' }));
    const menu = screen.getByRole('menu', { name: 'Your Invocation deck, 4 cards' });
    // Without a discard pile of its own, it has no Discard X.
    expect(labels(menu)).toEqual(['Draw 1', 'Draw X', 'Top X', 'Search', 'Shuffle']);
    await fireEvent.click(menuItem(menu, 'Draw 1'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'draw', n: 1, pile: 'side:p0:0' }, 0);
  });

  it('sends a side card back to its side deck, with no Discard without a side discard pile', async () => {
    const piles = [
      ...makeView().table!.piles,
      pile('side:p0:1', { kind: 'sideDeck', owner: 0, x: 750, count: 5, label: 'Sense' }),
    ];
    const cards = [...makeView().table!.cards, card('sense', { x: 150, home: 'side:p0:1' })];
    const { session } = await renderTable(makeView({ cards, piles }));

    await click(placed('sense'));
    expect(labels(contextMenu()!)).not.toContain('Discard');
    await fireEvent.click(menuItem(contextMenu()!, 'Move to'));
    const submenu = screen.getByRole('menu', { name: 'Move to' });
    expect(labels(submenu)).toEqual([
      'Hand',
      'Top of Sense deck',
      'Bottom of Sense deck',
      'Shuffle into Sense deck',
    ]);
    await fireEvent.click(menuItem(submenu, 'Bottom of Sense deck'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'toDeck', card: 'sense', where: 'bottom' }, 0);
  });

  it('greys out Reveal while a card is revealed on the encounter deck, saying why', async () => {
    const view = makeView();
    view.table!.cards.push(card('rev', { owner: -1, back: 'encounter', x: 900, onPile: 'enc' }));
    const { session } = await renderTable(view);

    await click(placed('enc'));
    expect(labels(contextMenu()!)).toEqual(['Reveal', 'Top X', 'Search', 'Discard X', 'Shuffle']);
    const reveal = menuItem(contextMenu()!, 'Reveal');
    expect(reveal.getAttribute('aria-disabled')).toBe('true');
    expect(reveal.dataset.tip).toBe('Spider-Man is already revealed on this deck: move it first');
    await fireEvent.click(reveal);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('the stage choice opens its box: nothing is sent yet', async () => {
    const { session } = await renderTable();
    await click(placed('v'));

    await fireEvent.click(menuItem(contextMenu()!, 'Change card…'));
    expect(screen.getByRole('dialog', { name: 'Villain: choose the card to show' })).toBeTruthy();
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('the arrow mode', () => {
  it('a click on another card sends the arrow, and opens no menu', async () => {
    const { session } = await renderTable();
    await click(placed('mine'));
    await fireEvent.click(menuItem(contextMenu()!, 'Draw an arrow'));

    await click(placed('v'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'arrowAdd', card: 'mine', target: 'v' }, 0);
    expect(interaction.arrowFrom).toBeNull();
    expect(contextMenu()).toBeNull();

    // The next click opens the menu as usual.
    await click(placed('v'));
    expect(contextMenu()).not.toBeNull();
  });

  it('on touch, the tap that picks the target opens no menu', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.keyDown(window, { key: 'a' });

    await click(placed('v'), 320, 100, { pointerType: 'touch' });
    expect(session.act).toHaveBeenCalledWith({ kind: 'arrowAdd', card: 'mine', target: 'v' }, 0);
    expect(contextMenu()).toBeNull();
  });

  it('Escape or a click on an empty spot cancels', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.keyDown(window, { key: 'a' });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(interaction.arrowFrom).toBeNull();
    expect(arrowHint()).toBeNull();

    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.keyDown(window, { key: 'a' });
    await click(placed('mine').parentElement as HTMLElement);
    expect(interaction.arrowFrom).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('shows its hint above the source card, wherever the pointer goes', async () => {
    await renderTable();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('tablewrap')) {
        return rect(0, 50, 1000, 700);
      }
      if (this.classList.contains('arrowhint')) {
        return rect(0, 0, 300, 34);
      }
      if (this.dataset.id === 'mine') {
        return rect(400, 400, 100, 140);
      }
      return rect(0, 0, 0, 0);
    });
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.keyDown(window, { key: 'a' });

    const hint = arrowHint()!;
    expect(hint.textContent).toBe(
      'Click the card to point at — Esc or a click on an empty spot to cancel.',
    );
    // Not a choice: every press goes through it to the table.
    expect(hint.getAttribute('role')).toBe('status');
    // Centred above "mine", 8 px away.
    expect(hint.style.left).toBe('300px');
    expect(hint.style.top).toBe('358px');

    // The pointer goes over the villain, then off every card: the hover goes, the hint stays.
    await fireEvent.pointerLeave(placed('mine'));
    await fireEvent.pointerEnter(placed('v'));
    await fireEvent.pointerLeave(placed('v'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(interaction.hovered).toBeNull();
    expect(arrowHint()?.style.left).toBe('300px');
  });

  it('speaks of taps and no Esc key in touch mode', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        Object.assign(new EventTarget(), {
          media: query,
          matches: query === TOUCH_MODE_QUERY,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
        }) as unknown as MediaQueryList,
    );
    await renderTable();
    await click(placed('mine'), 120, 80, { pointerType: 'touch' });
    await fireEvent.click(menuItem(contextMenu()!, 'Draw an arrow'));

    expect(arrowHint()?.textContent).toBe(
      'Tap the card to point at — tap an empty spot to cancel.',
    );
  });

  it('shows no hint while a Shift + drag draws the arrow', async () => {
    await renderTable();

    await fireEvent.pointerDown(placed('mine'), { button: 0, shiftKey: true });
    expect(interaction.arrowFrom).toBe('mine');
    expect(arrowHint()).toBeNull();
  });
});
