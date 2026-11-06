// The table in dock mode: on a small touch screen, a dock stands in for the hand's fan
// and the controls at the bottom right, the hero selector floating beside it; its buttons open the
// hand and the history in bottom sheets. The top bar always shows, in its own room above the table.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import tableSource from './Table.svelte?raw';
import { interaction } from './interaction.svelte';
import {
  DESKTOP,
  LANDSCAPE_PHONE,
  mockScreen,
  PHONE,
  type TestScreen,
} from '../lib/screen.testing';
import { TOP_BAR_HEIGHT } from '../lib/autoHide.svelte';
import { saveViewMode } from './rows';
import { saveZoom, storedZoom } from './zoom';
import { knownCard, loadGameCards } from '../lib/catalog';
import type { Area, CardView as TableCard, DeckView, LogView, PackFace, View } from '../lib/types';
import {
  card,
  domRect,
  fakeSession,
  infoFrom,
  pile,
  placed,
  playingView,
  seated,
} from './fixtures.testing';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01002': [{ name: 'Peter Parker' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
};

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

/** A mouse on a phone-sized window, and a touch screen as large as a tablet. */
const NARROW_MOUSE: TestScreen = { width: 390, height: 844 };
const TOUCH_TABLET: TestScreen = { width: 1024, height: 768, touch: true };

function line(text: string, at: string): LogView {
  return { who: 'Alex', color: 0, text, at };
}

const LOG: LogView[] = [
  line('drew a card', '2026-11-05T20:00:00Z'),
  line('played', '2026-11-05T20:01:00Z'),
];

/**
 * Rhino with Alex (p0, the viewer, Spider-Man), a card of Alex's on the table and two in hand.
 * With `twoDecks`, Alex also plays Ant-Man (p1), whose hand holds one card.
 */
function makeView({
  twoDecks = false,
  log = LOG,
}: { twoDecks?: boolean; log?: LogView[] } = {}): View {
  const cards: TableCard[] = [
    card('mine', { x: 300, y: 300 }),
    card('v', { code: '01094', owner: -1, back: 'villain' }),
    card('h1', { zone: 'hand' }),
    card('h2', { code: '01002', zone: 'hand' }),
    card('a1', { owner: 1, zone: 'hand' }),
  ];
  const decks: (Partial<DeckView> & { area: Area })[] = [
    { area: 'p0', heroName: 'Spider-Man', heroImage: 'spidey.png', handCount: 2 },
  ];
  if (twoDecks) {
    decks.push({ area: 'p1', heroName: 'Ant-Man', heroImage: 'ant.png', handCount: 1 });
  }
  return playingView({
    you: {
      role: 'player',
      name: 'Alex',
      color: 0,
      host: true,
      areas: twoDecks ? ['p0', 'p1'] : ['p0'],
    },
    players: [seated('Alex', 0, decks, true)],
    table: {
      cards,
      piles: [
        pile('deck:p0', { owner: 0, x: 600 }),
        pile('discard:p0', { kind: 'discard', owner: 0, x: 800 }),
      ],
      hands: twoDecks ? { p0: ['h1', 'h2'], p1: ['a1'] } : { p0: ['h1', 'h2'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
    },
    log,
  });
}

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await screen.findByRole('img', { name: 'Rhino' });
  return { session, ...result };
}

function dock(): HTMLElement | null {
  return screen.queryByRole('navigation', { name: 'Table controls' });
}

function handButton(): HTMLElement {
  return dock()!.querySelector<HTMLElement>('.handbtn')!;
}

function topBar(): HTMLElement {
  return document.querySelector<HTMLElement>('.top header')!;
}

beforeEach(() => {
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoFrom(FACES));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(loadGameCards).mockReset();
  vi.mocked(knownCard).mockReset();
  interaction.reset();
});

