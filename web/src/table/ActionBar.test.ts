import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
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
  return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0, pack: 'core' };
}

function card(id: string, extra: Partial<TableCard> = {}): TableCard {
  return {
    id,
    code: '01001',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    area: 'p0',
    x: 0,
    y: 0,
    z: 1,
    ...extra,
  };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 30, ...extra };
}

/** Rhino with Alex (p0, the viewer) and Sam (p1). */
function makeView(extra: { cards?: TableCard[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine', { x: 0 }),
    card('two', { code: '01002', x: 200 }),
    card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain' }),
    card('theirs', { owner: 1, area: 'p1' }),
    card('h', { zone: 'hand', area: undefined }),
  ];
  const piles = extra.piles ?? [
    pile('deck:p0', { owner: 0, area: 'p0', x: 600 }),
    pile('deck:p1', { owner: 1, area: 'p1', x: 600 }),
    pile('enc', { kind: 'encounter', x: 500, count: 20 }),
    pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', x: 720, count: 1, cards: ['mine'] }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        area: 'p0',
        heroName: 'Spider-Man',
        ready: true,
        handCount: 1,
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        area: 'p1',
        heroName: 'Ant-Man',
        ready: true,
        handCount: 0,
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      hand: ['h'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
  };
}

function fakeSession() {
  return { act: vi.fn(() => 1), lobby: vi.fn(() => true) };
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function bar(): HTMLElement | null {
  return screen.queryByRole('toolbar', { name: 'Actions' });
}

function barButtons(): string[] {
  const shown = bar();
  if (!shown) {
    return [];
  }
  return (
    within(shown)
      .getAllByRole('button')
      // Dropdowns end with a caret, which is not part of their name.
      .map(
        (button) =>
          button.getAttribute('aria-label') ?? button.textContent?.replace('▾', '').trim() ?? '',
      )
  );
}

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await within(screen.getByRole('region', { name: /^Villain/ })).findByRole('img', {
    name: 'Rhino',
  });
  return { session, ...result };
}

beforeEach(() => {
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(loadAllCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(cardByCode).mockReset();
  interaction.reset();
});

describe('ActionBar', () => {
  it('hovering a card shows its bar', async () => {
    await renderTable();
    expect(bar()).toBeNull();

    await fireEvent.pointerEnter(placed('mine'));
    expect(barButtons()).toEqual(['Exhaust', 'Arrow', '+ Token', '+ Status', 'Discard', 'Move to']);
    // Groups are separated: Exhaust | Arrow, tokens, statuses | Discard, Move to.
    expect(bar()?.querySelectorAll('.sep')).toHaveLength(2);
    // The name and the key are in the tooltip, never on the button.
    const exhaust = within(bar()!).getByRole('button', { name: 'Exhaust' });
    expect(exhaust.dataset.tip).toBe('Exhaust');
    expect(exhaust.dataset.kbd).toBe('E');
    expect(exhaust.textContent?.trim()).toBe('');
  });

  it('a hand card gets no bar', async () => {
    await renderTable();
    const hand = screen.getByRole('list', { name: 'Your hand' });

    await fireEvent.pointerEnter(within(hand).getByRole('listitem'));
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h' });
    expect(bar()).toBeNull();
  });

  it('bar hides when its element leaves', async () => {
    const { session, rerender } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    const exhaust = within(bar()!).getByRole('button', { name: 'Exhaust' });

    const view = makeView();
    view.table!.cards = view.table!.cards.filter((c) => c.id !== 'mine');
    await rerender({ view });
    expect(bar()).toBeNull();
    expect(interaction.hovered).toBeNull();

    await fireEvent.click(exhaust);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('keeps the bar through a redraw that keeps its element', async () => {
    const { rerender } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await rerender({ view: makeView() });
    expect(barButtons()).toContain('Exhaust');
  });

  it('exhaust button sends exhaust', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Exhaust' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' });
  });

  it('look at top asks count then sends look', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));
    expect(barButtons()).toEqual(['Draw 1', 'Look', 'Deck']);

    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Look' }));
    const menu = screen.getByRole('menu');
    // Items show their key, in grey.
    const lookTop = within(menu).getByRole('menuitem', { name: /Look at top…/ });
    expect(lookTop.querySelector('kbd')?.textContent).toBe('L');

    await fireEvent.click(lookTop);
    expect(screen.queryByRole('menu')).toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Look at the top cards' });
    expect(dialog.textContent).toContain('How many cards from the top of your deck?');
    const value = within(dialog).getByRole('textbox');
    expect((value as HTMLInputElement).value).toBe('5');
    expect(session.act).not.toHaveBeenCalled();

    await fireEvent.click(within(dialog).getByRole('button', { name: 'One more' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Look' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'look', pile: 'deck:p0', n: 6 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('spectator sees no bar', async () => {
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    await renderTable(view);

    await fireEvent.pointerEnter(placed('mine'));
    expect(bar()).toBeNull();
    await fireEvent.pointerEnter(placed('deck:p0'));
    expect(bar()).toBeNull();
  });

  it('bar aligns to the right edge near the right bound', async () => {
    const rect = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('tablewrap')) {
        return rect(0, 50, 1000, 700);
      }
      if (this.classList.contains('actionbar')) {
        return rect(0, 0, 300, 40);
      }
      if (this.dataset.id === 'mine') {
        // Near the right bound: centring the bar would cross it.
        return rect(850, 400, 100, 140);
      }
      return rect(0, 0, 0, 0);
    });
    await renderTable();

    await fireEvent.pointerEnter(placed('mine'));
    // Lined up on the card's right edge.
    await waitFor(() => expect(bar()?.style.left).toBe('650px'));
    // Above the card, 8 px away.
    expect(bar()?.style.top).toBe('352px');
  });

  it('lingers 250 ms after the pointer leaves, and stays while the pointer is on it', async () => {
    await renderTable();
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerLeave(placed('mine'));

    await vi.advanceTimersByTimeAsync(200);
    expect(bar()).not.toBeNull();
    await fireEvent.pointerEnter(bar()!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(bar()).not.toBeNull();

    await fireEvent.pointerLeave(bar()!);
    await vi.advanceTimersByTimeAsync(249);
    expect(bar()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(bar()).toBeNull();
    expect(screen.getByLabelText('Card preview').textContent).toContain('Hover a card');
  });

  it('ignores the pointerenter a redraw fires under a resting pointer', async () => {
    const { rerender } = await renderTable();
    await fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    await fireEvent.pointerEnter(placed('mine'), { clientX: 40, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    await rerender({ view: makeView() });
    await fireEvent.pointerEnter(placed('two'), { clientX: 40, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    await fireEvent.pointerEnter(placed('two'), { clientX: 41, clientY: 60 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'two' });
  });

  it('shows Flip on a card with two faces once the catalog is loaded', async () => {
    let loaded: () => void = () => {};
    vi.mocked(loadAllCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
    // Before the load, the catalog knows nothing.
    vi.mocked(knownCard).mockReturnValue(null);
    render(Table, { session: fakeSession(), view: makeView() });

    await fireEvent.pointerEnter(placed('two'));
    expect(barButtons()).not.toContain('Flip');

    vi.mocked(knownCard).mockImplementation(infoOf);
    loaded();
    await waitFor(() => expect(barButtons()).toContain('Flip'));
  });

  it('dropdowns close on an outside click or Escape', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    const moveTo = within(bar()!).getByRole('button', { name: 'Move to' });

    await fireEvent.click(moveTo);
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Hand' + 'H', 'Top of deck', 'Bottom of deck', 'Shuffle into deck']);
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    await fireEvent.click(moveTo);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    // Escape closed the menu only: the bar is still there.
    expect(bar()).not.toBeNull();
  });

  it('a menu item sends its action', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Move to' }));

    await fireEvent.click(screen.getByRole('menuitem', { name: 'Bottom of deck' }));
    expect(session.act).toHaveBeenCalledWith({ kind: 'toDeck', card: 'mine', where: 'bottom' });
  });

  it('a dropdown removed from under the pointer does not keep the bar', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerLeave(placed('mine'));
    await fireEvent.pointerEnter(bar()!);
    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Move to' }));
    await fireEvent.pointerLeave(bar()!);
    await fireEvent.pointerEnter(screen.getByRole('menu'));

    // The choice closes the menu under the pointer: no pointerleave follows.
    vi.useFakeTimers();
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Bottom of deck' }));
    expect(interaction.onBar).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    expect(bar()).toBeNull();
  });

  it("another player's deck shows whose it is", async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('deck:p1'));

    expect(bar()?.textContent).toBe('Belongs to Sam — only they can use it.');
  });

  it('arrow mode: a click on another card sends the arrow', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Arrow' }));
    expect(bar()?.textContent).toContain('Click the card to point at');

    await fireEvent.pointerDown(placed('v'));
    expect(session.act).toHaveBeenCalledWith({ kind: 'arrowAdd', card: 'mine', target: 'v' });
    expect(interaction.arrowFrom).toBeNull();
  });

  it('arrow mode: Escape or a click on an empty spot cancels', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Arrow' }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(interaction.arrowFrom).toBeNull();

    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.click(within(bar()!).getByRole('button', { name: 'Arrow' }));
    await fireEvent.pointerDown(placed('mine').parentElement as HTMLElement);
    expect(interaction.arrowFrom).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('the stage choice is left to a later box: nothing is sent', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('v'));

    await fireEvent.click(
      within(bar()!).getByRole('button', { name: 'Choose the villain card to show' }),
    );
    expect(session.act).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
  });

  it('a tap selects on touch: the bar stays until a tap on an empty spot', async () => {
    await renderTable();
    vi.useFakeTimers();
    await fireEvent.pointerDown(placed('mine'), { pointerType: 'touch' });
    await fireEvent.click(placed('mine'));
    await fireEvent.pointerLeave(placed('mine'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(bar()).not.toBeNull();
    expect(placed('mine').classList).toContain('locked');
    // Hovering another card changes nothing while a card is selected.
    await fireEvent.pointerEnter(placed('two'));
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });

    await fireEvent.pointerDown(placed('mine').parentElement as HTMLElement, {
      pointerType: 'touch',
    });
    expect(bar()).toBeNull();
    expect(placed('mine').classList).not.toContain('locked');
  });

  it('a click with a mouse selects nothing', async () => {
    await renderTable();
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerDown(placed('mine'), { pointerType: 'mouse' });
    await fireEvent.click(placed('mine'));
    await fireEvent.pointerLeave(placed('mine'));
    await vi.advanceTimersByTimeAsync(250);
    expect(bar()).toBeNull();
  });
});

