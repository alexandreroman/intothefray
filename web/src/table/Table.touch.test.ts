// The table in touch mode (spec 3.1 and 3.3): a tap opens the inspector, a bottom sheet, in place of
// the context menu; Select enters select mode; two fingers zoom the table.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import tableSource from './Table.svelte?raw';
import { interaction, LANDING_MS } from './interaction.svelte';
import {
  DESKTOP,
  mockScreen,
  PHONE,
  resizeScreen,
  TABLET,
  type TestScreen,
} from '../lib/screen.testing';
import { HAND_CARD_NARROW, HAND_REST_DROP, handRestDrop, smallHandDrop } from './layout';
import { knownCard, loadGameCards } from '../lib/catalog';
import type { CardView as TableCard, PackFace, View } from '../lib/types';
import { card, fakeSession, infoFrom, pile, placed, playingView, seated } from './fixtures.testing';
import { storedZoom } from './zoom';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01002': [{ name: 'Peter Parker' }, { name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
  '01003': [{ name: 'Web-Shooter' }],
};

const OTHERS: TableCard[] = [
  card('two', { code: '01002', x: 200 }),
  card('v', { code: '01094', owner: -1, back: 'villain' }),
  card('h', { zone: 'hand' }),
];

/** Rhino with Alex (p0, the viewer), a card with a token and a status, and a card in Alex's hand. */
function makeView(
  cards: TableCard[] = [card('mine', { tokens: { dmg: 2 }, status: { stunned: 1 } }), ...OTHERS],
): View {
  return playingView({
    players: [seated('Alex', 0, [{ area: 'p0', heroName: 'Spider-Man', handCount: 1 }], true)],
    table: {
      cards,
      piles: [pile('deck:p0', { owner: 0, x: 600 })],
      hands: { p0: ['h'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
    },
  });
}

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await screen.findByRole('img', { name: 'Rhino' });
  return { session, ...result };
}

/** A tap, as a finger makes it: enters each element, outermost first, presses, lets go and clicks the last. */
async function tap(...entered: HTMLElement[]): Promise<void> {
  const target = entered.at(-1)!;
  const touch = { pointerType: 'touch', clientX: 50, clientY: 50 };
  for (const element of entered) {
    await fireEvent.pointerEnter(element, touch);
  }
  await fireEvent.pointerDown(target, { ...touch, button: 0 });
  await fireEvent.pointerUp(target, { ...touch, button: 0 });
  await fireEvent.click(target, { clientX: 50, clientY: 50 });
  for (const element of [...entered].reverse()) {
    await fireEvent.pointerLeave(element, touch);
  }
}

/** The inspector, if open. */
function sheet(): HTMLElement | null {
  return screen.queryByRole('dialog');
}

function contextMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.table-menu.context');
}

function tokenPill(): HTMLElement | null {
  return screen.queryByRole('group', { name: /^Change / });
}

function selectPill(): HTMLElement | null {
  return screen.queryByRole('group', { name: 'Select mode' });
}

function counter(id: string, name: string): HTMLElement {
  return placed(id).querySelector<HTMLElement>(`[data-counter="${name}"]`)!;
}

/** Dispatches a touch event on the scroller; jsdom has no Touch, so the touches are plain points. */
function touch(target: EventTarget, type: string, points: { x: number; y: number }[]): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  target.dispatchEvent(event);
}

beforeEach(() => {
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoFrom(FACES));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(loadGameCards).mockReset();
  vi.mocked(knownCard).mockReset();
  interaction.reset();
});