describe('dock mode', () => {
  it('shows the dock on a small touch screen (dock_mode_only_small_touch)', async () => {
    mockScreen(PHONE);
    await renderTable();

    expect(dock()).not.toBeNull();
    expect(document.querySelector('.app')!.classList).toContain('dock-mode');
  });

  it.each([
    ['a mouse on a narrow window', NARROW_MOUSE],
    ['a touch tablet', TOUCH_TABLET],
    ['a touch desktop', { ...DESKTOP, touch: true }],
    ['a desktop', DESKTOP],
  ])('keeps the hand fan and no dock on %s (dock_mode_only_small_touch)', async (_name, size) => {
    mockScreen(size);
    await renderTable();

    expect(dock()).toBeNull();
    expect(document.querySelector('.app')!.classList).not.toContain('dock-mode');
    expect(screen.getByRole('list', { name: 'Your hand' })).toBeTruthy();
    expect(document.querySelector('.corner')).not.toBeNull();
  });

  it.each([
    ['a touch tablet', TOUCH_TABLET, true],
    ['a touch desktop', { ...DESKTOP, touch: true }, true],
    ['a phone', PHONE, false],
    ['a mouse on a narrow window', NARROW_MOUSE, false],
    ['a desktop', DESKTOP, false],
  ])(
    'marks the table as a tablet on %s: touch mode outside dock mode',
    async (_name, size, tablet) => {
      mockScreen(size);
      await renderTable();

      expect(document.querySelector('.app')!.classList.contains('tablet')).toBe(tablet);
    },
  );

  it('draws no hand fan, no corner bar, no selector for one hero (no_fan_no_corner_in_dock)', async () => {
    mockScreen(PHONE);
    await renderTable();

    expect(document.querySelector('.hands .hand')).toBeNull();
    expect(document.querySelector('.corner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('has no hand button for a spectator, who has no hand (spectator_no_hand_button)', async () => {
    mockScreen(PHONE);
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    await renderTable(view);

    expect(dock()!.querySelector('.handbtn')).toBeNull();
    expect(within(dock()!).getByRole('button', { name: /^Undo/ })).toBeTruthy();
    expect(within(dock()!).getByRole('button', { name: /^History/ })).toBeTruthy();
  });

  it('shows the selected deck on the hand button: its size, its hero and up to four cards', async () => {
    mockScreen(PHONE);
    await renderTable();

    expect(handButton().getAttribute('aria-label')).toBe('Hand · 2, Spider-Man');
    expect(handButton().querySelectorAll('.mini')).toHaveLength(2);
  });

  it.each([
    ['upright', PHONE],
    ['on its side', LANDSCAPE_PHONE],
  ])('shows the top bar at all times, and no menu button, on a phone %s', async (_name, size) => {
    mockScreen(size);
    await renderTable();
    expect(topBar().classList).not.toContain('hidden');
    expect(within(dock()!).queryByRole('button', { name: 'Menu' })).toBeNull();

    // It does not hide by itself as the table scrolls down.
    const scroller = document.querySelector<HTMLElement>('.tablewrap')!;
    Object.defineProperties(scroller, {
      scrollHeight: { value: 3000, configurable: true },
      clientHeight: { value: 600, configurable: true },
      scrollTop: { value: 400, configurable: true, writable: true },
    });
    await fireEvent.scroll(scroller);
    scroller.scrollTop = 900;
    await fireEvent.scroll(scroller);
    expect(topBar().classList).not.toContain('hidden');
  });

  it('keeps the top bar shown with a mouse on a narrow window', async () => {
    mockScreen(NARROW_MOUSE);
    await renderTable();

    expect(topBar().classList).not.toContain('hidden');
  });

  it('runs Undo from the dock', async () => {
    mockScreen(PHONE);
    const view = makeView();
    view.canUndo = true;
    const { session } = await renderTable(view);

    await fireEvent.click(within(dock()!).getByRole('button', { name: /^Undo/ }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' }, 0);
  });

  it('is a rail down the left edge on a phone on its side (landscape_rail)', async () => {
    mockScreen(LANDSCAPE_PHONE);
    await renderTable();

    expect(dock()!.classList).toContain('rail');
    expect(document.querySelector('.app')!.classList).toContain('dock-rail');
  });

  it('is a bar at the bottom on a phone held upright', async () => {
    mockScreen(PHONE);
    await renderTable();

    expect(dock()!.classList).not.toContain('rail');
    expect(document.querySelector('.app')!.classList).not.toContain('dock-rail');
  });
});

describe('the hero selector in dock mode', () => {
  /**
   * The view with Sam (p1, Ant-Man) at the table too: Alex's card and piles in the first player's
   * row, Sam's deck and a card of his in the second.
   */
  function withSam(): View {
    const view = makeView();
    view.players.push(
      seated('Sam', 1, [{ area: 'p1', heroName: 'Ant-Man', heroImage: 'ant.png', handCount: 0 }]),
    );
    const table = view.table!;
    table.cards = table.cards.map((c) => (c.id === 'mine' ? { ...c, y: 470 } : c));
    table.piles = table.piles.map((p) => ({ ...p, y: 470 }));
    table.cards.push(card('sams', { owner: 1, x: 300, y: 690 }));
    table.piles.push(pile('deck:p1', { owner: 1, x: 600, y: 690 }));
    return view;
  }

  function seatpick(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.seatpick');
  }

  it.each([
    ['upright', PHONE],
    ['on its side', LANDSCAPE_PHONE],
  ])(
    'picks the player shown in "Villain + player", on a phone %s (dock_hero_selector)',
    async (_name, size) => {
      localStorage.setItem('itf-view', 'focus');
      mockScreen(size);
      await renderTable(withSam());

      const picker = screen.getByRole('radiogroup', { name: 'Player shown' });
      expect(seatpick()!.contains(picker)).toBe(true);
      expect(seatpick()!.querySelector('.picker')?.classList).toContain('compact');
      expect(dock()!.contains(picker)).toBe(false);
      expect(placed('mine')).toBeTruthy();

      await fireEvent.click(within(picker).getByRole('radio', { name: 'Sam · Ant-Man' }));

      expect(document.querySelector('.surface [data-id="mine"]')).toBeNull();
      expect(placed('sams')).toBeTruthy();
    },
  );

  it('switches between own decks in "All" without opening the hand (dock_hero_selector)', async () => {
    mockScreen(PHONE);
    await renderTable(makeView({ twoDecks: true }));

    const picker = screen.getByRole('radiogroup', { name: 'Hand shown' });
    expect(seatpick()!.contains(picker)).toBe(true);
    await fireEvent.click(within(picker).getByRole('radio', { name: /Ant-Man/ }));

    expect(handButton().getAttribute('aria-label')).toBe('Hand · 1, Ant-Man');
  });

  it('floats above the dock at the bottom left, or right of the rail at the top', () => {
    // jsdom lays nothing out: the rules themselves are checked.
    const bar = /\n {2}\.app\.dock-mode \.seatpick \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(bar).toMatch(
      /margin: 0 0 var\(--table-bottom\) calc\(8px \+ env\(safe-area-inset-left\)\);/,
    );
    const rail = /\n {2}\.app\.dock-rail \.seatpick \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(rail).toMatch(/align-self: start;/);
    expect(rail).toMatch(/margin: calc\(var\(--bar-room\) \+ 8px\) 0 0 8px;/);
  });
});

describe('a drop on the dock', () => {
  /**
   * The table fills the window; the cards and piles show where their styles put them, and the dock's
   * hand button where its styles put it on that screen, as `button` gives it.
   */
  function measure(size: TestScreen, button: DOMRect): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.closest('.handbtn')) {
        return button;
      }
      const style = (this as HTMLElement).style;
      const inSurface = this.closest('.surface') !== null && !this.classList.contains('surface');
      if (!inSurface) {
        return domRect(0, 0, size.width, size.height);
      }
      const left = Number.parseFloat(style.left) || 0;
      const top = Number.parseFloat(style.top) || 0;
      return domRect(
        left,
        top,
        Number.parseFloat(style.width) || 0,
        Number.parseFloat(style.height) || 0,
      );
    });
  }

  // The hand button of the bar at the bottom, 8 px off the window's edges, and of the rail.
  const BAR_BUTTON = domRect(8, PHONE.height - 68, 220, 60);
  const RAIL_BUTTON = domRect(8, 8, 48, 72);

  /** Drags the card with the mouse from its place (pressed at `from`) to that point. */
  async function dragTo(
    id: string,
    x: number,
    y: number,
    from = { x: 310, y: 310 },
  ): Promise<void> {
    await fireEvent.pointerDown(placed(id), {
      clientX: from.x,
      clientY: from.y,
      pointerType: 'mouse',
    });
    await fireEvent.pointerMove(window, { clientX: x, clientY: y - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons: 1 });
  }

  /** Opens the hand sheet and drags that card up out of its carousel to the point, as a finger does. */
  async function dragOutOfCarousel(id: string, x: number, y: number): Promise<void> {
    await fireEvent.click(handButton());
    const carouselCard = document.querySelector<HTMLElement>(
      `[data-carousel] .hcard[data-id="${id}"]`,
    )!;
    const finger = { pointerType: 'touch', pointerId: 7 };
    await fireEvent.pointerDown(carouselCard, { ...finger, button: 0, clientX: 200, clientY: 600 });
    await fireEvent.pointerMove(window, { ...finger, clientX: 200, clientY: 500, buttons: 1 });
    await fireEvent.pointerMove(window, { ...finger, clientX: x, clientY: y, buttons: 1 });
  }

  it('sends a table card to its hand, from the bar at the bottom (drop_on_dock_to_hand)', async () => {
    mockScreen(PHONE);
    measure(PHONE, BAR_BUTTON);
    const { session } = await renderTable();

    await dragTo('mine', 40, PHONE.height - 38);
    expect(handButton().classList).toContain('drop');
    expect(handButton().getAttribute('aria-label')).toBe('Drop here: back to hand');
    await fireEvent.pointerUp(window, { clientX: 40, clientY: PHONE.height - 38 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' }, 0);
  });

  it('sends a table card to its hand, from the rail', async () => {
    mockScreen(LANDSCAPE_PHONE);
    measure(LANDSCAPE_PHONE, RAIL_BUTTON);
    const { session } = await renderTable();

    await dragTo('mine', 32, 40);
    expect(handButton().classList).toContain('drop');
    await fireEvent.pointerUp(window, { clientX: 32, clientY: 40 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' }, 0);
  });

  it('plays a table card dropped on the table beside the hand button, rather than sending it to the hand', async () => {
    mockScreen(PHONE);
    measure(PHONE, BAR_BUTTON);
    const { session } = await renderTable();

    // Pressed in its middle, let go over the bottom middle of the table, right of the hand button:
    // past the last unit of its row (the deck's frame), not back in its own place.
    const box = placed('mine').style;
    const middle = {
      x: Number.parseFloat(box.left) + Number.parseFloat(box.width) / 2,
      y: Number.parseFloat(box.top) + Number.parseFloat(box.height) / 2,
    };
    await dragTo('mine', 300, PHONE.height - 100, middle);
    expect(handButton().classList).toContain('drop');
    await fireEvent.pointerUp(window, { clientX: 300, clientY: PHONE.height - 100 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'move', card: 'mine' }),
      0,
    );
  });

  it('is no drop target for a card that stays on the table', async () => {
    mockScreen(PHONE);
    measure(PHONE, BAR_BUTTON);
    await renderTable();

    await fireEvent.pointerDown(placed('v'), { clientX: 10, clientY: 10, pointerType: 'mouse' });
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 400, buttons: 1 });

    expect(interaction.dragging).not.toBeNull();
    expect(handButton().classList).not.toContain('drop');
  });

  it('takes a card dragged out of the carousel back to the hand, sending nothing (F-R3)', async () => {
    mockScreen(PHONE);
    measure(PHONE, BAR_BUTTON);
    const { session } = await renderTable();

    // h2 is the hand's last card: a reorder would bring it to the front.
    await dragOutOfCarousel('h2', 120, PHONE.height - 38);
    expect(handButton().classList).toContain('drop');
    await fireEvent.pointerUp(window, {
      pointerType: 'touch',
      pointerId: 7,
      clientX: 120,
      clientY: PHONE.height - 38,
    });

    expect(session.act).not.toHaveBeenCalled();
  });

  it('plays a card dragged out of the carousel onto the bottom of the table beside the rail (F-R3)', async () => {
    mockScreen(LANDSCAPE_PHONE);
    measure(LANDSCAPE_PHONE, RAIL_BUTTON);
    const { session } = await renderTable();

    const at = { x: LANDSCAPE_PHONE.width / 2, y: LANDSCAPE_PHONE.height - 40 };
    await dragOutOfCarousel('h2', at.x, at.y);
    await fireEvent.pointerUp(window, {
      pointerType: 'touch',
      pointerId: 7,
      clientX: at.x,
      clientY: at.y,
    });

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h2' }),
      0,
    );
  });
});

