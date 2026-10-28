import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { FOCUS_MARGINS, TABLE_EDGE, TABLE_EDGE_BOTTOM } from './focus';
import { interaction } from './interaction.svelte';
import {
  fanPositions,
  HAND_CARD,
  HAND_CARD_NARROW,
  HAND_PADDING,
  HAND_REST_DROP,
  HAND_REST_SCALE,
  restingStrip,
} from './layout';
import { TOP_BAR_HEIGHT } from '../lib/autoHide.svelte';
import {
  DESKTOP,
  LANDSCAPE_PHONE,
  mockScreen,
  PHONE,
  resizeScreen,
  TABLET,
  type TestScreen,
} from '../lib/screen.testing';
import { knownCard, loadGameCards, loadIndex } from '../lib/catalog';
import type { CardView as TableCard, PileView, View } from '../lib/types';
import tableSource from './Table.svelte?raw';
import pickerSource from './HeroPicker.svelte?raw';
import sidePanelSource from './SidePanel.svelte?raw';
import zoomSource from './ZoomControl.svelte?raw';
import menuSource from './ContextMenu.svelte?raw';
import surfaceSource from './Surface.svelte?raw';
import handSource from './Hand.svelte?raw';
import { fakeSession } from './fixtures.testing';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
}));

// Screens of the table's tests alone; the shared ones come from screen.testing.
// A desktop window narrowed to the small screen breakpoint, with a mouse: the table fits its width.
const SMALL_WINDOW: TestScreen = { width: 600, height: 800 };
// A large phone held sideways (iPhone 16 Pro Max): short, and wide enough for the history column.
const LARGE_LANDSCAPE_PHONE: TestScreen = { width: 932, height: 430, touch: true };
const LANDSCAPE_TABLET: TestScreen = { width: 1180, height: 820, touch: true };

/** Records what the size bindings observe, so that a test can tell them the sizes changed. */
class FakeResizeObserver {
  static observers: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.observers.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }

  /** Every observed element is reported resized: its bindings read its size again. */
  static resizeAll(): void {
    for (const observer of FakeResizeObserver.observers) {
      const entries = [...observer.targets].map((target) => ({ target }) as ResizeObserverEntry);
      observer.callback(entries, observer as unknown as ResizeObserver);
    }
  }
}

// Svelte's size bindings share one observer, made at their first use: before any table is drawn.
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

/** Turns the window into another screen, and has the elements' size bindings read their sizes again. */
async function resizeTable(lists: ReturnType<typeof mockScreen>, on: TestScreen): Promise<void> {
  await resizeScreen(lists, on);
  FakeResizeObserver.resizeAll();
  await tick();
}

/**
 * Makes the table's scroller that wide, scrollbar included, as the fit zoom
 * measures it; the returned function changes it, as a resize would (the
 * bindings read it again at the next resizeTable or resizeAll).
 */
function mockScrollerWidth(initial: number): (width: number) => void {
  let width = initial;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('tablewrap') ? width : 0;
  });
  return (next) => {
    width = next;
  };
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
        online: true,
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

/** A card of Sam's lying far right: the table's content is 1500 + 140 = 1640 units wide. */
const FAR_RIGHT: TableCard = { ...IN_PLAY, id: 't2', x: 1500 };

/** Sam's three cards in hand, one card in play, and another one at `x`: the content is x + 140 units wide. */
function viewWithFarCardAt(x: number): View {
  const view = makeView();
  view.table!.cards.push({ ...FAR_RIGHT, x });
  return view;
}

function pile(id: string, fields: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: 0, x: 0, y: 500, count: 0, ...fields };
}

/** Sam's deck and discard pile in their frame, a set-aside pile (a chip), and a card far right. */
function makeWideView(): View {
  const view = makeView();
  view.table!.cards.push(FAR_RIGHT);
  view.table!.piles.push(
    pile('deck:p0', { kind: 'deck', x: 0 }),
    pile('disc:p0', { kind: 'discard', x: 160, cards: [] }),
    pile('aside:p0', { kind: 'aside', x: 0, count: 0, cards: [] }),
  );
  return view;
}

/** The % label: it fits the width on a small screen, and is back to 100 % on a wider one. */
function zoomLabel(): string | undefined {
  return screen.getByRole('button', { name: /^(Fit to width|Back to 100%)$/ }).textContent?.trim();
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
  vi.unstubAllGlobals();
  interaction.reset();
});