describe('the inspector', () => {
  it('opens on a tap on a card or a pile in touch mode, not the menu (touch_tap_opens_sheet_not_menu)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();

    await tap(placed('two'));
    expect(sheet()).not.toBeNull();
    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    expect(contextMenu()).toBeNull();
    expect(interaction.contextMenu).toBeNull();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(sheet()).toBeNull();

    await tap(placed('deck:p0'));
    expect(sheet()).not.toBeNull();
    expect(contextMenu()).toBeNull();
  });

  it('leaves the context menu to a mouse (mouse_click_opens_menu)', async () => {
    await renderTable();

    await fireEvent.click(placed('two'));

    expect(contextMenu()).not.toBeNull();
    expect(sheet()).toBeNull();
  });

  it('runs a chosen entry on its card and closes', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();
    await tap(placed('two'));

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Exhaust/ }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'two' }, 0);
    expect(sheet()).toBeNull();
  });

  it('opens on a tap on a token, with no pill, and steps its counters (token_tap_opens_sheet)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();

    await tap(placed('mine'), counter('mine', 'token:dmg'));
    expect(sheet()).not.toBeNull();
    expect(tokenPill()).toBeNull();

    // The token on the inspector's card opens its pill.
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Damage/ }));
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Add one/ }));
    // What the token pill's + sends.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'token', card: 'mine', name: 'dmg', delta: 1 },
      0,
    );
    expect(sheet()).not.toBeNull();
  });

  it('stays shut on a tap on a card of the raised hand, which lifts it instead', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();
    const hand = screen.getByRole('list', { name: 'Your hand' });
    const hcard = document.querySelector<HTMLElement>('.hand [data-id="h"]')!;

    // The first tap raises the hand, the next one lifts its card to be read, a third lets it go.
    await tap(hcard);
    expect(hand.classList).toContain('open');
    expect(sheet()).toBeNull();
    await tap(hcard);
    expect(sheet()).toBeNull();
    expect(interaction.isLocked({ kind: 'hand', id: 'h' })).toBe(true);
    await tap(hcard);
    expect(sheet()).toBeNull();
    expect(interaction.isLocked({ kind: 'hand', id: 'h' })).toBe(false);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('closes when its card leaves the table (sheet_closes_when_element_goes)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { rerender } = await renderTable();
    await tap(placed('two'));
    expect(sheet()).not.toBeNull();

    await rerender({
      view: makeView([card('mine'), card('v', { code: '01094', owner: -1, back: 'villain' })]),
    });

    expect(sheet()).toBeNull();
  });
});

describe('select mode', () => {
  it('Select enters it, taps toggle cards in the group, Done leaves it with the group (select_mode)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();
    await tap(placed('mine'));

    await fireEvent.click(within(sheet()!).getByRole('button', { name: 'Select' }));
    expect(sheet()).toBeNull();
    expect(interaction.group).toEqual(new Set(['mine']));
    expect(selectPill()?.textContent).toMatch(/1 selected\s*·\s*Done/);

    await tap(placed('two'));
    expect(sheet()).toBeNull();
    expect(interaction.group).toEqual(new Set(['mine', 'two']));
    expect(selectPill()?.textContent).toMatch(/2 selected/);

    await tap(placed('mine'));
    expect(interaction.group).toEqual(new Set(['two']));

    await fireEvent.click(within(selectPill()!).getByRole('button', { name: 'Done' }));
    expect(selectPill()).toBeNull();
    expect(interaction.group).toEqual(new Set(['two']));

    // Out of select mode, a tap opens the inspector again.
    await tap(placed('two'));
    expect(sheet()).not.toBeNull();
  });

  it('a tap on an empty spot keeps the group', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();
    await tap(placed('mine'));
    await fireEvent.click(within(sheet()!).getByRole('button', { name: 'Select' }));

    await tap(document.querySelector<HTMLElement>('.tablewrap .surface')!);

    expect(interaction.group).toEqual(new Set(['mine']));
    expect(selectPill()).not.toBeNull();
  });

  it('Escape leaves it and keeps the group', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();
    await tap(placed('mine'));
    await fireEvent.click(within(sheet()!).getByRole('button', { name: 'Select' }));

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(selectPill()).toBeNull();
    expect(interaction.group).toEqual(new Set(['mine']));
  });
});

describe("the villain's row on a tablet", () => {
  // An iPad on its side. jsdom's table shows no height, so the rows are drawn as close as they go.
  const IPAD: TestScreen = { width: 1180, height: 820 };

  /** Where a card 30 into player 1's row, at 470, is drawn. */
  async function playerCardTop(): Promise<string | undefined> {
    await renderTable(makeView([card('mine', { y: 470 }), ...OTHERS]));
    return placed('mine').style.top;
  }

  it('is drawn at its full height in touch mode, a row of cards fitting under its own', async () => {
    mockScreen({ ...IPAD, touch: true });
    expect(await playerCardTop()).toBe('470px');
  });

  it('is drawn squeezed to 270 with a mouse on the same screen', async () => {
    mockScreen(IPAD);
    expect(await playerCardTop()).toBe('300px');
  });
});