describe('the hand sheet', () => {
  function handSheet(): HTMLElement | null {
    return screen.queryByRole('dialog', { name: 'Your hand' });
  }

  it('opens from the hand button with the selected deck’s hand, Play and Discard sending their actions', async () => {
    mockScreen(PHONE);
    const { session } = await renderTable();

    await fireEvent.click(handButton());
    const sheet = handSheet()!;
    expect(sheet).not.toBeNull();
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(2);
    // One deck: its hero's avatar alone, no selector.
    expect(within(sheet).queryByRole('radiogroup')).toBeNull();
    expect(sheet.querySelector('.deck-avatar')).not.toBeNull();

    await fireEvent.click(within(sheet).getByRole('button', { name: 'Play' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h1' }),
      0,
    );

    session.act.mockClear();
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Discard' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'h1' }, 0);
  });

  it('offers Play and Discard alone, with no More… to an inspector repeating them', async () => {
    mockScreen(PHONE);
    await renderTable();
    await fireEvent.click(handButton());

    expect(within(handSheet()!).queryByRole('button', { name: 'More…' })).toBeNull();
    expect(within(handSheet()!).getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(within(handSheet()!).getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('switches deck with the hero selector in its header, with two own decks', async () => {
    mockScreen(PHONE);
    await renderTable(makeView({ twoDecks: true }));
    await fireEvent.click(handButton());

    const picker = within(handSheet()!).getByRole('radiogroup', { name: 'Hand shown' });
    await fireEvent.click(within(picker).getByRole('radio', { name: /Ant-Man/ }));

    expect(within(handSheet()!).getAllByRole('listitem')).toHaveLength(1);
    expect(handButton().getAttribute('aria-label')).toBe('Hand · 1, Ant-Man');
  });

  /**
   * The fixture with Alex's hand holding `hand` alone: the other cards of it played onto the
   * table, or with `discarded`, gone to the discard pile.
   */
  function withHand(hand: string[], { discarded = false }: { discarded?: boolean } = {}): View {
    const view = makeView();
    const table = view.table!;
    const leaving = (c: TableCard) => c.zone === 'hand' && c.owner === 0 && !hand.includes(c.id);
    const cards = discarded
      ? table.cards.filter((c) => !leaving(c))
      : table.cards.map((c) => (leaving(c) ? { ...c, zone: 'table' as const, x: 500, y: 300 } : c));
    return { ...view, table: { ...table, cards, hands: { ...table.hands, p0: hand } } };
  }

  it('closes once the last card played from it leaves the hand', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(withHand(['h1']));
    await fireEvent.click(handButton());

    await fireEvent.click(within(handSheet()!).getByRole('button', { name: 'Play' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h1' }),
      0,
    );
    // Until the view shows the hand empty, the card is still there.
    expect(handSheet()).not.toBeNull();

    await rerender({ session, view: withHand([]) });
    expect(handSheet()).toBeNull();
  });

  it('closes once the last card discarded from it leaves the hand', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(withHand(['h1']));
    await fireEvent.click(handButton());

    await fireEvent.click(within(handSheet()!).getByRole('button', { name: 'Discard' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'h1' }, 0);

    await rerender({ session, view: withHand([], { discarded: true }) });
    expect(handSheet()).toBeNull();
  });

  it('stays open on the cards left after a Play or a Discard', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(withHand(['h1', 'h2']));
    await fireEvent.click(handButton());

    await fireEvent.click(within(handSheet()!).getByRole('button', { name: 'Play' }));
    await rerender({ session, view: withHand(['h2']) });

    expect(within(handSheet()!).getAllByRole('listitem')).toHaveLength(1);
  });

  it('opens on an empty hand, and stays open on it', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(withHand([]));
    await fireEvent.click(handButton());

    expect(within(handSheet()!).getByText('No cards in hand')).toBeTruthy();
    await rerender({ session, view: withHand([], { discarded: true }) });
    expect(within(handSheet()!).getByText('No cards in hand')).toBeTruthy();
  });

  it('stays open when the hand empties by no Play nor Discard of the viewer', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(withHand(['h1']));
    await fireEvent.click(handButton());

    await rerender({ session, view: withHand([]) });
    expect(within(handSheet()!).getByText('No cards in hand')).toBeTruthy();
  });
});

describe('the history sheet', () => {
  function historyButton(): HTMLElement {
    return within(dock()!).getByRole('button', { name: /^History/ });
  }

  it('names the History button plainly as lines are written, with no unread count', async () => {
    mockScreen(PHONE);
    const { rerender } = await renderTable();
    expect(historyButton().getAttribute('aria-label')).toBe('History');

    const newer = [
      ...LOG,
      line('discarded', '2026-11-05T20:02:00Z'),
      line('drew', '2026-11-05T20:03:00Z'),
    ];
    await rerender({ view: makeView({ log: newer }) });
    expect(historyButton().getAttribute('aria-label')).toBe('History');
    expect(historyButton().querySelector('.badge')).toBeNull();

    await fireEvent.click(historyButton());
    const sheet = screen.getByRole('dialog', { name: 'History' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('the history panel on a large phone on its side', () => {
  /** A Pixel 7 on its side: wider than a narrow screen (900px), yet a phone. */
  const LARGE_LANDSCAPE: TestScreen = { width: 915, height: 412, touch: true };

  function historyPanel(): HTMLElement | null {
    return document.querySelector<HTMLElement>('#history-panel');
  }

  it('draws no history panel nor its strip in dock mode, at any width', async () => {
    localStorage.setItem('itf-history-collapsed', '1');
    mockScreen(LARGE_LANDSCAPE);
    await renderTable();

    expect(dock()).not.toBeNull();
    expect(historyPanel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand history' })).toBeNull();
    expect(document.querySelector('.app')!.classList).not.toContain('history-collapsed');
  });

  it("opens the history sheet from the dock's History button", async () => {
    mockScreen(LARGE_LANDSCAPE);
    await renderTable();

    await fireEvent.click(within(dock()!).getByRole('button', { name: /^History/ }));
    const sheet = screen.getByRole('dialog', { name: 'History' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(LOG.length);
  });

  it('keeps the history panel for a mouse on a window that size', async () => {
    mockScreen({ ...LARGE_LANDSCAPE, touch: false });
    await renderTable();

    expect(dock()).toBeNull();
    expect(historyPanel()).not.toBeNull();
  });

  it('gives the table the whole width, the bar icons 8px from the edge', () => {
    // jsdom applies no stylesheet: the rules themselves are checked. They follow the compact
    // rules, which keep the history column on a short screen wider than 900px.
    const compactAt = tableSource.indexOf('\n  .app.compact {');
    const dockRule = /\n {2}\.app\.dock-mode \{([^}]*)\}/.exec(tableSource);
    expect(dockRule?.[1]).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
    expect(dockRule?.[1]).toMatch(/grid-template-areas: 'table';/);
    expect(dockRule!.index).toBeGreaterThan(compactAt);

    const barRules = [...tableSource.matchAll(/\n {2}\.app\.dock-mode \.top \{([^}]*)\}/g)];
    const gutter = barRules.find((rule) => rule[1]?.includes('--bar-gutter-end'));
    expect(gutter?.[1]).toMatch(/--bar-gutter-end: 8px;/);
    expect(gutter!.index).toBeGreaterThan(compactAt);
  });

  it('keeps the table and its bar clear of the right safe area, the rail clear of the left one', () => {
    // jsdom has no env(): the rules themselves are checked. A phone on its side in dock mode is a
    // rail, which keeps clear of the left safe area; the right one pads the whole table.
    const dockRule = /\n {2}\.app\.dock-mode \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(dockRule).toMatch(/padding-right: env\(safe-area-inset-right\);/);
    const railRule = /\n {2}\.app\.dock-rail \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(railRule).toMatch(/padding-left: calc\(64px \+ env\(safe-area-inset-left\)\);/);

    // The table pads by the safe areas already: its bar adds none of its own, on any screen.
    const barRule = /\n {2}\.top \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(barRule).toMatch(/--bar-inset-left: 0px;/);
    expect(barRule).toMatch(/--bar-inset-right: 0px;/);
  });
});

describe('the top bar in dock mode', () => {
  function app(): HTMLElement {
    return document.querySelector<HTMLElement>('.app')!;
  }

  it.each([
    ['upright', PHONE],
    ['on its side', LANDSCAPE_PHONE],
  ])(
    'keeps its room at the top of the table, the top overlays under it, on a phone %s',
    async (_name, size) => {
      mockScreen(size);
      await renderTable();

      expect(app().style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
      expect(app().style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);
    },
  );

  it('sits below the notch, its room and the notch both kept at the top of the table', async () => {
    const NOTCH = 47;
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('safe-top') ? NOTCH : 0;
    });
    mockScreen(PHONE);
    await renderTable();
    ManualResizeObserver.resized(document.querySelector('.safe-top')!);
    await tick();

    expect(app().style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT + NOTCH}px`);
    expect(app().style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT + NOTCH}px`);
    // jsdom lays nothing out: the bar's own rule is checked.
    const bar = /\n {2}\.app\.dock-mode \.top \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(bar).toMatch(/padding-top: env\(safe-area-inset-top\);/);
  });

  it('keeps its room at the top with a mouse on a narrow window', async () => {
    mockScreen(NARROW_MOUSE);
    await renderTable();

    expect(app().style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
  });
});

describe('small cards and small piles in dock mode', () => {
  beforeEach(() => {
    vi.mocked(knownCard).mockImplementation(
      infoFrom({
        ...FACES,
        '01001': [{ name: 'Spider-Man', type: 'hero' }],
        '01094': [{ name: 'Rhino', type: 'villain', stage: 'I' }],
      }),
    );
  });

  /** The element's box, in table units, as its style places it. */
  function boxOf(el: HTMLElement): { x: number; y: number; w: number; h: number } {
    return {
      x: Number.parseFloat(el.style.left),
      y: Number.parseFloat(el.style.top),
      w: Number.parseFloat(el.style.width),
      h: Number.parseFloat(el.style.height),
    };
  }

  /** Every element on the table measures where its style puts it, the table filling the window. */
  function measure(size: TestScreen): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      // The dock's hand button lies off the screen: a drop on the table stays there.
      if (this.closest('.handbtn')) {
        return domRect(-100, -100, 0, 0);
      }
      const style = (this as HTMLElement).style;
      const inSurface = this.closest('.surface') !== null && !this.classList.contains('surface');
      if (!inSurface) {
        return domRect(0, 0, size.width, size.height);
      }
      return domRect(
        Number.parseFloat(style.left) || 0,
        Number.parseFloat(style.top) || 0,
        Number.parseFloat(style.width) || 0,
        Number.parseFloat(style.height) || 0,
      );
    });
  }

  function ghost(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.draglayer .card.ghost');
  }

  /** The table's zoom, as the app hands it to the surface and the drag layer. */
  function zoom(): number {
    return Number(document.querySelector<HTMLElement>('.app')!.style.getPropertyValue('--z'));
  }

  it('draws the cards in play whole at 60 %, where the projection puts them, and the piles small', async () => {
    mockScreen(PHONE);
    await renderTable();

    const mine = placed('mine', '.card');
    expect(mine.classList).toContain('scaled');
    const box = boxOf(mine);
    // The villain at 0, then mine one slot (a 67.2 card and a 24 gap) further, at the top of the
    // villain row's first line: 18 under its 12 units of name room, though it lies 300 lower.
    expect(box.x).toBeCloseTo(91.2, 6);
    expect(box.y).toBeCloseTo(12 + 18, 6);
    expect(box.w).toBeCloseTo(67.2, 6);
    expect(box.h).toBeCloseTo(94.2, 6);
    expect(placed('v', '.card').querySelector('img')?.getAttribute('alt')).toBe('Rhino');
    // No art tile: neither a tile nor the illustration cut out of a face.
    expect(document.querySelector('.surface .tile, .surface .card:not(.pile) .art')).toBeNull();
    expect(placed('deck:p0', '.pile').classList).toContain('scaled');
  });

  it('draws a card revealed on a small pile where the pile is drawn', async () => {
    mockScreen(PHONE);
    const view = makeView();
    view.table!.cards.push(card('top', { onPile: 'deck:p0', x: 600, y: 0, faceDown: true }));
    await renderTable(view);

    const pileBox = boxOf(placed('deck:p0', '.pile'));
    const top = boxOf(placed('top', '.card'));
    expect(top.x).toBeCloseTo(pileBox.x, 6);
    expect(top.y).toBeCloseTo(pileBox.y, 6);
    expect(top.w).toBeCloseTo(pileBox.w, 6);
    expect(top.h).toBeCloseTo(pileBox.h, 6);
  });

  it('drags a ghost at 60 %, held where it was pressed, and drops the card among the units', async () => {
    mockScreen(PHONE);
    measure(PHONE);
    const view = makeView();
    // Past the deck's frame (590..922), drawn one slot after it.
    view.table!.cards.push(card('far', { x: 1200, y: 0 }));
    // No first player token, which would flow between them.
    view.table!.firstPlayer = undefined;
    const { session } = await renderTable(view);
    const z = zoom();
    // Pressed in the middle of the card as drawn (124.8, 77.1), moved to 360, 177 drawn: on the
    // villain row's empty second line (its first ends at 12 + 124.2 + 16 = 152.2).
    const at = boxOf(placed('mine'));
    const pressed = { x: (at.x + 33.6) * z, y: (at.y + 47.1) * z };
    const to = { x: 360 * z, y: 177.1 * z };
    await fireEvent.pointerDown(placed('mine'), {
      clientX: pressed.x,
      clientY: pressed.y,
      pointerType: 'mouse',
    });
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, buttons: 1 });

    const drawn = boxOf(ghost()!);
    expect(drawn.w).toBeCloseTo(67.2, 6);
    expect(drawn.h).toBeCloseTo(94.2, 6);
    // Still held by its middle: the ghost moved with the pointer.
    expect(drawn.x).toBeCloseTo(360 - 33.6, 4);
    expect(drawn.y).toBeCloseTo(130, 4);

    await fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y });
    // After the row's last unit, far (1200..1312): 40 past it, up to the grid, at the row's card y.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'mine', x: 1360, y: 30 },
      0,
    );
  });

  it("holds a deck's top card by the middle of its 60 % ghost", async () => {
    mockScreen(PHONE);
    measure(PHONE);
    await renderTable();
    const z = zoom();
    const deck = boxOf(placed('deck:p0', '.pile'));
    const pressed = { x: (deck.x + deck.w / 2) * z, y: (deck.y + deck.h / 2) * z };
    await fireEvent.pointerDown(placed('deck:p0', '.pile'), {
      clientX: pressed.x,
      clientY: pressed.y,
      pointerType: 'mouse',
    });
    const to = { x: 150, y: 400 };
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, buttons: 1 });

    const drawn = boxOf(ghost()!);
    expect(drawn.w).toBeCloseTo(67.2, 6);
    expect(drawn.h).toBeCloseTo(94.2, 6);
    expect(drawn.x + drawn.w / 2).toBeCloseTo(to.x / z, 4);
    expect(drawn.y + drawn.h / 2).toBeCloseTo(to.y / z, 4);
  });

  it.each([
    ['a mouse on a narrow window', NARROW_MOUSE],
    ['a touch tablet', TOUCH_TABLET],
    ['a desktop', DESKTOP],
  ])('draws full cards, piles and ghosts on %s', async (_name, size) => {
    mockScreen(size);
    measure(size);
    await renderTable();

    const mine = placed('mine', '.card');
    expect(mine.classList).not.toContain('scaled');
    expect(mine.style.left).toBe('300px');
    expect(mine.style.width).toBe('112px');
    expect(mine.style.height).toBe('157px');
    expect(placed('deck:p0', '.pile').classList).not.toContain('scaled');

    const z = zoom();
    const pressed = { x: 310 * z, y: (Number.parseFloat(mine.style.top) + 10) * z };
    await fireEvent.pointerDown(mine, {
      clientX: pressed.x,
      clientY: pressed.y,
      pointerType: 'mouse',
    });
    await fireEvent.pointerMove(window, {
      clientX: pressed.x + 40,
      clientY: pressed.y,
      buttons: 1,
    });
    await fireEvent.pointerMove(window, {
      clientX: pressed.x + 80,
      clientY: pressed.y,
      buttons: 1,
    });
    expect(ghost()!.style.width).toBe('112px');
    expect(ghost()!.style.height).toBe('157px');
  });
});