describe('pile preview', () => {
  it('a deck keeps the preview; a pile listing its cards shows its top', async () => {
    await renderTable();
    const preview = screen.getByLabelText('Card preview');

    await fireEvent.pointerEnter(placed('two'));
    expect(within(preview).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();
    await fireEvent.pointerEnter(placed('deck:p0'));
    expect(within(preview).getByRole('img', { name: 'Peter Parker' })).toBeTruthy();

    await fireEvent.pointerEnter(placed('disc:p0'));
    expect(within(preview).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();
  });

  it("another player's deck clears the preview", async () => {
    await renderTable();
    const preview = screen.getByLabelText('Card preview');

    await fireEvent.pointerEnter(placed('two'));
    await fireEvent.pointerEnter(placed('deck:p1'));
    expect(preview.textContent).toContain('Hover a card');
  });
});

describe('tokens and statuses', () => {
  const others = [
    card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain' }),
    card('theirs', { owner: 1, area: 'p1' }),
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

  it('token menu adds one', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));

    const add = within(bar()!).getByRole('button', { name: '+ Token' });
    // A dashed "+" button: no caret.
    expect(add.classList.contains('add')).toBe(true);
    expect(add.querySelector('.caret')).toBeNull();

    await fireEvent.click(add);
    await fireEvent.click(screen.getByRole('menuitem', { name: /^Damage/ }));
    expect(session.act).toHaveBeenCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: 1,
    });
  });

  it('status menu adds one', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));

    await fireEvent.click(within(bar()!).getByRole('button', { name: '+ Status' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: /^Tough/ }));
    expect(session.act).toHaveBeenCalledWith({
      kind: 'status',
      card: 'mine',
      name: 'tough',
      delta: 1,
    });
  });

  it('pill minus sends delta -1', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    expect(pill()).toBeNull();

    await fireEvent.pointerEnter(counter('mine', 'token:dmg'));
    const shown = pill()!;
    expect(shown.textContent).toContain('2');
    await fireEvent.click(within(shown).getByRole('button', { name: 'Remove 1' }));
    expect(session.act).toHaveBeenCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: -1,
    });

    await fireEvent.click(within(shown).getByRole('button', { name: 'Add 1' }));
    expect(session.act).toHaveBeenLastCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: 1,
    });
  });

  it('a status pill sends status actions', async () => {
    const { session } = await renderTable(viewWithCounters());
    await fireEvent.pointerEnter(placed('mine'));
    await fireEvent.pointerEnter(counter('mine', 'status:stunned'));

    await fireEvent.click(within(pill()!).getByRole('button', { name: 'Add 1' }));
    expect(session.act).toHaveBeenCalledWith({
      kind: 'status',
      card: 'mine',
      name: 'stunned',
      delta: 1,
    });
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

  it('lingers 250 ms after the pointer leaves, and stays while the pointer is on it', async () => {
    await renderTable(viewWithCounters());
    vi.useFakeTimers();
    await fireEvent.pointerEnter(placed('mine'));
    const token = counter('mine', 'token:dmg');

    await fireEvent.pointerEnter(token);
    await fireEvent.pointerLeave(token);
    await vi.advanceTimersByTimeAsync(200);
    expect(pill()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60);
    expect(pill()).toBeNull();

    await fireEvent.pointerEnter(token);
    await fireEvent.pointerLeave(token);
    await fireEvent.pointerEnter(pill()!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pill()).not.toBeNull();

    await fireEvent.pointerLeave(pill()!);
    await vi.advanceTimersByTimeAsync(260);
    expect(pill()).toBeNull();
  });
});