describe('touch zoom', () => {
  it('a pinch on the table zooms and remembers the zoom (pinch_saves_zoom)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();
    const scroller = document.querySelector<HTMLElement>('.tablewrap')!;

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller, 'touchmove', [
      { x: 75, y: 100 },
      { x: 225, y: 100 },
    ]);

    expect(storedZoom()).toBe(1.5);
  });

  it('a pinch does nothing with a mouse for main pointer', async () => {
    await renderTable();
    const scroller = document.querySelector<HTMLElement>('.tablewrap')!;

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller, 'touchmove', [
      { x: 75, y: 100 },
      { x: 225, y: 100 },
    ]);

    expect(storedZoom()).toBeNull();
  });
});

describe('the inspector, adding tokens, statuses and modifiers (F-U6)', () => {
  it.each([
    ['tokens', /^Damage/, { kind: 'token', card: 'two', name: 'dmg', delta: 1 }],
    ['statuses', /^Confused/, { kind: 'status', card: 'two', name: 'confused', delta: 1 }],
    ['modifiers', /^\+1 ATK/, { kind: 'modifier', card: 'two', name: 'atk', delta: 1 }],
  ])('stays open after an entry of the %s submenu runs', async (submenu, entry, action) => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();
    await tap(placed('two'));

    await fireEvent.click(sheet()!.querySelector<HTMLElement>(`[data-submenu="${submenu}"]`)!);
    await fireEvent.click(within(sheet()!).getByRole('button', { name: entry }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith(action, 0);
    expect(sheet()).not.toBeNull();
  });

  it('stays open after a step in a token pill, and closes after any other entry', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();
    await tap(placed('mine'));

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Damage/ }));
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Remove one/ }));
    expect(session.act).toHaveBeenCalledOnce();
    expect(sheet()).not.toBeNull();

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Exhaust/ }));
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'exhaust', card: 'mine' }, 0);
    expect(sheet()).toBeNull();
  });
});

describe('arrows on touch', () => {
  it('never shows the arrow hint after a tap on a card', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable();

    await tap(placed('two'));

    expect(interaction.arrowFrom).toBeNull();
    expect(document.querySelector('.arrowhint')).toBeNull();
  });

  it('has no hint of its own for touch in the table', () => {
    expect(tableSource).not.toMatch(/ARROW_HINT_TOUCH|Tap the card to point at/);
  });
});