describe('the compact, wrapped table in dock mode', () => {
  // The scroller's size, in px: a phone held upright, as wide as its window.
  let visible = { w: 390, h: 844 };

  beforeEach(() => {
    visible = { w: 390, h: 844 };
    const scrollerSize = (el: Element, size: number) =>
      el.classList.contains('tablewrap') ? size : 0;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return scrollerSize(this, visible.w);
    });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return scrollerSize(this, visible.w);
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return scrollerSize(this, visible.h);
    });
  });

  // Rhino at 300 in the villain's row, its encounter deck and discard at 0 and 130; Alex's row (p0)
  // with the deck and discard, Spider-Man at 300 and seven cards in play from 460, 160 apart.
  const PLAYED = Array.from({ length: 7 }, (_, i) => `c${i + 1}`);

  function busyView(extra: TableCard[] = []): View {
    const view = makeView();
    view.table!.cards = [
      card('v', { code: '01094', owner: -1, back: 'villain', x: 300, y: 30 }),
      card('id', { x: 300, y: 470 }),
      ...PLAYED.map((id, i) => card(id, { x: 460 + 160 * i, y: 470 })),
      ...extra,
      ...view.table!.cards.filter((c) => c.zone === 'hand'),
    ];
    view.table!.piles = [
      pile('encounter', { kind: 'encounter', owner: -1, x: 0, y: 30 }),
      pile('encounterDiscard', { kind: 'encounterDiscard', owner: -1, x: 130, y: 30 }),
      pile('deck:p0', { owner: 0, x: 0, y: 470 }),
      pile('discard:p0', { kind: 'discard', owner: 0, x: 130, y: 470 }),
    ];
    // One hero: no first player token.
    view.table!.firstPlayer = undefined;
    return view;
  }

  function shownZoom(): number {
    return Number(document.querySelector<HTMLElement>('.app')!.style.getPropertyValue('--z'));
  }

  /** The box an element is drawn at, in drawn units of the surface. */
  function drawnBox(el: HTMLElement): { x: number; y: number; w: number; h: number } {
    return {
      x: Number.parseFloat(el.style.left),
      y: Number.parseFloat(el.style.top),
      w: Number.parseFloat(el.style.width),
      h: Number.parseFloat(el.style.height),
    };
  }

  function expectAt(id: string, x: number, y: number): void {
    const box = drawnBox(placed(id, '.card'));
    expect(box.x).toBeCloseTo(x, 4);
    expect(box.y).toBeCloseTo(y, 4);
  }

  // Both rows lay their cards on the columns of one grid, from the frames' left (−6), a slot of a
  // 67.2 card and a 24 gap apart: −6, 85.2, 176.4, 267.6, 358.8, 450. The fit: both rows' indent
  // (the first column past the frames, 176.4) and three slots, 450, in 390 − 2 × 24 − 12 = 330 px:
  // 73 %. The rows wrap at (390 − 48) / 0.73 = 468.5: the identity, c1 and c2 fit the first line
  // (176.4, 267.6, 358.8); c3 to c7 the second, from the first column (−6 to 358.8), each under
  // the card of its column; the empty slot the third, on the first column too. The villain's row
  // is 12 + 118.2 (its frame, from 20 to 197) + 16, then an empty second line (94.2 + 16), + 20 =
  // 276.4 high; Alex's row starts there, its first line 12 lower, at 288.4, its cards 18 under it
  // (306.4); the second line at 288.4 + 118.2 + 16 = 422.6, the third at 422.6 + 94.2 + 16 =
  // 532.8, their cards at their top.

  it('fits the widest indent and three cards in the width by default, never above 100 %', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());

    expect(shownZoom()).toBe(0.73);
    expect(storedZoom()).toBeNull();
  });

  it('wraps a long row on the columns: a card past the width goes on a new line, under the frame', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());

    // The identity and the two first cards on the first line, a slot apart.
    expectAt('id', 176.4, 306.4);
    expectAt('c2', 358.8, 306.4);
    // c3 to c7 on the second line, from the frame's left edge; c5 under the identity, c7 under c2.
    expectAt('c3', -6, 422.6);
    expectAt('c4', 85.2, 422.6);
    expectAt('c5', 176.4, 422.6);
    expectAt('c7', 358.8, 422.6);
    // The villain's row holds one line: its piles and Rhino at 0.6, Rhino over the identity.
    expectAt('v', 176.4, 30);
    for (const id of ['id', ...PLAYED]) {
      const box = drawnBox(placed(id, '.card'));
      expect(box.x + box.w).toBeLessThanOrEqual(468.5);
    }
  });

  it('draws the frame and the piles of a row where the projection puts them', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());

    const frame = drawnBox(document.querySelector<HTMLElement>('.ownerbox[data-owner="0"]')!);
    // The frame from −10, 400 (262 × 177): drawn at −6, 276.4 + 12 + 12.
    expect(frame.x).toBeCloseTo(-6, 4);
    expect(frame.y).toBeCloseTo(300.4, 4);
    expect(frame.w).toBeCloseTo(157.2, 4);
    const discard = drawnBox(placed('discard:p0', '.pile'));
    expect(discard.x).toBeCloseTo(78, 4);
    expect(discard.y).toBeCloseTo(306.4, 4);
  });

  it("shows each owner line's avatar in place of its name, the full name kept to read", async () => {
    mockScreen(PHONE);
    const view = busyView();
    view.table!.stages = [
      { key: 'villain', label: 'Villain', current: 'v', cards: ['v'], villain: true },
    ];
    await renderTable(view);

    const villain = document.querySelector<HTMLElement>('.ownerbox[data-owner="-1"]')!;
    const hero = document.querySelector<HTMLElement>('.ownerbox[data-owner="0"]')!;
    // The current villain's art in the villain's ring, the hero's in the seat colour.
    const villainAvatar = within(villain).getByRole('img', { name: 'Villain' });
    expect(villainAvatar.dataset.tip).toBe('Villain');
    expect(villainAvatar.querySelector('img')?.getAttribute('src')).toBe('01094.png');
    const heroAvatar = within(hero).getByRole('img', { name: 'Alex · Spider-Man' });
    expect(heroAvatar.dataset.tip).toBe('Alex · Spider-Man');
    expect(heroAvatar.querySelector('img')?.getAttribute('src')).toBe('spidey.png');
    expect(hero.querySelector('.owner')).toBeNull();
    // The hand count stays the frame's tooltip, and is read.
    expect(hero.dataset.tip).toBe('2 cards in hand');
    expect(hero.textContent).toContain('2 cards in hand');
  });

  it("starts each owner line's chips right after its avatar, at one x down the rows", async () => {
    mockScreen(PHONE);
    const view = busyView();
    view.table!.piles.push(
      pile('vic', { kind: 'victory', owner: -1, count: 1, cards: [] }),
      pile('aside:p0', { kind: 'aside', owner: 0, count: 0, cards: [] }),
    );
    await renderTable(view);

    // Both frames start on the rows' left edge, −6: their lines, and the chips past the avatars.
    const lines = [...document.querySelectorAll<HTMLElement>('.surface .chips')];
    expect(lines.map((line) => line.dataset.owner)).toEqual(['-1', '0']);
    for (const line of lines) {
      expect(Number.parseFloat(line.style.left)).toBeCloseTo(-6, 4);
      expect(line.classList).toContain('after-avatar');
    }
  });

  it("starts the villain's cards past its owner line when the line is wider than its frame", async () => {
    mockScreen(PHONE);
    const view = busyView();
    view.table!.piles.push(
      pile('vic', { kind: 'victory', owner: -1, count: 1, cards: [] }),
      pile('saside', { kind: 'aside', owner: -1, count: 0, cards: [] }),
    );
    await renderTable(view);

    // At 73 %, --lu is 11 / 12 / 0.73 = 1.2557 and the ring 2.7397: the avatar ends 6 + 27.626 +
    // 5.479 = 39.105 past the frame's left edge, the two chips 7.534 + 2 × 57.763 + 5.023 further:
    // the line 167.19 wide, to 161.19, past the frame's 157.2. Rhino goes on the first half column
    // past 161.19 + 24 = 185.19: 222, rather than 176.4; Alex's row keeps its indent.
    expect(shownZoom()).toBe(0.73);
    expectAt('v', 222, 30);
    expectAt('id', 176.4, 306.4);
    const villain = drawnBox(document.querySelector<HTMLElement>('.ownerbox[data-owner="-1"]')!);
    expect(villain.x).toBeCloseTo(-6, 4);
    expect(villain.w).toBeCloseTo(157.2, 4);
  });

  it('keeps the names as text on a touch tablet', async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable(busyView());

    const names = [...document.querySelectorAll('.ownerbox .owner')].map((el) => el.textContent);
    expect(names).toEqual(['Villain', 'Alex · Spider-Man']);
    expect(document.querySelector('.ownerbox .avatar')).toBeNull();
  });

  it('keeps a stack together on its main card’s line', async () => {
    mockScreen(PHONE);
    // Tucked under c2, 100 right and 20 down: the stack, 212 wide (127.2 drawn), would end past
    // 468.5 on the first line. Both start the second at its left edge, the upgrade 60 right of c2 and
    // 12 down.
    await renderTable(busyView([card('up', { x: 720, y: 490, parent: 'c2' })]));

    expectAt('c2', -6, 422.6);
    expectAt('up', 54, 434.6);
  });

  it('makes the surface as high as the drawn rows, and as wide as what shows', async () => {
    mockScreen(PHONE);
    visible = { w: 390, h: 400 };
    await renderTable(busyView());

    const surface = document.querySelector<HTMLElement>('.tablewrap .surface')!;
    // 276.4 + 12 + 134.2 + 2 × 110.2 + 20 = 663, as high as the rows' content, rounded up.
    expect(surface.style.height).toBe('663px');
    expect(surface.style.width).toBe('468px');
  });

  it('shows the villain row and the chosen player row right under it in "Villain + player"', async () => {
    mockScreen(PHONE);
    saveViewMode('focus');
    const view = busyView([card('theirs', { owner: 1, x: 300, y: 690 })]);
    const twoDecks = makeView({ twoDecks: true });
    view.players = twoDecks.players;
    view.you = twoDecks.you;
    view.table!.hands = twoDecks.table!.hands;
    view.table!.piles.push(pile('deck:p1', { owner: 1, x: 0, y: 690 }));
    await renderTable(view);

    expect(document.querySelector('.surface .card[data-id="theirs"]')).toBeNull();
    expectAt('id', 176.4, 306.4);
  });

  /**
   * jsdom lays nothing out: every element of the surface measures where its style puts it, at the
   * zoom, the surface from the window's corner, the dock's hand button off the screen.
   */
  function measureDrawn(): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const z = shownZoom();
      if (this.closest('.handbtn')) {
        return domRect(-100, -100, 0, 0);
      }
      const inSurface = this.closest('.surface') !== null && !this.classList.contains('surface');
      if (!inSurface) {
        return domRect(0, 0, PHONE.width, PHONE.height);
      }
      const box = drawnBox(this as HTMLElement);
      return domRect(box.x * z, box.y * z, box.w * z, box.h * z);
    });
  }

  /** Drags a card by its middle and lets it go with its middle at that drawn point. */
  async function dragMiddleTo(id: string, x: number, y: number): Promise<void> {
    const z = shownZoom();
    const from = drawnBox(placed(id, '.card'));
    const pressed = { x: (from.x + from.w / 2) * z, y: (from.y + from.h / 2) * z };
    const to = { x: x * z, y: y * z };
    await fireEvent.pointerDown(placed(id), {
      clientX: pressed.x,
      clientY: pressed.y,
      pointerType: 'mouse',
    });
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y });
  }

  it('moves a card dropped between two cards of a wrapped line between them on the table', async () => {
    mockScreen(PHONE);
    const { session } = await renderTable(busyView());
    measureDrawn();

    // In the gap between c4 (85.2..152.4) and c5 on the second line: before c5, whose slot's
    // middle (210) lies right of it. c4 runs 940..1052 on the table, c5 1100..1212: c1 goes to
    // (1052 + 1100) / 2 − 56 = 1020, at c4's y.
    await dragMiddleTo('c1', 160, 470);

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'c1', x: 1020, y: 470 },
      0,
    );
  });

  it("moves a card dropped in a row's empty slot right after its last card", async () => {
    mockScreen(PHONE);
    const { session } = await renderTable(busyView());
    measureDrawn();

    // The slot follows c7 on the third line, from the left edge (−6): c1 goes 40 past c7's right
    // edge (1532), up to the grid, at the row's card y.
    await dragMiddleTo('c1', 30, 580);

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'c1', x: 1580, y: 470 },
      0,
    );
  });

  it('moves a card dropped left of the identity before it, and one dropped back in its place nowhere', async () => {
    mockScreen(PHONE);
    const { session } = await renderTable(busyView());
    measureDrawn();

    // Left of the first line's identity, under the frame: between the frame's right edge (252)
    // and the identity (300), 276 − 56 = 220.
    await dragMiddleTo('c2', 165, 410);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'move', card: 'c2', x: 220, y: 470 }, 0);

    // c3 let go under the frame, left of c4's middle on the second line: between c2 and c4, where
    // it lies already, nothing sent.
    vi.mocked(session.act).mockClear();
    await dragMiddleTo('c3', 30, 470);
    expect(session.act).not.toHaveBeenCalled();
  });

  it("plays a card into another row the same way: past the villain's last card", async () => {
    mockScreen(PHONE);
    const { session } = await renderTable(busyView());
    measureDrawn();

    // In the villain row, right of Rhino (300..412 on the table), or anywhere on its empty second
    // line (from 146.2 to 256.4).
    await dragMiddleTo('c1', 300, 80);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'move', card: 'c1', x: 460, y: 30 }, 0);
    vi.mocked(session.act).mockClear();
    await dragMiddleTo('c2', 60, 200);

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'c2', x: 460, y: 30 },
      0,
    );
  });

  /** Presses a card by its middle and drags its middle to that drawn point, still holding it. */
  async function holdMiddleAt(id: string, x: number, y: number): Promise<void> {
    const z = shownZoom();
    const from = drawnBox(placed(id, '.card'));
    await fireEvent.pointerDown(placed(id), {
      clientX: (from.x + from.w / 2) * z,
      clientY: (from.y + from.h / 2) * z,
      pointerType: 'mouse',
    });
    await fireEvent.pointerMove(window, { clientX: x * z, clientY: y * z - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: x * z, clientY: y * z, buttons: 1 });
  }

  /** Waits for the next frame, where the drag feeds the table its preview, then for the redraw. */
  async function nextFrame(): Promise<void> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await tick();
  }

  /** How far from its place a card is drawn pushed aside, in drawn units; null when it is not. */
  function shiftOf(id: string): { x: number; y: number } | null {
    const translate = placed(id, '.card').style.translate;
    if (translate === '') {
      return null;
    }
    const [x = Number.NaN, y = Number.NaN] = translate.split(' ').map(Number.parseFloat);
    return { x, y };
  }

  function expectShift(id: string, x: number, y: number): void {
    const shift = shiftOf(id);
    expect(shift).not.toBeNull();
    expect(shift!.x).toBeCloseTo(x, 4);
    expect(shift!.y).toBeCloseTo(y, 4);
  }

  // c7 dragged, its middle at 345, 350: on the first line, in the gap between c1 (267.6..334.8) and
  // c2 (358.8), left of c2's middle (392.4), so between
  // c1 (460..572) and c2 (620): (572 + 620) / 2 − 56 = 540. Laid out with c7 there, c7 takes c2's
  // column (358.8); c2 would end at 450 + 67.2 = 517.2, past 468.5: it starts the second line
  // (−6, 422.6), c3 to c6 each a column right (91.2), and the slot c7 leaves closes up.
  it('pushes the cards after the slot under a dragged card aside, and lets them back on a cancel', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());
    measureDrawn();

    await holdMiddleAt('c7', 345, 350);
    await nextFrame();

    expect(shiftOf('id')).toBeNull();
    expect(shiftOf('c1')).toBeNull();
    expectShift('c2', -364.8, 116.2);
    for (const id of ['c3', 'c4', 'c5', 'c6']) {
      expectShift(id, 91.2, 0);
    }
    // The dragged card, hidden in its place, is drawn in the slot it would land in.
    expectShift('c7', 0, -116.2);
    // They glide there.
    const surface = document.querySelector<HTMLElement>('.tablewrap .surface')!;
    expect(surface.style.getPropertyValue('--shift-glide')).toBe('180ms');

    await fireEvent.pointerCancel(window, {});
    await tick();

    for (const id of ['id', ...PLAYED]) {
      expect(shiftOf(id)).toBeNull();
    }
  });

  it('lands a card in the slot it opened, the others kept aside until the server answers', async () => {
    mockScreen(PHONE);
    const { session } = await renderTable(busyView());
    measureDrawn();

    await holdMiddleAt('c7', 345, 350);
    await nextFrame();
    await fireEvent.pointerUp(window, { clientX: 345 * shownZoom(), clientY: 350 * shownZoom() });
    await tick();

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'c7', x: 540, y: 470 },
      0,
    );
    expectShift('c2', -364.8, 116.2);
    // Its ghost set down in the slot: c2's column on the first line.
    const ghost = document.querySelector<HTMLElement>('.draglayer .card.landed')!;
    expect(Number.parseFloat(ghost.style.left)).toBeCloseTo(358.8, 4);
    expect(Number.parseFloat(ghost.style.top)).toBeCloseTo(306.4, 4);
  });

  it('pushes nothing aside for a card dropped back where it lies, nor over another row', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());
    measureDrawn();

    // c3 under the frame, left of c4's middle on the second line: where it lies already.
    await holdMiddleAt('c3', 30, 470);
    await nextFrame();

    for (const id of ['id', ...PLAYED]) {
      expect(shiftOf(id)).toBeNull();
    }
  });

  it('pushes nothing aside on a touch tablet, which places cards freely', async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable(busyView());

    await fireEvent.pointerDown(placed('c7'), { clientX: 10, clientY: 10, pointerType: 'mouse' });
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 300, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: 320, clientY: 300, buttons: 1 });
    await nextFrame();

    for (const id of ['id', ...PLAYED]) {
      expect(shiftOf(id)).toBeNull();
    }
  });

  it('draws the dots of the 40-unit grid it drops on, at its scale', async () => {
    mockScreen(PHONE);
    await renderTable(busyView());

    const surface = document.querySelector<HTMLElement>('.tablewrap .surface')!;
    expect(surface.style.backgroundSize).toBe('24px 24px');
  });

  it("draws the dots of a touch tablet's 20-unit grid, a card's corner on it between four dots", async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable(busyView());

    const surface = document.querySelector<HTMLElement>('.tablewrap .surface')!;
    expect(surface.style.backgroundSize).toBe('20px 20px');
    // Its lines lie 10 past every 20 down: the cells, a dot in the middle of each, start there.
    expect(surface.style.backgroundPosition).toBe('0px 10px');
  });

  it('keeps the 10-unit dots with a mouse on the same screen', async () => {
    mockScreen({ ...TOUCH_TABLET, touch: false });
    await renderTable(busyView());

    const surface = document.querySelector<HTMLElement>('.tablewrap .surface')!;
    expect(surface.style.backgroundSize).toBe('10px 10px');
    expect(surface.style.backgroundPosition).toBe('0px 0px');
  });
});