describe('Table on a narrow screen', () => {
  it('narrow layout shows the preview over the table, and no history', async () => {
    mockScreen(TABLET);
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
    mockScreen(DESKTOP);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(within(sidePanel() as HTMLElement).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(within(sidePanel() as HTMLElement).queryByLabelText('Card preview')).toBeNull();
    expect(peek(container)).toBeNull();

    await fireEvent.pointerEnter(cardInPlay());
    expect(within(peek(container) as HTMLElement).getByLabelText('Card preview')).toBeTruthy();
  });

  it('a click on a card shows the preview over the table, and its menu over the preview', async () => {
    mockScreen(TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    await fireEvent.pointerEnter(cardInPlay());
    await fireEvent.click(cardInPlay(), { clientX: 200, clientY: 300 });

    expect(within(peek(container)!).getByLabelText('Card preview')).toBeTruthy();
    expect(container.querySelector('.table-menu.context')).not.toBeNull();
    // On a small screen they can meet: the menu is drawn over the preview, which lets every click
    // through.
    const peekRule = /\n {2}\.peek \{([^}]*)\}/.exec(tableSource)?.[1] ?? '';
    const menuRule = /\n {2}\.table-menu \{([^}]*)\}/.exec(menuSource)?.[1] ?? '';
    const zOf = (rule: string) => Number(/z-index: (\d+);/.exec(rule)?.[1]);
    expect(zOf(menuRule)).toBeGreaterThan(zOf(peekRule));
    expect(peekRule).toMatch(/pointer-events: none;/);
  });

  it('follows the window as it narrows', async () => {
    const lists = mockScreen(DESKTOP);
    render(Table, { session: fakeSession(), view: makeView() });
    expect(sidePanel()).not.toBeNull();

    await resizeTable(lists, TABLET);
    expect(sidePanel()).toBeNull();
  });

  it('narrow layout floats an Undo button over the table', async () => {
    mockScreen(TABLET);
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
    mockScreen(TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(container.querySelector('.app')?.classList).not.toContain('history-collapsed');
    expect(sidePanel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand history' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Undo last action' })).toHaveLength(1);
  });

  it('wide layout has its Undo in the side column only', () => {
    mockScreen(DESKTOP);
    render(Table, { session: fakeSession(), view: makeView() });

    const [undo, ...others] = screen.getAllByRole('button', { name: 'Undo last action' });
    expect(others).toHaveLength(0);
    expect(sidePanel()?.contains(undo as HTMLElement)).toBe(true);
  });

  it('narrow hand uses smaller cards', () => {
    mockScreen(TABLET);
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
    mockScreen(DESKTOP);
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
    mockScreen(DESKTOP);
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

  it("draws the hero selector above the raised hand's veil, under that hand; the zoom control under the veil", () => {
    const zIndex = (source: string, selector: string) => {
      const pattern = new RegExp(`\\n {2}${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`);
      return Number(/z-index: (\d+);/.exec(pattern.exec(source)?.[1] ?? '')?.[1]);
    };
    const veil = zIndex(handSource, '.veil');
    const raisedHand = zIndex(handSource, '.hand.open');
    const picker = zIndex(tableSource, '.seatpick');
    expect(veil).toBe(2550);
    expect(raisedHand).toBe(2600);
    expect(picker).toBeGreaterThan(veil);
    expect(picker).toBeLessThan(raisedHand);
    expect(zIndex(tableSource, '.corner')).toBeLessThan(veil);
  });

  it("gives the hero selector's step buttons the zoom control's button height", () => {
    const appRule = /\n {2}\.app \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(appRule).toMatch(/--bar-button: 32px;/);
    const zoomButtonRule = /\n {2}button \{([^}]*)\}/.exec(zoomSource)?.[1];
    expect(zoomButtonRule).toMatch(/height: var\(--bar-button\);/);
    const stepRule = /\n {2}\.step \{([^}]*)\}/.exec(pickerSource)?.[1];
    expect(stepRule).toMatch(/height: var\(--bar-button\);/);
  });

  it('draws smaller avatars, closer together, on a small screen', async () => {
    mockScreen(PHONE);
    const view = makeView();
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
    const { container } = render(Table, { session: fakeSession(), view });
    expect(container.querySelector('.seatpick .picker')?.classList).toContain('compact');
    const compactRule = /\n {2}\.compact \.heroes \{([^}]*)\}/.exec(pickerSource)?.[1];
    expect(compactRule).toMatch(/--avatar: 30px;/);
    expect(compactRule).toMatch(/--spacing: 14px;/);
  });
});