describe('the inspector, revealing a card from a deck (F-U8)', () => {
  // Rhino with Alex, the viewer's deck and the encounter deck; `revealed` lies on one of them.
  function revealView(revealed: TableCard[] = []): View {
    return playingView({
      players: [seated('Alex', 0, [{ area: 'p0', heroName: 'Spider-Man' }], true)],
      table: {
        cards: [card('v', { code: '01094', owner: -1, back: 'villain' }), ...revealed],
        piles: [
          pile('deck:p0', { owner: 0, x: 600 }),
          pile('enc', { kind: 'encounter', count: 20, x: 900 }),
        ],
        hands: { p0: [] },
        stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      },
    });
  }

  const ON_ENCOUNTER = card('enc-rev', {
    code: '01002',
    owner: -1,
    back: 'encounter',
    onPile: 'enc',
    x: 900,
  });
  const ON_OWN_DECK = card('own-rev', { code: '01002', onPile: 'deck:p0', x: 600 });

  async function revealFrom(pileId: string) {
    mockScreen({ ...DESKTOP, touch: true });
    const rendered = await renderTable(revealView());
    await tap(placed(pileId));
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Reveal/ }));
    return rendered;
  }

  it('stays open on the encounter deck, then shows the card revealed there', async () => {
    const { session, rerender } = await revealFrom('enc');

    expect(session.act).toHaveBeenCalledOnce();
    expect(session.act.mock.calls[0]![0]).toEqual({ kind: 'reveal' });
    expect(sheet()).not.toBeNull();

    await rerender({ view: revealView([ON_ENCOUNTER]) });

    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    expect(within(sheet()!).getByRole('button', { name: /^Flip/ })).toBeTruthy();
  });

  it('keeps the same sheet as it switches to the revealed card, and opens a new one on another element', async () => {
    const { rerender } = await revealFrom('enc');
    const opened = sheet();

    await rerender({ view: revealView([ON_ENCOUNTER]) });

    expect(sheet()).toBe(opened);
    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tap(placed('deck:p0'));
    expect(sheet()).not.toBeNull();
    expect(sheet()).not.toBe(opened);
  });

  it("stays open on the viewer's deck, then shows the revealed card with its Draw", async () => {
    const { session, rerender } = await revealFrom('deck:p0');

    expect(session.act.mock.calls[0]![0]).toEqual({ kind: 'reveal', pile: 'deck:p0' });
    expect(sheet()).not.toBeNull();

    await rerender({ view: revealView([ON_OWN_DECK]) });

    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    expect(within(sheet()!).getByRole('button', { name: /^Draw/ })).toBeTruthy();
    expect(within(sheet()!).queryByRole('button', { name: /^Reveal/ })).toBeNull();
  });

  it("draws the revealed card's entries in the update that shows it, none of the deck's leaving", async () => {
    // jsdom has no Web Animations: with animations that never end, a row that slides or fades out
    // stays in the DOM, as it does on screen while it leaves.
    const originalAnimate = Element.prototype.animate;
    const animate = vi.fn(() => ({ onfinish: null, cancel: () => {}, effect: null }));
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const { rerender } = await revealFrom('enc');
      expect(within(sheet()!).getByRole('button', { name: /^Top X/ })).toBeTruthy();

      await rerender({ view: revealView([ON_ENCOUNTER]) });

      expect(within(sheet()!).getByRole('button', { name: /^Flip/ })).toBeTruthy();
      const deckEntries = [/^Reveal/, /^Top X/, /^Search/, /^Discard 1/, /^Discard X/, /^Shuffle/];
      for (const deckEntry of deckEntries) {
        expect(within(sheet()!).queryByRole('button', { name: deckEntry })).toBeNull();
      }
    } finally {
      Element.prototype.animate = originalAnimate;
    }
  });

  it('stays on the deck when the server refuses the reveal', async () => {
    const { session, rerender } = await revealFrom('enc');

    session.lastError = { id: 1, code: 'invalid', message: 'Nothing to reveal.' };
    // A later view shows a card revealed there all the same: it is not the answer to this reveal.
    await rerender({ view: revealView([ON_ENCOUNTER]) });

    expect(sheet()).not.toBeNull();
    expect(within(sheet()!).queryByRole('img', { name: 'Peter Parker' })).toBeNull();
  });

  it('stays on the deck when nothing is revealed within the landing time', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { rerender } = await renderTable(revealView());
    await tap(placed('enc'));
    vi.useFakeTimers();
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Reveal/ }));

    vi.advanceTimersByTime(LANDING_MS);
    await rerender({ view: revealView([ON_ENCOUNTER]) });

    expect(sheet()).not.toBeNull();
    expect(within(sheet()!).queryByRole('img', { name: 'Peter Parker' })).toBeNull();
  });

  it('leaves the mouse menu closing on Reveal', async () => {
    const { session } = await renderTable(revealView());

    await fireEvent.click(placed('enc'));
    await fireEvent.click(within(contextMenu()!).getByRole('menuitem', { name: /^Reveal/ }));

    expect(session.act.mock.calls[0]![0]).toEqual({ kind: 'reveal' });
    expect(contextMenu()).toBeNull();
    expect(sheet()).toBeNull();
  });
});

