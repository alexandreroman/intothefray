// The table in touch mode (spec 3.1 and 3.3): a tap opens the inspector, a bottom sheet, in place of
// the context menu; Select enters select mode; two fingers zoom the table.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { DESKTOP, mockScreen } from '../lib/screen.testing';
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

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Add one/ }));
    // What the token pill's + sends.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'token', card: 'mine', name: 'dmg', delta: 1 },
      0,
    );
    expect(sheet()).not.toBeNull();
  });

  it('opens on a tap on a card of the raised hand, with Play (hand_tap_opens_sheet)', async () => {
    mockScreen({ ...DESKTOP, touch: true });
    const { session } = await renderTable();
    const hand = screen.getByRole('list', { name: 'Your hand' });
    const hcard = document.querySelector<HTMLElement>('.hand [data-id="h"]')!;

    // The first tap raises the hand, the next one opens its card.
    await tap(hcard);
    expect(hand.classList).toContain('open');
    expect(sheet()).toBeNull();
    await tap(hcard);
    expect(sheet()).not.toBeNull();
    expect(interaction.isLocked({ kind: 'hand', id: 'h' })).toBe(false);

    await fireEvent.click(within(sheet()!).getByRole('button', { name: /^Play/ }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h' }),
      0,
    );
    expect(sheet()).toBeNull();
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