describe('the zoom in dock mode', () => {
  // The play area's size, in px, as its scroller measures it.
  let visible = { w: 844, h: 390 };

  beforeEach(() => {
    visible = { w: 844, h: 390 };
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('tablewrap') ? visible.w : 0;
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('tablewrap') ? visible.h : 0;
    });
  });

  function shownZoom(): string {
    return document.querySelector<HTMLElement>('.app')!.style.getPropertyValue('--z');
  }

  function scroller(): HTMLElement {
    return document.querySelector<HTMLElement>('.tablewrap')!;
  }

  /** Fingers touching `target` at those points. */
  function touch(target: EventTarget, type: string, points: { x: number; y: number }[]): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : touches });
    Object.defineProperty(event, 'changedTouches', { value: touches });
    target.dispatchEvent(event);
  }

  /** Two fingers spread apart on the table: a pinch out. */
  function pinchOut(): void {
    touch(scroller(), 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller(), 'touchmove', [
      { x: 75, y: 100 },
      { x: 225, y: 100 },
    ]);
  }

  async function doubleTap(): Promise<void> {
    const surface = document.querySelector('.tablewrap .surface')!;
    for (let i = 0; i < 2; i++) {
      touch(surface, 'touchstart', [{ x: 100, y: 100 }]);
      touch(surface, 'touchend', [{ x: 100, y: 100 }]);
    }
    await tick();
  }

  // The test view's indent: Rhino at 0 in the villain's row, so 0 + 3 × 91.2 = 273.6 units.

  it('fits three cards past the widest indent, following the window live', async () => {
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 300, h: 390 };
    await renderTable();
    // 300 − 48 − 12 = 240 px over 273.6.
    expect(shownZoom()).toBe('0.87');

    visible = { w: 200, h: 390 };
    ManualResizeObserver.resized(scroller());
    await tick();
    expect(shownZoom()).toBe('0.51');
  });

  it('never fits below the phone minimum, 30 %, nor above 100 %', async () => {
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 100, h: 390 };
    await renderTable();
    expect(shownZoom()).toBe('0.3');

    visible = { w: 5000, h: 390 };
    ManualResizeObserver.resized(scroller());
    await tick();
    expect(shownZoom()).toBe('1');
  });

  it('ignores a zoom another screen saved, and keeps it', async () => {
    saveZoom(1.5);
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 300, h: 390 };
    await renderTable();

    expect(shownZoom()).toBe('0.87');
    expect(storedZoom()).toBe(1.5);
  });

  it('does not zoom on a pinch, nor remember a zoom', async () => {
    mockScreen(PHONE);
    visible = { w: 300, h: 844 };
    await renderTable();

    pinchOut();
    await tick();

    expect(shownZoom()).toBe('0.87');
    expect(storedZoom()).toBeNull();
  });

  it('pans the table with two fingers', async () => {
    mockScreen(PHONE);
    await renderTable();
    scroller().scrollLeft = 50;
    scroller().scrollTop = 50;

    touch(scroller(), 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller(), 'touchmove', [
      { x: 90, y: 80 },
      { x: 190, y: 80 },
    ]);

    expect(scroller().scrollLeft).toBe(60);
    expect(scroller().scrollTop).toBe(70);
  });

  it('does not zoom on a double tap', async () => {
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 300, h: 390 };
    await renderTable();

    await doubleTap();

    expect(shownZoom()).toBe('0.87');
    expect(storedZoom()).toBeNull();
  });

  it('zooms on a pinch on a touch tablet', async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable();

    pinchOut();
    await tick();

    expect(storedZoom()).toBe(1.5);
    expect(shownZoom()).toBe('1.5');
  });

  it.each([
    ['a mouse on a phone on its side', { ...LANDSCAPE_PHONE, touch: false }],
    ['a touch tablet', TOUCH_TABLET],
    ['a desktop', DESKTOP],
  ])('keeps 100 %% on %s', async (_name, size) => {
    mockScreen(size);
    await renderTable();

    expect(shownZoom()).toBe('1');
  });
});

