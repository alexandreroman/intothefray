// The hover of the table's cards, piles and hand cards: what the keys act on,
// the side preview, and the − / + pill of a token or status.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction, LINGER_MS } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView, PresenceState, View } from '../lib/types';

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
    card('mine', { x: 0 }),
    card('two', { code: '01002', x: 200 }),
    card('v', { code: '01094', owner: -1, back: 'villain' }),
    card('theirs', { owner: 1 }),
    card('h', { zone: 'hand' }),
  ];
  const piles = extra.piles ?? [
    pile('deck:p0', { owner: 0, x: 600 }),
    pile('deck:p1', { owner: 1, x: 600 }),
    pile('enc', { kind: 'encounter', x: 500, count: 20 }),
    pile('disc:p0', { kind: 'discard', owner: 0, x: 720, count: 1, cards: ['mine'] }),
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

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await screen.findByRole('img', { name: 'Rhino' });
  return { session, ...result };
}

/** The preview floating over the table: only there while something is previewed. */
function preview(): HTMLElement {
  return screen.getByLabelText('Card preview');
}

function noPreview(): boolean {
  return screen.queryByLabelText('Card preview') === null;
}

/** The context menu of a table card or pile, if open. */
function contextMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.table-menu.context');
}

/**
 * A tap, as a finger makes it: it enters each element it lands in, outermost
 * first (a card, then its token), presses, lets go and clicks the innermost,
 * then leaves them all as it lifts.
 */
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