describe('the inspector, flipping a card (F-U9)', () => {
  it('stays open on Flip, on the same sheet, which shows the face the view turns the card to', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session, rerender } = await renderTable();
    await tap(placed('two'));
    const opened = sheet();

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Flip/ }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'flip', card: 'two' }, 0);
    expect(sheet()).toBe(opened);

    await rerender({
      view: makeView([
        card('mine'),
        card('two', { code: '01002', x: 200, face: 1 }),
        ...OTHERS.slice(1),
      ]),
    });

    expect(sheet()).toBe(opened);
    expect(within(sheet()!).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
  });

  it("stays open on a stage card's Flip", async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const session = fakeSession();
    const view = playingView({
      players: [seated('Alex', 0, [{ area: 'p0', heroName: 'Spider-Man' }], true)],
      table: {
        cards: [card('v', { code: '01002', owner: -1, back: 'villain' })],
        piles: [],
        hands: { p0: [] },
        stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      },
    });
    render(Table, { session, view });
    await screen.findByRole('img', { name: 'Peter Parker' });
    await tap(placed('v'));

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Flip/ }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'chooseStage', stage: 'villain', card: 'v', face: 1 },
      0,
    );
    expect(sheet()).not.toBeNull();
  });

  it('closes as a card revealed on a deck goes back into it, turned face down', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const revealed = card('rev', { code: '01002', onPile: 'deck:p0', x: 600 });
    const { session, rerender } = await renderTable(makeView([revealed, ...OTHERS]));
    await tap(placed('rev'));

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Flip/ }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'flip', card: 'rev' }, 0);
    expect(sheet()).not.toBeNull();

    await rerender({ view: makeView([...OTHERS]) });
    expect(sheet()).toBeNull();
  });

  it('leaves the mouse menu closing on Flip', async () => {
    const { session } = await renderTable();

    await fireEvent.click(placed('two'));
    await fireEvent.click(within(contextMenu()!).getByRole('menuitem', { name: /^Flip/ }));

    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'flip', card: 'two' }, 0);
    expect(contextMenu()).toBeNull();
    expect(sheet()).toBeNull();
  });
});

describe('the inspector, a stack of cards (F-U15)', () => {
  // Spider-Man with Peter Parker tucked under it, and a Web-Shooter under Peter Parker.
  const STACKED: TableCard[] = [
    card('host', { x: 100, y: 100 }),
    card('t1', { code: '01002', parent: 'host', x: 110, y: 120 }),
    card('t2', { code: '01003', parent: 't1', x: 120, y: 140 }),
    ...OTHERS,
  ];

  function carousel(): HTMLElement | null {
    return within(sheet()!).queryByRole('group', { name: 'Attached cards' });
  }

  /** The cards of the carousel, in order: the centred one marked current. */
  function slides(): HTMLElement[] {
    return [...carousel()!.querySelectorAll<HTMLElement>('.slide')];
  }

  function centred(): string | undefined {
    return slides().find((slide) => slide.getAttribute('aria-current') === 'true')?.dataset.id;
  }

  /** The neighbour of that name, which a tap centres. */
  function peek(name: string): HTMLElement {
    return within(carousel()!).getByRole('button', { name });
  }

  it('shows the stack of the main card in a carousel, the main card centred', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable(makeView(STACKED));

    await tap(placed('host'));

    expect(slides().map((slide) => slide.dataset.id)).toEqual(['host', 't1', 't2']);
    expect(centred()).toBe('host');
    expect(within(carousel()!).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
    expect(peek('Peter Parker')).toBeTruthy();
    expect(peek('Web-Shooter')).toBeTruthy();
  });

  it('switches to a tucked card in the same sheet, its carousel kept, sending nothing', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable(makeView(STACKED));
    await tap(placed('host'));
    const opened = sheet();

    await fireEvent.click(peek('Peter Parker'));

    expect(sheet()).toBe(opened);
    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    expect(slides()).toHaveLength(3);
    expect(centred()).toBe('t1');
    expect(session.act).not.toHaveBeenCalled();

    // Its entries are the tucked card's: Flip sends its own flip.
    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Flip/ }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'flip', card: 't1' }, 0);
  });

  it('draws each neighbour with its own tokens', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const damaged = STACKED.map((c) => (c.id === 't1' ? { ...c, tokens: { dmg: 2 } } : c));
    await renderTable(makeView(damaged));

    await tap(placed('host'));

    const disc = peek('Peter Parker').querySelector('[data-counter="token:dmg"]');
    expect(disc?.textContent).toBe('2');
    expect(peek('Web-Shooter').querySelector('[data-counter]')).toBeNull();
  });

  it('shows the same stack from a tucked card, centred on it', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable(makeView(STACKED));

    await tap(placed('t2'));

    expect(slides()).toHaveLength(3);
    expect(centred()).toBe('t2');
  });

  it('shows the card alone for a card on its own, or a pile', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    await renderTable(makeView(STACKED));

    await tap(placed('two'));
    expect(carousel()).toBeNull();
    expect(within(sheet()!).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tap(placed('deck:p0'));
    expect(carousel()).toBeNull();
  });
});