describe('a card leaving a chip in dock mode', () => {
  let original: typeof Element.prototype.animate;
  let started: { element: Element; keyframes: Keyframe[] }[] = [];

  beforeEach(() => {
    original = Element.prototype.animate;
    started = [];
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[]) {
      started.push({ element: this, keyframes });
      return {
        cancel: () => {},
        finish: () => {},
        finished: new Promise<void>(() => {}),
        effect: { setKeyframes: () => {} },
      } as unknown as Animation;
    } as typeof Element.prototype.animate;
    // jsdom lays nothing out: every element measures where its style puts it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return domRect(
        Number.parseFloat(this.style.left) || 0,
        Number.parseFloat(this.style.top) || 0,
        Number.parseFloat(this.style.width) || 0,
        Number.parseFloat(this.style.height) || 0,
      );
    });
  });

  afterEach(() => {
    Element.prototype.animate = original;
  });

  function withAside(aside: string[], cards: TableCard[]): View {
    const view = makeView();
    view.table!.cards.push(...cards);
    view.table!.piles.push(
      pile('aside:p0', { kind: 'aside', owner: 0, count: aside.length, cards: aside }),
    );
    return view;
  }

  it('slides onto the table from the chip at the size the table draws it', async () => {
    mockScreen(PHONE);
    const { session, rerender } = await renderTable(
      withAside(['s'], [card('s', { zone: 'pile' })]),
    );
    const chip = document.querySelector<HTMLElement>('.surface .chip[data-pile="aside:p0"]')!;
    Object.assign(chip.style, { left: '200px', top: '100px', width: '40px', height: '20px' });

    await rerender({ session, view: withAside([], [card('s', { x: 400, y: 300 })]) });
    await tick();
    await tick();

    const slide = started.find(({ element }) => element.matches('.surface .card[data-id="s"]'));
    // From the chip's middle to the card's, at the card's own drawn size: unscaled.
    expect(slide?.keyframes[0]).toMatchObject({ scale: '1' });
  });
});