describe('hovering the table', () => {
  it('the hover and the preview linger 100 ms after the pointer leaves', async () => {
    await renderTable();
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerLeave(placed('mine'));

    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
    await vi.advanceTimersByTimeAsync(1);
    expect(interaction.hovered).toBeNull();
    expect(noPreview()).toBe(true);
  });

  it('the keys act on the hovered card, and a hand card gets no menu', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.keyDown(window, { key: 'e' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'exhaust', card: 'mine' }, 0);

    const hand = within(screen.getByRole('list', { name: 'Your hand' })).getByRole('listitem');
    await fireEvent.pointerEnter(hand);
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h' });
    await fireEvent.click(hand);
    expect(interaction.contextMenu).toBeNull();
  });

  it('a tap selects a hand card on touch, and a tap on the table lets go of it', async () => {
    await renderTable();
    const hcard = document.querySelector<HTMLElement>('.hand [data-id="h"]')!;
    await fireEvent.pointerDown(hcard, { pointerType: 'touch' });
    await fireEvent.click(hcard);
    expect(interaction.isLocked({ kind: 'hand', id: 'h' })).toBe(true);

    // The hand lets taps through (pointer-events: none): around its cards, they land on the table.
    const scroller = placed('mine').closest<HTMLElement>('.tablewrap')!;
    await fireEvent.pointerDown(scroller, { pointerType: 'touch' });
    expect(interaction.locked).toBe(false);
    expect(interaction.hovered).toBeNull();
  });

  it('keeps the hover of an element through a redraw that keeps it, drops it once it leaves', async () => {
    const { rerender } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await rerender({ view: makeView() });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    const view = makeView();
    view.table!.cards = view.table!.cards.filter((c) => c.id !== 'mine');
    await rerender({ view });
    expect(interaction.hovered).toBeNull();
  });

  it('ignores the pointerenter a redraw fires under a resting pointer', async () => {
    const { rerender } = await renderTable();
    await fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    await fireEvent.pointerEnter(placed('mine'), { clientX: 40, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    // The redraw leaves "mine" under the pointer: it stays hovered. "two" lies just to its right.
    vi.spyOn(document, 'elementFromPoint').mockImplementation((x) =>
      placed(x <= 40 ? 'mine' : 'two'),
    );
    await rerender({ view: makeView() });
    await fireEvent.pointerEnter(placed('two'), { clientX: 40, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    await fireEvent.pointerMove(window, { clientX: 41, clientY: 60 });
    await fireEvent.pointerEnter(placed('two'), { clientX: 41, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'two' });
  });

  it('ignores the pointerenter a zoom fires under a resting pointer', async () => {
    await renderTable();
    await fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await fireEvent.pointerEnter(placed('mine'), { clientX: 40, clientY: 60 });
    expect(interaction.hovered).toBeNull();

    await fireEvent.pointerEnter(placed('mine'), { clientX: 41, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
  });
});

describe('a tap on touch', () => {
  it('previews a card in play and opens its menu, both staying once the finger lifts', async () => {
    await renderTable();
    vi.useFakeTimers();
    await tap(placed('two'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(interaction.contextMenu?.element).toEqual({ kind: 'card', id: 'two' });
    expect(contextMenu()).not.toBeNull();
    expect(within(preview()).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
  });

  it('moves the preview to the next card tapped while a menu is open, with the menu', async () => {
    await renderTable();
    await tap(placed('two'));

    // The open menu holds the hover: entering the next card changes nothing until its tap opens it.
    await tap(placed('mine'));
    expect(interaction.contextMenu?.element).toEqual({ kind: 'card', id: 'mine' });
    expect(within(preview()).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
  });

  it("previews a pile's top card, and no deck's back, as its menu opens", async () => {
    await renderTable();
    await tap(placed('disc:p0'));
    expect(interaction.contextMenu?.element).toEqual({ kind: 'pile', id: 'disc:p0' });
    expect(within(preview()).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();

    await tap(placed('deck:p0'));
    expect(interaction.contextMenu?.element).toEqual({ kind: 'pile', id: 'deck:p0' });
    expect(noPreview()).toBe(true);
  });
});

describe('pile preview', () => {
  it('a deck, which shows its back, has no preview; a pile listing its cards shows its top', async () => {
    await renderTable();

    await fireEvent.pointerEnter(placed('two'));
    expect(within(preview()).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    await fireEvent.pointerEnter(placed('deck:p0'));
    expect(noPreview()).toBe(true);

    await fireEvent.pointerEnter(placed('disc:p0'));
    expect(within(preview()).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
  });

  it("another player's deck clears the preview", async () => {
    await renderTable();

    await fireEvent.pointerEnter(placed('two'));
    await fireEvent.pointerEnter(placed('deck:p1'));
    expect(noPreview()).toBe(true);
  });
});

describe('tokens and statuses', () => {
  const others = [
    card('v', { code: '01094', owner: -1, back: 'villain' }),
    card('theirs', { owner: 1 }),
  ];

  function viewWithCounters(tokens = { dmg: 2 }, status: Record<string, number> = { stunned: 1 }) {
    return makeView({ cards: [card('mine', { tokens, status }), ...others] });
  }

  function counter(id: string, name: string): HTMLElement {
    const element = placed(id).querySelector<HTMLElement>(`[data-counter="${name}"]`);
    if (!element) {
      throw new Error(`no ${name} on ${id}`);
    }
    return element;
  }

  function pill(): HTMLElement | null {
    return screen.queryByRole('group', { name: /^Change / });
  }

  it('pill minus sends delta -1', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    expect(pill()).toBeNull();

    await fireEvent.pointerEnter(counter('mine', 'token:dmg'));
    const shown = pill()!;
    expect(shown.textContent).toContain('2');
    await fireEvent.click(within(shown).getByRole('button', { name: 'Remove 1' }));
    expect(session.act).toHaveBeenCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: -1,
      },
      0,
    );

    await fireEvent.click(within(shown).getByRole('button', { name: 'Add 1' }));
    expect(session.act).toHaveBeenLastCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: 1,
      },
      0,
    );
  });

  it('a status pill sends status actions', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerEnter(counter('mine', 'status:stunned'));

    await fireEvent.click(within(pill()!).getByRole('button', { name: 'Add 1' }));
    expect(session.act).toHaveBeenCalledWith(
      {
        kind: 'status',
        card: 'mine',
        name: 'stunned',
        delta: 1,
      },
      0,
    );
  });

  it('the pill follows its token through redraws and hides at zero', async () => {
    const { rerender } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerEnter(counter('mine', 'token:dmg'));

    await rerender({ view: viewWithCounters({ dmg: 5 }) });
    expect(pill()!.textContent).toContain('5');

    await rerender({ view: viewWithCounters({ dmg: 0 }) });
    expect(pill()).toBeNull();
  });

  it('the pill hides when its card leaves the table', async () => {
    const { rerender } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerEnter(counter('mine', 'token:dmg'));

    await rerender({ view: makeView({ cards: others }) });
    expect(pill()).toBeNull();
  });

  it('a spectator gets no pill', async () => {
    const view = viewWithCounters();
    view.you = { role: 'spectator', name: 'Eve', color: 0, host: false };
    await renderTable(view);

    await fireEvent.pointerEnter(counter('mine', 'token:dmg'));
    expect(pill()).toBeNull();
  });

  it('the hover and the preview stay while the pointer is on the pill', async () => {
    await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    const token = counter('mine', 'token:dmg');
    await fireEvent.pointerEnter(token);

    // Moving from the token onto the pill leaves the token and the card.
    await fireEvent.pointerLeave(token);
    await fireEvent.pointerLeave(placed('mine'));
    await fireEvent.pointerEnter(pill()!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
    expect(within(preview()).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();

    await fireEvent.pointerLeave(pill()!);
    await vi.advanceTimersByTimeAsync(300);
    expect(interaction.hovered).toBeNull();
    expect(noPreview()).toBe(true);
    expect(pill()).toBeNull();
  });

  it('a click on a token or a status opens no menu: hovering it shows the pill', async () => {
    await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    for (const name of ['token:dmg', 'status:stunned']) {
      const target = counter('mine', name);
      await fireEvent.pointerEnter(target);
      await fireEvent.pointerDown(target, { button: 0 });
      await fireEvent.pointerUp(target, { button: 0 });
      await fireEvent.click(target);
      expect(contextMenu()).toBeNull();
      expect(pill()).not.toBeNull();
    }

    // A click on the card itself opens its menu.
    await fireEvent.click(placed('mine'));
    expect(contextMenu()).not.toBeNull();
  });

  it('a tap on a token shows the pill, opens no menu, and the pill stays once the finger lifts', async () => {
    await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await tap(placed('mine'), counter('mine', 'token:dmg'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(pill()?.textContent).toContain('2');
    expect(contextMenu()).toBeNull();
    // Its card stays hovered and previewed with it, touch having no hover to keep them.
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
    expect(within(preview()).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
  });

  it('a tapped pill stays through taps on − and +, and moves to the next token tapped', async () => {
    const { session } = await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await tap(placed('mine'), counter('mine', 'token:dmg'));

    await tap(pill()!, within(pill()!).getByRole('button', { name: 'Add 1' }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'token', card: 'mine', name: 'dmg', delta: 1 },
      0,
    );
    expect(pill()).not.toBeNull();

    await tap(placed('mine'), counter('mine', 'status:stunned'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(interaction.counter).toEqual({ card: 'mine', kind: 'status', name: 'stunned' });
    expect(pill()).not.toBeNull();
  });

  it('a tapped pill goes with a tap elsewhere, and its card with it', async () => {
    await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await tap(placed('mine'), counter('mine', 'token:dmg'));

    // On the same card, off the token: the card's menu opens instead.
    await tap(placed('mine'));
    expect(pill()).toBeNull();
    expect(interaction.contextMenu?.element).toEqual({ kind: 'card', id: 'mine' });
    await fireEvent.keyDown(window, { key: 'Escape' });

    await tap(placed('mine'), counter('mine', 'token:dmg'));
    // Outside the table: the card's hover and preview linger out with the pill.
    await tap(screen.getByRole('button', { name: 'Zoom in' }));
    expect(pill()).toBeNull();
    await vi.advanceTimersByTimeAsync(LINGER_MS);
    expect(interaction.hovered).toBeNull();
    expect(noPreview()).toBe(true);
  });

  it('a tapped pill goes with its token, and its card lingers out with it', async () => {
    const { rerender } = await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await tap(placed('mine'), counter('mine', 'token:dmg'));

    await rerender({ view: viewWithCounters({ dmg: 0 }) });
    expect(pill()).toBeNull();
    await vi.advanceTimersByTimeAsync(LINGER_MS);
    expect(interaction.hovered).toBeNull();
    expect(noPreview()).toBe(true);
  });

  it('Escape lets go of a tapped pill', async () => {
    await renderTable(viewWithCounters());
    await tap(placed('mine'), counter('mine', 'token:dmg'));

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(pill()).toBeNull();
  });

  it('lingers 100 ms after the pointer leaves, and stays while the pointer is on it', async () => {
    await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    const token = counter('mine', 'token:dmg');

    await fireEvent.pointerEnter(token);
    await fireEvent.pointerLeave(token);
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(pill()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(pill()).toBeNull();

    await fireEvent.pointerEnter(token);
    await fireEvent.pointerLeave(token);
    await fireEvent.pointerEnter(pill()!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pill()).not.toBeNull();

    await fireEvent.pointerLeave(pill()!);
    await vi.advanceTimersByTimeAsync(LINGER_MS);
    expect(pill()).toBeNull();
  });
});