// A tablet upright with a finger (iPad Air): narrow, so without the history column, but no phone.
const TOUCH_TABLET: TestScreen = { width: 820, height: 1180, touch: true };

describe('a tablet without the history column (spec 2.2)', () => {
  /** The bottom right corner's History button, if it shows. */
  function cornerHistory(): HTMLElement | null {
    const corner = document.querySelector<HTMLElement>('.corner');
    return corner ? within(corner).queryByRole('button', { name: 'History' }) : null;
  }

  it('shows History beside the floating Undo, which opens the history sheet', async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable();

    const undo = screen.getByRole('button', { name: 'Undo last action' });
    const history = cornerHistory();
    expect(history).not.toBeNull();
    expect(history!.dataset.tip).toBe('History');
    // In Undo's bar, right after it.
    expect(undo.nextElementSibling).toBe(history);
    expect(screen.queryByRole('dialog', { name: 'History' })).toBeNull();

    await fireEvent.click(history!);

    expect(screen.getByRole('dialog', { name: 'History' })).toBeTruthy();
  });

  it('closes the history sheet once the history column shows', async () => {
    const lists = mockScreen(TOUCH_TABLET);
    await renderTable();
    await fireEvent.click(cornerHistory()!);

    await resizeScreen(lists, { ...DESKTOP, touch: true });

    expect(screen.queryByRole('dialog', { name: 'History' })).toBeNull();
    expect(cornerHistory()).toBeNull();
  });

  it('keeps the corner without History in a narrow mouse window, and in dock mode', async () => {
    mockScreen(TABLET);
    const { unmount } = await renderTable();
    expect(screen.getByRole('button', { name: 'Undo last action' })).toBeTruthy();
    expect(cornerHistory()).toBeNull();
    unmount();

    // A phone: the dock has History, and there is no corner.
    mockScreen(PHONE);
    await renderTable();
    expect(document.querySelector('.corner')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'History' })).toHaveLength(1);
  });
});

describe('the resting hand on a narrow touch screen (spec 2.3)', () => {
  function hand(): HTMLElement {
    return screen.getByRole('list', { name: 'Your hand' });
  }

  /** The raised card the hand is drawn from, which its rest drop is measured against. */
  function raisedCard(): { w: number; h: number } {
    return {
      w: Number.parseFloat(hand().style.getPropertyValue('--card-w')),
      h: Number.parseFloat(hand().style.getPropertyValue('--card-h')),
    };
  }

  it('drops the narrow card by the share a wide screen drops its card, for a finger to tap', async () => {
    mockScreen(TOUCH_TABLET);
    await renderTable();

    // 196 × 140 / 259 ≈ 106 px down, so that about 70 px of the cards show.
    expect(smallHandDrop(HAND_CARD_NARROW.h)).toBe(106);
    expect(hand().style.getPropertyValue('--rest-drop')).toBe(
      `${handRestDrop(HAND_CARD_NARROW, smallHandDrop(HAND_CARD_NARROW.h), raisedCard())}px`,
    );
  });

  it('keeps the desktop drop in a narrow mouse window', async () => {
    mockScreen(TABLET);
    await renderTable();

    expect(hand().style.getPropertyValue('--rest-drop')).toBe(
      `${handRestDrop(HAND_CARD_NARROW, HAND_REST_DROP, raisedCard())}px`,
    );
  });
});