describe('Table in touch mode', () => {
  /** A tap, as a finger makes it: enters, presses, lets go, clicks, then leaves as it lifts. */
  async function tap(...entered: HTMLElement[]): Promise<void> {
    const target = entered.at(-1)!;
    const touch = { pointerType: 'touch', button: 0, clientX: 200, clientY: 300 };
    for (const element of entered) {
      await fireEvent.pointerEnter(element, touch);
    }
    await fireEvent.pointerDown(target, touch);
    await fireEvent.pointerUp(target, touch);
    await fireEvent.click(target, { clientX: 200, clientY: 300 });
    for (const element of [...entered].reverse()) {
      await fireEvent.pointerLeave(element, touch);
    }
  }

  it('a tap on a card opens its menu and previews nothing, on a phone', async () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    await tap(cardInPlay());
    expect(container.querySelector('.table-menu.context')).not.toBeNull();
    expect(interaction.previewed).toBeNull();
    expect(peek(container)).toBeNull();
  });

  it('a tap on a token pins its pill and previews nothing', async () => {
    mockScreen(PHONE);
    const view = makeView();
    view.table!.cards = view.table!.cards.map((card) =>
      card.id === IN_PLAY.id ? { ...card, tokens: { dmg: 2 } } : card,
    );
    const { container } = render(Table, { session: fakeSession(), view });

    const token = cardInPlay().querySelector<HTMLElement>('[data-counter="token:dmg"]')!;
    await tap(cardInPlay(), token);
    expect(interaction.counterPinned).toBe(true);
    expect(screen.getByRole('group', { name: /^Change / })).toBeTruthy();
    expect(interaction.previewed).toBeNull();
    expect(peek(container)).toBeNull();
  });

  it('a hovering pointer previews nothing either, and entering touch mode drops a preview', async () => {
    const lists = mockScreen(TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await fireEvent.pointerEnter(cardInPlay());
    expect(peek(container)).not.toBeNull();

    // A tablet whose keyboard and trackpad were taken off.
    await resizeTable(lists, { ...TABLET, touch: true });
    expect(interaction.previewed).toBeNull();
    await fireEvent.pointerLeave(cardInPlay());
    await fireEvent.pointerEnter(cardInPlay());
    expect(interaction.previewed).toBeNull();
  });

  it('a wide touch screen keeps the history in the side column, and no preview anywhere', async () => {
    mockScreen(LANDSCAPE_TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    const side = sidePanel() as HTMLElement;
    expect(within(side).getByRole('list', { name: 'History' })).toBeTruthy();
    await tap(cardInPlay());
    expect(within(side).queryByLabelText('Card preview')).toBeNull();
    expect(screen.queryByLabelText('Card preview')).toBeNull();
    expect(peek(container)).toBeNull();
  });

  it('has no keyboard shortcuts button; a mouse on the same screen size has one', async () => {
    mockScreen(LANDSCAPE_TABLET);
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    unmount();

    vi.restoreAllMocks();
    mockScreen({ ...LANDSCAPE_TABLET, touch: false });
    render(Table, { session: fakeSession(), view: makeView() });
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('gives the bars at the bottom 44 px buttons', () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(container.querySelector('.app')?.classList).toContain('touch');
    const touchRule = /\n {2}\.app\.touch \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(touchRule).toMatch(/--bar-button: 44px;/);
  });
});

describe('Table zoom on a wide screen', () => {
  it('shows 100 % while no zoom was chosen, even when the content is wider', () => {
    mockScreen(DESKTOP);
    mockScrollerWidth(1000);
    const { container } = render(Table, { session: fakeSession(), view: makeWideView() });

    // 1640 units in 940 px would fit at 57 %: the table scrolls instead.
    expect(zoomLabel()).toBe('100%');
    expect(container.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--z')).toBe('1');
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('the % label is back to 100 %, with 0 as its key, and stores it', async () => {
    mockScreen(DESKTOP);
    mockScrollerWidth(1000);
    render(Table, { session: fakeSession(), view: makeWideView() });
    expect(screen.queryByRole('button', { name: 'Fit to width' })).toBeNull();
    const label = screen.getByRole('button', { name: 'Back to 100%' });
    expect(label.dataset).toMatchObject({ tip: 'Back to 100%', kbd: '0' });

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoomLabel()).toBe('110%');
    await fireEvent.click(label);
    expect(zoomLabel()).toBe('100%');
    expect(localStorage.getItem('itf-zoom')).toBe('1');
  });
});

describe('Table zoom fitting the width on a small screen', () => {
  it('fits the content into the scroller while no zoom was chosen, never above 100 %', () => {
    mockScreen(SMALL_WINDOW);
    mockScrollerWidth(600);
    const { container } = render(Table, { session: fakeSession(), view: makeWideView() });

    // 600 px, less the 2 × 24 px padding and 12 px kept for a scrollbar, over 1640 units.
    expect(zoomLabel()).toBe('32%');
    expect(container.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--z')).toBe(
      '0.32',
    );
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('the % label fits the width, with no key', () => {
    mockScreen(PHONE);
    render(Table, { session: fakeSession(), view: makeWideView() });
    expect(screen.queryByRole('button', { name: 'Back to 100%' })).toBeNull();
    const label = screen.getByRole('button', { name: 'Fit to width' });
    expect(label.dataset.tip).toBe('Fit to width');
    expect(label.dataset.kbd).toBeUndefined();
  });

  it('stays at 100 % while nothing is measured, and when the content fits', async () => {
    mockScreen(SMALL_WINDOW);
    const setWidth = mockScrollerWidth(0);
    render(Table, { session: fakeSession(), view: makeView() });
    expect(zoomLabel()).toBe('100%');

    // 440 units in 540 px.
    setWidth(600);
    FakeResizeObserver.resizeAll();
    await tick();
    expect(zoomLabel()).toBe('100%');
  });

  it('follows a resize and new content, until the viewer zooms', async () => {
    const lists = mockScreen(SMALL_WINDOW);
    const setWidth = mockScrollerWidth(600);
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: viewWithFarCardAt(900) });
    // 1040 units in 540 px.
    expect(zoomLabel()).toBe('51%');

    setWidth(500);
    await resizeTable(lists, { width: 500, height: 800 });
    expect(zoomLabel()).toBe('42%');

    // The far card leaves: 440 units fit at 100 %.
    await rerender({ session, view: makeView() });
    expect(zoomLabel()).toBe('100%');
    await rerender({ session, view: viewWithFarCardAt(900) });
    expect(zoomLabel()).toBe('42%');

    // The viewer's zoom, on a 10 % step, stays through a resize and is remembered.
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoomLabel()).toBe('50%');
    expect(localStorage.getItem('itf-zoom')).toBe('0.5');
    setWidth(600);
    await resizeTable(lists, SMALL_WINDOW);
    expect(zoomLabel()).toBe('50%');

    // The % label goes back to the fit, and forgets the viewer's zoom.
    await fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
    expect(zoomLabel()).toBe('51%');
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('holds the fit while the action menu is open or a card is pressed, so that the menu stays open', async () => {
    mockScreen(SMALL_WINDOW);
    mockScrollerWidth(600);
    const session = fakeSession();
    const { rerender, container } = render(Table, { session, view: viewWithFarCardAt(900) });
    const menu = () => container.querySelector('.table-menu.context');
    const at = { button: 0, clientX: 200, clientY: 300 };
    expect(zoomLabel()).toBe('51%');

    // A click opens the card's menu; the far card leaves meanwhile, which would fit at 100 %.
    await fireEvent.pointerDown(cardInPlay(), at);
    await fireEvent.pointerUp(cardInPlay(), at);
    await fireEvent.click(cardInPlay(), at);
    expect(menu()).not.toBeNull();
    await rerender({ session, view: makeView() });
    expect(zoomLabel()).toBe('51%');
    expect(menu()).not.toBeNull();

    // Once it closes, the fit catches up.
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(zoomLabel()).toBe('100%');

    // A press holds it as well, until it is let go.
    await fireEvent.pointerDown(cardInPlay(), at);
    await rerender({ session, view: viewWithFarCardAt(900) });
    expect(zoomLabel()).toBe('100%');
    await fireEvent.pointerUp(window, at);
    expect(zoomLabel()).toBe('51%');
  });

  it('the 0 key is back to 100 %, a chosen zoom', async () => {
    const lists = mockScreen(SMALL_WINDOW);
    const setWidth = mockScrollerWidth(600);
    render(Table, { session: fakeSession(), view: makeWideView() });

    await fireEvent.keyDown(window, { key: '0' });
    expect(zoomLabel()).toBe('100%');
    expect(localStorage.getItem('itf-zoom')).toBe('1');
    setWidth(500);
    await resizeTable(lists, { width: 500, height: 800 });
    expect(zoomLabel()).toBe('100%');
  });

  it('a stored zoom wins over the fit', () => {
    localStorage.setItem('itf-zoom', '1');
    mockScreen(SMALL_WINDOW);
    mockScrollerWidth(600);
    render(Table, { session: fakeSession(), view: makeWideView() });

    expect(zoomLabel()).toBe('100%');
  });

  it('goes down to 30 % on a phone, 50 % elsewhere', async () => {
    mockScreen(PHONE);
    mockScrollerWidth(390);
    const { unmount } = render(Table, { session: fakeSession(), view: makeWideView() });
    // 330 px over 1640 units is 20 %: the fit stops at the phone's least zoom.
    expect(zoomLabel()).toBe('30%');
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomLabel()).toBe('30%');
    expect(localStorage.getItem('itf-zoom')).toBe('0.3');
    unmount();

    // The same zoom, stored, on a wider screen: its own least zoom.
    vi.restoreAllMocks();
    mockScreen(TABLET);
    render(Table, { session: fakeSession(), view: makeWideView() });
    expect(zoomLabel()).toBe('50%');
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomLabel()).toBe('50%');
  });
});

describe('Table zoom across the small screen breakpoint', () => {
  it('switches between 100 % and the fit as the window crosses 600 px, while no zoom was chosen', async () => {
    const lists = mockScreen({ width: 1000, height: 800 });
    const setWidth = mockScrollerWidth(1000);
    render(Table, { session: fakeSession(), view: viewWithFarCardAt(900) });
    // 1040 units would fit in 940 px at 90 %.
    expect(zoomLabel()).toBe('100%');
    expect(screen.getByRole('button', { name: 'Back to 100%' })).toBeTruthy();

    // 1040 units in 440 px.
    setWidth(500);
    await resizeTable(lists, { width: 500, height: 800 });
    expect(zoomLabel()).toBe('42%');
    expect(screen.getByRole('button', { name: 'Fit to width' })).toBeTruthy();

    setWidth(1000);
    await resizeTable(lists, { width: 1000, height: 800 });
    expect(zoomLabel()).toBe('100%');
    expect(screen.getByRole('button', { name: 'Back to 100%' })).toBeTruthy();
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('switches as a phone turns', async () => {
    const lists = mockScreen(PHONE);
    const setWidth = mockScrollerWidth(390);
    render(Table, { session: fakeSession(), view: viewWithFarCardAt(900) });
    // 1040 units in 330 px.
    expect(zoomLabel()).toBe('31%');

    // Sideways, 844 px wide: more than 600 px.
    setWidth(844);
    await resizeTable(lists, LANDSCAPE_PHONE);
    expect(zoomLabel()).toBe('100%');

    setWidth(390);
    await resizeTable(lists, PHONE);
    expect(zoomLabel()).toBe('31%');
  });

  it('keeps a chosen zoom on either side', async () => {
    const lists = mockScreen({ width: 1000, height: 800 });
    const setWidth = mockScrollerWidth(1000);
    render(Table, { session: fakeSession(), view: viewWithFarCardAt(900) });
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomLabel()).toBe('90%');

    setWidth(500);
    await resizeTable(lists, { width: 500, height: 800 });
    expect(zoomLabel()).toBe('90%');
    expect(localStorage.getItem('itf-zoom')).toBe('0.9');
  });
});

describe('Table labels when zoomed out', () => {
  // The unit of the name lines (Surface.svelte), in table units: 1, or more far out.
  const labelUnit = (zoom: number) => Math.max(1, 11 / 12 / zoom);

  it('counter-scales the names and the chips in --lu, from the zoom', () => {
    expect(surfaceSource).toMatch(/--lu: max\(1px, 11px \/ 12 \/ var\(--z, 1\)\);/);
    const owner = /\n {2}\.owner \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(owner).toMatch(/font-size: calc\(13 \* var\(--lu\)\);/);
    expect(owner).toMatch(/bottom: calc\(100% \+ 2px \+ 12 \* var\(--lu\)\);/);
    const chips = /\n {2}\.chips \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(chips).toMatch(/height: calc\(22 \* var\(--lu\)\);/);
    expect(chips).toMatch(/margin-top: calc\(-30 \* var\(--lu\)\);/);
    const chip = /\n {2}\.chip \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(chip).toMatch(/font-size: calc\(12 \* var\(--lu\)\);/);

    for (let zoom = 0.3; zoom <= 2; zoom += 0.1) {
      // The chips' text (12 units) and the names' (13) never show under 11 screen px.
      expect(12 * labelUnit(zoom) * zoom).toBeGreaterThanOrEqual(11 - 1e-9);
      // The villain's line, 30 units above its frame 20 units under the surface's top, stays in
      // the scroller's 24 px padding.
      expect(30 * labelUnit(zoom) * zoom).toBeLessThanOrEqual(24 + 20 * zoom);
    }
    // At 100 %, the line is drawn as it always was.
    expect(labelUnit(1)).toBe(1);
  });

  it('hands the chips the frame width, so that a line too narrow far out goes on past the frame', () => {
    mockScreen(PHONE);
    mockScrollerWidth(390);
    const { container } = render(Table, { session: fakeSession(), view: makeWideView() });

    expect(container.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--z')).toBe('0.3');
    const chips = container.querySelector<HTMLElement>('.surface .chips[data-owner="0"]')!;
    // Sam's deck and discard, 140 units each and 20 apart, in 10 units of padding each side.
    expect(chips.style.getPropertyValue('--frame-w')).toBe('320px');
    expect(chips.style.getPropertyValue('--chips')).toBe('1');
    const rule = /\n {2}\.chips \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(rule).toMatch(/width: max\(\s*var\(--frame-w\),/);
  });
});

describe('Table on a small screen', () => {
  function hand(): HTMLElement {
    return screen.getByRole('list', { name: 'Your hand' });
  }

  function corner(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>('.corner')!;
  }

  it('sizes the hand cards from the window, the resting hand dropping as much of them', () => {
    mockScreen(PHONE);
    render(Table, { session: fakeSession(), view: makeView() });

    // A quarter of 390 px, 1.4 times as tall; 136 × 140 / 259 ≈ 74 px down.
    expect(hand().style.getPropertyValue('--card-w')).toBe('97px');
    expect(hand().style.getPropertyValue('--card-h')).toBe('136px');
    expect(hand().style.getPropertyValue('--rest-drop')).toBe('74px');
    // Hand.svelte's own rule: the drop, the scale and the padding come from the variables, which
    // layout.ts's measures set.
    const handRule = /\n {2}\.hand \{([^}]*)\}/.exec(handSource)?.[1];
    expect(handRule).toMatch(
      /transform: translateY\(var\(--rest-drop\)\) scale\(var\(--rest-scale\)\);/,
    );
    expect(handRule).toMatch(/padding: var\(--pad-top\) 18px var\(--pad-bottom\);/);
    expect(handSource).not.toMatch(/0\.82|26px/);
    expect(hand().style.getPropertyValue('--rest-scale')).toBe(`${HAND_REST_SCALE}`);
    expect(hand().style.getPropertyValue('--pad-top')).toBe(`${HAND_PADDING.top}px`);
    expect(hand().style.getPropertyValue('--pad-bottom')).toBe(`${HAND_PADDING.bottom}px`);
  });

  it("shows only the selected deck's hand with two own decks, over the whole width", () => {
    mockScreen(PHONE);
    const view = makeView();
    view.you = { ...view.you, areas: ['p0', 'p1'] };
    view.players[0]!.decks.push({ area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 0 });
    view.table!.hands = { ...view.table!.hands, p1: [] };
    render(Table, { session: fakeSession(), view });

    // The selector shows, above the resting hand rather than beside it.
    expect(screen.getByRole('radiogroup', { name: 'Hand shown' })).toBeTruthy();
    const hands = screen.getAllByRole('list', { name: /hand$/ });
    expect(hands).toEqual([hand()]);
    expect(hand().dataset.seat).toBe('0');
    expect(hand().style.marginLeft).toBe('0px');
  });

  it('keeps the raised hand to half the window held sideways', () => {
    mockScreen(LANDSCAPE_PHONE);
    render(Table, { session: fakeSession(), view: makeView() });

    const height = Number.parseFloat(hand().style.getPropertyValue('--card-h'));
    // Its cards and the hand's 26 + 18 px padding.
    expect(height + 44).toBeLessThanOrEqual(LANDSCAPE_PHONE.height / 2);
    expect(hand().style.getPropertyValue('--card-w')).toBe('107px');
  });

  it('follows the window as it turns', async () => {
    const lists = mockScreen(PHONE);
    render(Table, { session: fakeSession(), view: makeView() });
    await resizeTable(lists, LANDSCAPE_PHONE);
    expect(hand().style.getPropertyValue('--card-w')).toBe('107px');
  });

  it('keeps the desktop hand on a wide screen', () => {
    mockScreen(DESKTOP);
    render(Table, { session: fakeSession(), view: makeView() });

    expect(hand().style.getPropertyValue('--card-w')).toBe(`${HAND_CARD.w}px`);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe(`${HAND_REST_DROP}px`);
  });

  it('gathers Undo and the zoom control in one bar above the resting hand', () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    const bar = corner(container);
    expect(within(bar).getByRole('button', { name: 'Undo last action' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    // 8 px above the strip the resting hand shows.
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${restingStrip(136, 74) + 8}px`);
    const rule = /\n {2}\.app\.compact \.corner \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(rule).toMatch(/margin-bottom: var\(--controls-bottom\);/);
  });

  it('a phone held sideways is a small screen too; a spectator, with no hand, keeps the edge', () => {
    mockScreen(LANDSCAPE_PHONE);
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const { container } = render(Table, { session: fakeSession(), view });

    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${TABLE_EDGE_BOTTOM}px`);
  });

  it('leaves the controls as they are on a wide or a narrow screen', () => {
    mockScreen(TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).not.toContain('compact');
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${TABLE_EDGE_BOTTOM}px`);
  });
});

describe('Table raised hand', () => {
  function hand(): HTMLElement {
    return screen.getByRole('list', { name: 'Your hand' });
  }

  it("raises the hand's cards to 80 % of the preview's, drawn at rest as the base card", () => {
    mockScreen(DESKTOP);
    mockScrollerWidth(1000);
    render(Table, { session: fakeSession(), view: makeView() });

    // The preview's card is 298 px wide: 80 % of it, 1.4 times as tall.
    expect(hand().style.getPropertyValue('--card-w')).toBe('238px');
    expect(hand().style.getPropertyValue('--card-h')).toBe('333px');
    // At rest, as large as the desktop card at 82 % (185 / 238 of it), and dropped so that 87 px of
    // the cards show, as of the desktop card dropped by 140 px.
    expect(Number(hand().style.getPropertyValue('--rest-scale'))).toBeCloseTo(0.6374, 4);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe('137px');
  });

  it("follows the preview on a phone, the controls staying above the resting hand's strip", () => {
    mockScreen(PHONE);
    mockScrollerWidth(390);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    // 45 % of 390 px less the preview's padding and border: 153.5 px, 80 % of it.
    expect(hand().style.getPropertyValue('--card-w')).toBe('123px');
    expect(hand().style.getPropertyValue('--card-h')).toBe('172px');
    // 82 % of 97 / 123, and dropped so that 52 px of the cards show, as of the base card.
    expect(Number(hand().style.getPropertyValue('--rest-scale'))).toBeCloseTo(0.6467, 4);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe('71px');
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${restingStrip(136, 74) + 8}px`);
  });

  it('keeps the base cards while the table area is not measured', () => {
    mockScreen(DESKTOP);
    render(Table, { session: fakeSession(), view: makeView() });

    expect(hand().style.getPropertyValue('--card-w')).toBe(`${HAND_CARD.w}px`);
    expect(hand().style.getPropertyValue('--rest-scale')).toBe(`${HAND_REST_SCALE}`);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe(`${HAND_REST_DROP}px`);
  });
});

describe('Table menus on a phone', () => {
  it('keeps the action menu inside the window, its labels cut short', () => {
    const rule = /\n {2}\.table-menu \{([^}]*)\}/.exec(menuSource)?.[1];
    expect(rule).toMatch(/max-width: calc\(100vw - 16px\);/);
    const label = /\n {2}\.table-menu button > span:first-child \{([^}]*)\}/.exec(menuSource)?.[1];
    expect(label).toMatch(/text-overflow: ellipsis;/);
    expect(label).toMatch(/min-width: 0;/);
  });
});

describe('Table under a compact top bar', () => {
  /** Gives the play area's scroller a content of that height, scrolled to that offset. */
  function scrollTable(wrap: HTMLElement, offset: number): Promise<boolean> {
    Object.defineProperties(wrap, {
      scrollHeight: { value: 3000, configurable: true },
      clientHeight: { value: 600, configurable: true },
      scrollTop: { value: offset, configurable: true },
    });
    return fireEvent.scroll(wrap);
  }

  it('floats the bar over the play area, which keeps room for it while it shows', async () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    const wrap = container.querySelector<HTMLElement>('.tablewrap')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
    expect(app.style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);

    await scrollTable(wrap, 400);
    expect(container.querySelector('header')?.classList).toContain('hidden');
    expect(app.style.getPropertyValue('--bar-room')).toBe('0px');
    // The start of the table keeps its room: hiding the bar moves nothing.
    expect(app.style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);

    await scrollTable(wrap, 300);
    expect(container.querySelector('header')?.classList).not.toContain('hidden');
    expect(app.style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);
  });

  it('keeps an empty table from scrolling under the bar', () => {
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(2000);
    const surfaceHeight = () =>
      parseFloat(document.querySelector<HTMLElement>('.surface')!.style.height);

    mockScreen(DESKTOP);
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    const wide = surfaceHeight();
    unmount();

    mockScreen(PHONE);
    render(Table, { session: fakeSession(), view: makeView() });
    expect(surfaceHeight()).toBe(wide - TOP_BAR_HEIGHT);
  });

  it('keeps the preview in a top corner clear of the bar while it shows', async () => {
    // With a mouse: touch mode previews nothing.
    mockScreen(SMALL_WINDOW);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    // A 320 x 450 preview would hide the whole hovered card in both bottom corners, at home above
    // the controls the small screen raises over the resting hand: it goes up.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(450);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('tablewrap')) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 900 });
      }
      if (this.matches('.card[data-id="t1"]')) {
        return DOMRect.fromRect({ x: 100, y: 500, width: 200, height: 200 });
      }
      return DOMRect.fromRect();
    });

    await fireEvent.pointerEnter(cardInPlay());
    const panel = peek(container)!;
    expect(panel.classList).toContain('top-left');
    expect(panel.style.margin.split(' ')[0]).toBe(`${FOCUS_MARGINS.top + TOP_BAR_HEIGHT}px`);
  });

  it('unhides the bar when the window widens past the compact screen', async () => {
    const lists = mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    await scrollTable(container.querySelector<HTMLElement>('.tablewrap')!, 400);
    expect(container.querySelector('header')?.classList).toContain('hidden');

    await resizeTable(lists, DESKTOP);
    expect(container.querySelector('header')?.classList).not.toContain('hidden');

    // Back on a phone, the bar shows until the table scrolls down again.
    await resizeTable(lists, PHONE);
    expect(container.querySelector('header')?.classList).not.toContain('hidden');
    expect(app.style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);
  });

  it('zooms around the pointer past the room the bar keeps at the top', async () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const wrap = container.querySelector<HTMLElement>('.tablewrap')!;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 800 }),
    );
    Object.defineProperty(wrap, 'scrollLeft', { value: 0, writable: true });
    Object.defineProperty(wrap, 'scrollTop', { value: 50, writable: true });

    // The pointer at 24, 430: 400 px down the surface, past the 24 px padding and the bar's room.
    await fireEvent.wheel(wrap, { deltaY: -20, ctrlKey: true, clientX: 24, clientY: 430 });
    // At 120 %, that spot is 480 px down the surface: still under the pointer.
    await waitFor(() => {
      expect(wrap.scrollTop).toBe(24 + TOP_BAR_HEIGHT + 480 - 430);
    });
  });

  it('floats the bar over a phone on its side, in the narrow layout', async () => {
    vi.mocked(loadGameCards).mockRejectedValue(new Error('offline'));
    mockScreen(LANDSCAPE_PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
    expect(app.style.getPropertyValue('--bar-room')).toBe(`${TOP_BAR_HEIGHT}px`);
    // The narrow layout: no history, Undo floating over the table.
    expect(sidePanel()).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Undo last action' })).toHaveLength(1);
    // The catalog notice keeps clear of the bar through --bar-room.
    expect((await screen.findByRole('alert')).classList).toContain('notice');

    await scrollTable(container.querySelector<HTMLElement>('.tablewrap')!, 400);
    expect(container.querySelector('header')?.classList).toContain('hidden');
    expect(app.style.getPropertyValue('--bar-room')).toBe('0px');
  });

  it('floats the bar over the play area only of a large phone on its side, beside the history', () => {
    mockScreen(LARGE_LANDSCAPE_PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--bar-start')).toBe(`${TOP_BAR_HEIGHT}px`);
    expect(sidePanel()).not.toBeNull();

    // jsdom applies no stylesheet: the rules themselves are checked. The history column stays
    // beside the play area, and goes with the narrow layout.
    const compactRule = /\n {2}\.app\.compact \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(compactRule).toMatch(/grid-template-areas: 'table side';/);
    expect(compactRule).not.toMatch(/grid-template-columns/);
    const narrowRule = /@media \(max-width: 900px\) \{\s*\.app\.compact \{([^}]*)\}/.exec(
      tableSource,
    )?.[1];
    expect(narrowRule).toMatch(/grid-template-areas: 'table';/);
  });

  it('leaves the bar in its own row on a tablet, without the history column', () => {
    mockScreen(TABLET);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).not.toContain('compact');
    expect(app.style.getPropertyValue('--bar-start')).toBe('0px');
    expect(app.style.getPropertyValue('--bar-room')).toBe('0px');
    expect(sidePanel()).toBeNull();
  });

  it('leaves the bar in its own row on a larger screen', () => {
    mockScreen(DESKTOP);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).not.toContain('compact');
    expect(app.style.getPropertyValue('--bar-start')).toBe('0px');
    expect(app.style.getPropertyValue('--bar-room')).toBe('0px');
  });
});