describe('a riffle in dock mode', () => {
  let original: typeof Element.prototype.animate;
  let started: Element[] = [];

  beforeEach(() => {
    original = Element.prototype.animate;
    started = [];
    Element.prototype.animate = function (this: Element) {
      started.push(this);
      return {
        cancel: () => {},
        finish: () => {},
        finished: new Promise<void>(() => {}),
        effect: { setKeyframes: () => {} },
      } as unknown as Animation;
    } as typeof Element.prototype.animate;
  });

  afterEach(() => {
    Element.prototype.animate = original;
  });

  /** The copies of the deck's back that riffle into it, after the viewer shuffled it. */
  async function riffleCopies(): Promise<HTMLElement[]> {
    const view = makeView();
    const { session, rerender } = await renderTable(view);
    const shuffled = line('shuffled their deck', '2026-11-05T20:02:00Z');
    await rerender({ session, view: { ...view, log: [...view.log, shuffled] } });
    await tick();
    const deck = placed('deck:p0', '.pile');
    return started.filter((element): element is HTMLElement => element.parentElement === deck);
  }

  it("draws its copies at the pile's drawn size: their art zoomed as the pile's own (F-R3)", async () => {
    mockScreen(PHONE);
    const copies = await riffleCopies();

    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy.querySelector<HTMLElement>('.art')!.style.zoom).toBe('var(--scale)');
    }
  });

  it('draws its copies unzoomed on a tablet', async () => {
    mockScreen(TOUCH_TABLET);
    const copies = await riffleCopies();

    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy.querySelector<HTMLElement>('.art')!.style.zoom).toBe('');
    }
  });
});
