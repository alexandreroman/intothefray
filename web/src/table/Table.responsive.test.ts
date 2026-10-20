import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { FOCUS_MARGINS, TABLE_EDGE, TABLE_EDGE_BOTTOM } from './focus';
import { interaction } from './interaction.svelte';
import { fanPositions, HAND_CARD, HAND_CARD_NARROW, HAND_REST_DROP, restingStrip } from './layout';
import { knownCard, loadGameCards, loadIndex } from '../lib/catalog';
import type { CardView as TableCard, PileView, PresenceState, View } from '../lib/types';
import tableSource from './Table.svelte?raw';
import sidePanelSource from './SidePanel.svelte?raw';
import zoomSource from './ZoomControl.svelte?raw';
import menuSource from './ContextMenu.svelte?raw';
import surfaceSource from './Surface.svelte?raw';
import handSource from './Hand.svelte?raw';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
}));

/** A media query list whose match can be changed, as a resized window would. */
class FakeMediaQueryList extends EventTarget {
  onchange = null;

  constructor(
    readonly media: string,
    public matches: boolean,
  ) {
    super();
  }

  addListener(): void {}
  removeListener(): void {}

  resize(matches: boolean): void {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

/** A window the media queries are asked about, in px; `touch` is touch mode's finger. */
interface Screen {
  width: number;
  height: number;
  touch?: boolean;
}

const WIDE: Screen = { width: 1280, height: 800 };
// Narrow (900 px wide or less), not small: a tablet held upright, with a mouse.
const NARROW: Screen = { width: 800, height: 1000 };
const PHONE: Screen = { width: 390, height: 844, touch: true };
// A desktop window narrowed to the small screen breakpoint, with a mouse: the table fits its width.
const SMALL_WINDOW: Screen = { width: 600, height: 800 };
const PHONE_SIDEWAYS: Screen = { width: 844, height: 390, touch: true };
const TABLET_SIDEWAYS: Screen = { width: 1180, height: 820, touch: true };

/** Whether one feature of a media query, as "max-width: 900px", holds on that screen. */
function holds(feature: string, on: Screen): boolean {
  const [name = '', value = ''] = feature.split(':').map((part) => part.trim());
  switch (name) {
    case 'max-width':
      return on.width <= Number.parseFloat(value);
    case 'max-height':
      return on.height <= Number.parseFloat(value);
    case 'hover':
      return value === (on.touch ? 'none' : 'hover');
    case 'pointer':
      return value === (on.touch ? 'coarse' : 'fine');
    default:
      // prefers-reduced-motion and the like.
      return false;
  }
}

/** Whether a media query of the table matches that screen: features joined by "and", queries by ",". */
function matchesScreen(query: string, on: Screen): boolean {
  return query
    .split(',')
    .some((part) =>
      [...part.matchAll(/\(([^)]*)\)/g)].every(([, feature]) => holds(feature ?? '', on)),
    );
}

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

function stubWindow(on: Screen): void {
  vi.stubGlobal('innerWidth', on.width);
  vi.stubGlobal('innerHeight', on.height);
}

/** Answers every media query as that screen would, and returns the lists handed out. */
function mockScreen(on: Screen): FakeMediaQueryList[] {
  stubWindow(on);
  const lists: FakeMediaQueryList[] = [];
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = new FakeMediaQueryList(query, matchesScreen(query, on));
    lists.push(list);
    return list as unknown as MediaQueryList;
  });
  return lists;
}

/** Turns the window into another screen: its media queries, its size and the elements' sizes follow. */
async function resizeScreen(lists: FakeMediaQueryList[], on: Screen): Promise<void> {
  stubWindow(on);
  for (const list of lists) {
    list.resize(matchesScreen(list.media, on));
  }
  window.dispatchEvent(new Event('resize'));
  FakeResizeObserver.resizeAll();
  await tick();
}

