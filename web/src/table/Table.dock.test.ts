// The table in dock mode (spec 3.4): on a small touch screen, a dock stands in for the hand's fan
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
import { storedZoom } from './zoom';
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

  it('draws neither the hand fan nor the corner bar, nor a selector for a single hero (no_fan_no_corner_in_dock)', async () => {
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
  ])(
    'shows the top bar at all times, and no menu button, on a phone %s (F-U1)',
    async (_name, size) => {
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
    },
  );

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
    table.cards = table.cards.map((c) => (c.id === 'mine' ? { ...c, y: 410 } : c));
    table.piles = table.piles.map((p) => ({ ...p, y: 410 }));
    table.cards.push(card('sams', { owner: 1, x: 300, y: 630 }));
    table.piles.push(pile('deck:p1', { owner: 1, x: 600, y: 630 }));
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
   * drop zone where its styles put it on that screen, as `zone` gives it.
   */
  function measure(size: TestScreen, zone: DOMRect): void {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.closest('.dockdrop')) {
        return zone;
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

  /** Drags the card with the mouse from its place to that point, and lets go there. */
  async function dragTo(id: string, x: number, y: number): Promise<void> {
    await fireEvent.pointerDown(placed(id), { clientX: 310, clientY: 310, pointerType: 'mouse' });
    await fireEvent.pointerMove(window, { clientX: x, clientY: y - 40, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons: 1 });
  }

  it('sends a table card to its hand, from the bar at the bottom (drop_on_dock_to_hand)', async () => {
    mockScreen(PHONE);
    // The stand-in card under the dock's whole bar, 8 px off the window's edges.
    measure(PHONE, domRect(8, PHONE.height - 68, PHONE.width - 16, 60));
    const { session } = await renderTable();

    // Past the bottom of the table that takes a drop on the hand when none shows: on the hand button.
    await dragTo('mine', 40, PHONE.height - 38);
    expect(handButton().classList).toContain('drop');
    expect(handButton().getAttribute('aria-label')).toBe('Drop here: back to hand');
    await fireEvent.pointerUp(window, { clientX: 40, clientY: PHONE.height - 38 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' }, 0);
    expect(document.querySelector('.dockdrop')).toBeNull();
  });

  it('sends a table card to its hand, from the rail', async () => {
    mockScreen(LANDSCAPE_PHONE);
    // The stand-in card, as placed for the rail: its band covers the rail from the hand button down.
    measure(LANDSCAPE_PHONE, domRect(-76, 28, 0, 0));
    const { session } = await renderTable();

    await dragTo('mine', 32, 86);
    expect(handButton().classList).toContain('drop');
    await fireEvent.pointerUp(window, { clientX: 32, clientY: 86 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' }, 0);
  });

  it('is no drop target for a card that stays on the table', async () => {
    mockScreen(PHONE);
    measure(PHONE, domRect(8, PHONE.height - 68, PHONE.width - 16, 60));
    await renderTable();

    await fireEvent.pointerDown(placed('v'), { clientX: 10, clientY: 10, pointerType: 'mouse' });
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 400, buttons: 1 });

    expect(interaction.dragging).not.toBeNull();
    expect(handButton().classList).not.toContain('drop');
    expect(document.querySelector('.dockdrop')).toBeNull();
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

  it('opens the inspector of the centred card with More…', async () => {
    mockScreen(PHONE);
    await renderTable();
    await fireEvent.click(handButton());

    await fireEvent.click(within(handSheet()!).getByRole('button', { name: 'More…' }));

    expect(handSheet()).toBeNull();
    const inspector = screen.getByRole('dialog');
    expect(within(inspector).getByRole('button', { name: /^Play/ })).toBeTruthy();
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
});

describe('the history sheet', () => {
  function historyButton(): HTMLElement {
    return within(dock()!).getByRole('button', { name: /^History/ });
  }

  it('counts the lines written since it was opened, none at first (history_unread_resets_on_open)', async () => {
    mockScreen(PHONE);
    const { rerender } = await renderTable();
    expect(historyButton().getAttribute('aria-label')).toBe('History');

    const newer = [
      ...LOG,
      line('discarded', '2026-11-05T20:02:00Z'),
      line('drew', '2026-11-05T20:03:00Z'),
    ];
    await rerender({ view: makeView({ log: newer }) });
    expect(historyButton().getAttribute('aria-label')).toBe('History, 2 new');

    await fireEvent.click(historyButton());
    const sheet = screen.getByRole('dialog', { name: 'History' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(4);

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'History' })).toBeNull();
    expect(historyButton().getAttribute('aria-label')).toBe('History');
  });

  it('counts every line of a game that starts with an empty history', async () => {
    mockScreen(PHONE);
    const { rerender } = await renderTable(makeView({ log: [] }));

    await rerender({ view: makeView() });

    expect(historyButton().getAttribute('aria-label')).toBe('History, 2 new');
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
    'keeps its room at the top of the table, the top overlays under it, on a phone %s (F-U1)',
    async (_name, size) => {
      mockScreen(size);
      await renderTable();

      expect(app().style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
      expect(app().style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);
    },
  );

  it('sits below the notch, its room and the notch both kept at the top of the table (F-U1)', async () => {
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

describe('art tiles and small piles in dock mode', () => {
  beforeEach(() => {
    vi.mocked(knownCard).mockImplementation(
      infoFrom({
        ...FACES,
        '01001': [{ name: 'Spider-Man', type: 'hero' }],
        '01094': [{ name: 'Rhino', type: 'villain', stage: 'I' }],
      }),
    );
  });

  it('draws the cards in play as art tiles and the piles small', async () => {
    mockScreen(PHONE);
    await renderTable();

    expect(placed('mine', '.card').classList).toContain('tile');
    expect(placed('v', '.card').querySelector('.tile .name')?.textContent).toBe('Rhino');
    expect(placed('deck:p0', '.pile').classList).toContain('scaled');
  });

  it.each([
    ['a mouse on a narrow window', NARROW_MOUSE],
    ['a touch tablet', TOUCH_TABLET],
    ['a desktop', DESKTOP],
  ])('draws full cards and piles on %s', async (_name, size) => {
    mockScreen(size);
    await renderTable();

    expect(placed('mine', '.card').classList).not.toContain('tile');
    expect(document.querySelector('.surface .tile')).toBeNull();
    expect(placed('deck:p0', '.pile').classList).not.toContain('scaled');
  });
});

describe('the zoom in dock mode (F-V3)', () => {
  // The play area's size, in px, as its scroller measures it.
  let visible = { w: 5000, h: 390 };

  beforeEach(() => {
    visible = { w: 5000, h: 390 };
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

  /** One finger touching `target` at (x, y) and lifting there. */
  function fingerTap(target: Element, x: number, y: number): void {
    const point = [{ clientX: x, clientY: y }];
    const start = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperties(start, { touches: { value: point }, changedTouches: { value: point } });
    target.dispatchEvent(start);
    const end = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperties(end, { touches: { value: [] }, changedTouches: { value: point } });
    target.dispatchEvent(end);
  }

  async function doubleTap(): Promise<void> {
    const surface = document.querySelector('.tablewrap .surface')!;
    fingerTap(surface, 100, 100);
    fingerTap(surface, 100, 100);
    await tick();
  }

  it('fits the drawn rows into the height beside the rail on a phone on its side', async () => {
    mockScreen(LANDSCAPE_PHONE);
    await renderTable();

    // 390 px less the top bar's 56 px and the 24 px gutter above and below the rows: the villain's
    // row drawn 270 high and the player's row 220, 490 units.
    expect(shownZoom()).toBe('0.58');
    expect(storedZoom()).toBeNull();
  });

  it('fits the width when it is the narrower fit', async () => {
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 300, h: 5000 };
    await renderTable();

    const zoom = Number(shownZoom());
    expect(zoom).toBeLessThan(1);
    expect(zoom).toBeGreaterThanOrEqual(0.3);
  });

  it('never fits below the phone minimum, 30 %', async () => {
    mockScreen(LANDSCAPE_PHONE);
    visible = { w: 5000, h: 150 };
    await renderTable();

    expect(shownZoom()).toBe('0.3');
  });

  it('follows the window live while no zoom was chosen', async () => {
    mockScreen(LANDSCAPE_PHONE);
    await renderTable();
    expect(shownZoom()).toBe('0.58');

    // 300 px less the top bar and the two gutters over the same 490 units.
    visible = { w: 5000, h: 300 };
    ManualResizeObserver.resized(scroller());
    await tick();

    expect(shownZoom()).toBe('0.4');
  });

  it('double tap toggles between the fit and the readable zoom', async () => {
    mockScreen(LANDSCAPE_PHONE);
    await renderTable();

    await doubleTap();
    expect(shownZoom()).toBe('1');

    // Back to the fit, remembered on the zoom's 10 % steps.
    await doubleTap();
    expect(storedZoom()).toBe(0.6);
    expect(shownZoom()).toBe('0.6');
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