/**
 * Makes the table's scroller that wide, scrollbar included, as the fit zoom
 * measures it; the returned function changes it, as a resize would (the
 * bindings read it again at the next resizeScreen or resizeAll).
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
    mockScreen(NARROW);
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
    mockScreen(WIDE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(within(sidePanel() as HTMLElement).getByRole('list', { name: 'History' })).toBeTruthy();
    expect(within(sidePanel() as HTMLElement).queryByLabelText('Card preview')).toBeNull();
    expect(peek(container)).toBeNull();

    await fireEvent.pointerEnter(cardInPlay());
    expect(within(peek(container) as HTMLElement).getByLabelText('Card preview')).toBeTruthy();
  });

  it('a click on a card shows the preview over the table, and its menu over the preview', async () => {
    mockScreen(NARROW);
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
    const lists = mockScreen(WIDE);
    render(Table, { session: fakeSession(), view: makeView() });
    expect(sidePanel()).not.toBeNull();

    await resizeScreen(lists, NARROW);
    expect(sidePanel()).toBeNull();
  });

  it('narrow layout floats an Undo button over the table', async () => {
    mockScreen(NARROW);
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
    mockScreen(NARROW);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(container.querySelector('.app')?.classList).not.toContain('history-collapsed');
    expect(sidePanel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand history' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Undo last action' })).toHaveLength(1);
  });

  it('wide layout has its Undo in the side column only', () => {
    mockScreen(WIDE);
    render(Table, { session: fakeSession(), view: makeView() });

    const [undo, ...others] = screen.getAllByRole('button', { name: 'Undo last action' });
    expect(others).toHaveLength(0);
    expect(sidePanel()?.contains(undo as HTMLElement)).toBe(true);
  });

  it('narrow hand uses smaller cards', () => {
    mockScreen(NARROW);
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
    mockScreen(WIDE);
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
    mockScreen(WIDE);
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

  it("gives the player selector the zoom control's height, so that their edges line up", () => {
    const appRule = /\n {2}\.app \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(appRule).toMatch(/--bar-button: 32px;/);
    const zoomButtonRule = /\n {2}button \{([^}]*)\}/.exec(zoomSource)?.[1];
    expect(zoomButtonRule).toMatch(/height: var\(--bar-button\);/);
    const swatchesRule = /\n {2}\.seatpick \.seats \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(swatchesRule).toMatch(/height: var\(--bar-button\);/);
    const stepRule = /\n {2}\.seatpick \.step \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(stepRule).toMatch(/height: var\(--bar-button\);/);
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
    const lists = mockScreen(NARROW);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });
    await fireEvent.pointerEnter(cardInPlay());
    expect(peek(container)).not.toBeNull();

    // A tablet whose keyboard and trackpad were taken off.
    await resizeScreen(lists, { ...NARROW, touch: true });
    expect(interaction.previewed).toBeNull();
    await fireEvent.pointerLeave(cardInPlay());
    await fireEvent.pointerEnter(cardInPlay());
    expect(interaction.previewed).toBeNull();
  });

  it('a wide touch screen keeps the history in the side column, and no preview anywhere', async () => {
    mockScreen(TABLET_SIDEWAYS);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    const side = sidePanel() as HTMLElement;
    expect(within(side).getByRole('list', { name: 'History' })).toBeTruthy();
    await tap(cardInPlay());
    expect(within(side).queryByLabelText('Card preview')).toBeNull();
    expect(screen.queryByLabelText('Card preview')).toBeNull();
    expect(peek(container)).toBeNull();
  });

  it('has no keyboard shortcuts button; a mouse on the same screen size has one', async () => {
    mockScreen(TABLET_SIDEWAYS);
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    unmount();

    vi.restoreAllMocks();
    mockScreen({ ...TABLET_SIDEWAYS, touch: false });
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
    mockScreen(WIDE);
    mockScrollerWidth(1000);
    const { container } = render(Table, { session: fakeSession(), view: makeWideView() });

    // 1640 units in 940 px would fit at 57 %: the table scrolls instead.
    expect(zoomLabel()).toBe('100%');
    expect(container.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--z')).toBe('1');
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('the % label is back to 100 %, with 0 as its key, and stores it', async () => {
    mockScreen(WIDE);
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
    await resizeScreen(lists, { width: 500, height: 800 });
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
    await resizeScreen(lists, SMALL_WINDOW);
    expect(zoomLabel()).toBe('50%');

    // The % label goes back to the fit, and forgets the viewer's zoom.
    await fireEvent.click(screen.getByRole('button', { name: 'Fit to width' }));
    expect(zoomLabel()).toBe('51%');
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it('the 0 key is back to 100 %, a chosen zoom', async () => {
    const lists = mockScreen(SMALL_WINDOW);
    const setWidth = mockScrollerWidth(600);
    render(Table, { session: fakeSession(), view: makeWideView() });

    await fireEvent.keyDown(window, { key: '0' });
    expect(zoomLabel()).toBe('100%');
    expect(localStorage.getItem('itf-zoom')).toBe('1');
    setWidth(500);
    await resizeScreen(lists, { width: 500, height: 800 });
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
    mockScreen(NARROW);
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
    await resizeScreen(lists, { width: 500, height: 800 });
    expect(zoomLabel()).toBe('42%');
    expect(screen.getByRole('button', { name: 'Fit to width' })).toBeTruthy();

    setWidth(1000);
    await resizeScreen(lists, { width: 1000, height: 800 });
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
    await resizeScreen(lists, PHONE_SIDEWAYS);
    expect(zoomLabel()).toBe('100%');

    setWidth(390);
    await resizeScreen(lists, PHONE);
    expect(zoomLabel()).toBe('31%');
  });

  it('keeps a chosen zoom on either side', async () => {
    const lists = mockScreen({ width: 1000, height: 800 });
    const setWidth = mockScrollerWidth(1000);
    render(Table, { session: fakeSession(), view: viewWithFarCardAt(900) });
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomLabel()).toBe('90%');

    setWidth(500);
    await resizeScreen(lists, { width: 500, height: 800 });
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
    // Hand.svelte's own rule: the drop comes from the variable.
    const handRule = /\n {2}\.hand \{([^}]*)\}/.exec(handSource)?.[1];
    expect(handRule).toMatch(/transform: translateY\(var\(--rest-drop\)\) scale\(0\.82\);/);
  });

  it('keeps the raised hand to half the window held sideways', () => {
    mockScreen(PHONE_SIDEWAYS);
    render(Table, { session: fakeSession(), view: makeView() });

    const height = Number.parseFloat(hand().style.getPropertyValue('--card-h'));
    // Its cards and the hand's 26 + 18 px padding.
    expect(height + 44).toBeLessThanOrEqual(PHONE_SIDEWAYS.height / 2);
    expect(hand().style.getPropertyValue('--card-w')).toBe('107px');
  });

  it('follows the window as it turns', async () => {
    const lists = mockScreen(PHONE);
    render(Table, { session: fakeSession(), view: makeView() });
    await resizeScreen(lists, PHONE_SIDEWAYS);
    expect(hand().style.getPropertyValue('--card-w')).toBe('107px');
  });

  it('keeps the desktop hand on a wide screen', () => {
    mockScreen(WIDE);
    render(Table, { session: fakeSession(), view: makeView() });

    expect(hand().style.getPropertyValue('--card-w')).toBe(`${HAND_CARD.w}px`);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe(`${HAND_REST_DROP}px`);
  });

  it('gathers Undo and the zoom control in one bar above the resting hand', () => {
    mockScreen(PHONE);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    const bar = corner(container);
    expect(bar.classList).toContain('compact');
    expect(within(bar).getByRole('button', { name: 'Undo last action' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    // 8 px above the strip the resting hand shows.
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.classList).toContain('compact');
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${restingStrip(136, 74) + 8}px`);
    const rule = /\n {2}\.corner\.compact \{([^}]*)\}/.exec(tableSource)?.[1];
    expect(rule).toMatch(/margin-bottom: var\(--controls-bottom\);/);
  });

  it('a phone held sideways is a small screen too; a spectator, with no hand, keeps the edge', () => {
    mockScreen(PHONE_SIDEWAYS);
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const { container } = render(Table, { session: fakeSession(), view });

    expect(corner(container).classList).toContain('compact');
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${TABLE_EDGE_BOTTOM}px`);
  });

  it('leaves the controls as they are on a wide or a narrow screen', () => {
    mockScreen(NARROW);
    const { container } = render(Table, { session: fakeSession(), view: makeView() });

    expect(corner(container).classList).not.toContain('compact');
    const app = container.querySelector<HTMLElement>('.app')!;
    expect(app.style.getPropertyValue('--controls-bottom')).toBe(`${TABLE_EDGE_BOTTOM}px`);
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
