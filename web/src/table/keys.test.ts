import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { freeSlot } from './keys';
import { openModal } from '../components/modal.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView, Size, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01010': [{ name: 'Giant form', size: 'dstd' }],
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

/** Rhino with Alex (p0, the viewer) alone. */
function makeView(extra: Partial<View> & { cards?: TableCard[] } = {}): View {
  const { cards: extraCards, ...rest } = extra;
  const cards = extraCards ?? [
    card('mine', { x: 280, tokens: { dmg: 2 } }),
    card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain' }),
    card('h', { zone: 'hand', area: undefined }),
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
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: [
        pile('deck:p0', { owner: 0, area: 'p0', x: 0 }),
        pile('enc', { kind: 'encounter', x: 500, count: 20 }),
      ],
      hand: ['h'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
    ...rest,
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

function inHand(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.hand [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} in the hand`);
  }
  return element;
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

function press(key: string, extra: Partial<KeyboardEventInit> = {}) {
  return fireEvent.keyDown(window, { key, ...extra });
}

function zoomLabel(): string | null {
  return screen.getByRole('button', { name: 'Back to 100%' }).textContent?.trim() ?? null;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadAllCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(cardByCode).mockReset();
  interaction.reset();
  document.body.replaceChildren();
});

describe('keys on the table', () => {
  it('E on hovered card exhausts', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('e');
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' });
  });

  it('keys act on the hovered element only, whatever their case', async () => {
    const { session } = await renderTable();
    await press('e');
    expect(session.act).not.toHaveBeenCalled();

    await fireEvent.pointerEnter(placed('mine'));
    // Caps Lock: an upper-case key without Shift.
    await press('E');
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' });
  });

  it('shift+D removes damage', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('D', { shiftKey: true });
    expect(session.act).toHaveBeenCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: -1,
    });
  });

  it('D adds damage; Shift takes nothing from a card that has none', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('d');
    expect(session.act).toHaveBeenCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: 1,
    });
    session.act.mockClear();

    await press('S', { shiftKey: true });
    await press('T', { shiftKey: true });
    // Shift with a key that is not a token or a status does nothing.
    await press('E', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();
  });

  it('menu items answer to their keys', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await press('h');
    expect(session.act).toHaveBeenCalledWith({ kind: 'toHand', card: 'mine' });

    await fireEvent.pointerEnter(placed('deck:p0'));
    await press('u');
    expect(session.act).toHaveBeenCalledWith({ kind: 'shuffle', pile: 'deck:p0' });

    await press('l');
    expect(screen.getByRole('dialog', { name: 'Look at the top cards' })).toBeTruthy();
  });

  it('A starts an arrow from the hovered card', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('a');
    expect(interaction.arrowFrom).toBe('mine');
  });

  it('disabled items do nothing, nor do the items of a disabled dropdown', async () => {
    const cards = [
      // The villain card is tucked under 'host': Discard and Move to ▾ (and its Hand) are disabled.
      card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain', parent: 'host' }),
      card('host', { area: 'villain', x: 200 }),
      // Reveal is disabled while a card is revealed on the encounter deck.
      card('shown', { owner: -1, area: 'villain', x: 500, onPile: 'enc' }),
    ];
    const { session } = await renderTable(makeView({ cards }));

    await fireEvent.pointerEnter(placed('enc'));
    await press('r');
    await fireEvent.pointerEnter(placed('host'));
    await press('x');
    await press('h');
    expect(session.act).not.toHaveBeenCalled();
  });

  it('Z sends undo', async () => {
    const { session, rerender } = await renderTable(makeView({ canUndo: false }));
    await press('z');
    expect(session.act).not.toHaveBeenCalled();

    await rerender({ view: makeView({ canUndo: true }) });
    await press('Z', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();
    await press('z');
    expect(session.act).toHaveBeenCalledWith({ kind: 'undo' });
  });

  it('keys ignored in inputs', async () => {
    const { session } = await renderTable(makeView({ canUndo: true }));
    await fireEvent.pointerEnter(placed('mine'));

    for (const tag of ['input', 'textarea', 'select']) {
      const field = document.body.appendChild(document.createElement(tag));
      field.focus();
      await fireEvent.keyDown(field, { key: 'e' });
      await fireEvent.keyDown(field, { key: 'z' });
      await fireEvent.keyDown(field, { key: '+' });
      field.remove();
    }
    expect(session.act).not.toHaveBeenCalled();
    expect(zoomLabel()).toBe('100%');
  });

  it('keys ignored while a dialog is open', async () => {
    const { session } = await renderTable(makeView({ canUndo: true }));
    await fireEvent.pointerEnter(placed('mine'));

    const close = openModal();
    await press('e');
    await press('z');
    await press('+');
    await press('Escape');
    close();
    expect(session.act).not.toHaveBeenCalled();
    expect(zoomLabel()).toBe('100%');
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
  });

  it('no key acts with ⌘ or Ctrl held: those are browser shortcuts', async () => {
    const { session } = await renderTable(makeView({ canUndo: true }));
    await fireEvent.pointerEnter(placed('mine'));

    await press('c', { metaKey: true });
    await press('c', { ctrlKey: true });
    await press('z', { metaKey: true });
    await press('+', { ctrlKey: true });
    await press('0', { metaKey: true });
    expect(session.act).not.toHaveBeenCalled();
    expect(zoomLabel()).toBe('100%');
  });

  it('+, − and 0 zoom', async () => {
    await renderTable();
    await press('+');
    await press('=');
    expect(zoomLabel()).toBe('120%');
    await press('-');
    expect(zoomLabel()).toBe('110%');
    await press('0');
    expect(zoomLabel()).toBe('100%');
    await press('_');
    expect(zoomLabel()).toBe('90%');
  });

  it('a spectator zooms with the keys, and nothing else', async () => {
    const view = makeView({
      you: { role: 'spectator', name: 'Kim', color: -1, host: false },
      canUndo: true,
    });
    const { session } = await renderTable(view);
    await fireEvent.pointerEnter(placed('mine'));

    await press('e');
    await press('z');
    await press('+');
    expect(session.act).not.toHaveBeenCalled();
    expect(zoomLabel()).toBe('110%');
  });
});

describe('held keys', () => {
  it('a held key repeats only the counters and the zoom', async () => {
    const view = makeView({ canUndo: true });
    const { session } = await renderTable(view);
    await fireEvent.pointerEnter(placed('mine'));

    await press('e', { repeat: true });
    await press('z', { repeat: true });
    expect(session.act).not.toHaveBeenCalled();

    await press('d', { repeat: true });
    expect(session.act).toHaveBeenLastCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: 1,
    });
    await press('D', { shiftKey: true, repeat: true });
    expect(session.act).toHaveBeenLastCalledWith({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: -1,
    });
    expect(session.act).toHaveBeenCalledTimes(2);

    await press('+', { repeat: true });
    await press('+', { repeat: true });
    expect(zoomLabel()).toBe('120%');
  });

  it('a held key plays or discards a hand card once', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(inHand('h'));

    await press('p', { repeat: true });
    await press('x', { repeat: true });
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('Escape', () => {
  it('acts even while a field has the focus', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await press('a');
    expect(interaction.arrowFrom).toBe('mine');

    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(interaction.arrowFrom).toBeNull();
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(interaction.hovered).toBeNull();
  });
});

describe('keys on a hand card', () => {
  it('P plays to a free slot', async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain' }),
      // 280–380 takes the slot at 280; a double-size card at 390–530 the one at 420.
      card('a', { x: 280 }),
      card('b', { code: '01010', x: 390 }),
      // Below the top row, or in another area: not in the way.
      card('low', { x: 560, y: 140 }),
      card('there', { area: 'villain', x: 560 }),
      card('h', { zone: 'hand', area: undefined }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    await fireEvent.pointerEnter(inHand('h'));

    await press('p');
    expect(session.act).toHaveBeenCalledWith({
      kind: 'play',
      card: 'h',
      area: 'p0',
      x: 560,
      y: 0,
    });
  });

  it('X discards a hand card', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(inHand('h'));

    await press('x');
    expect(session.act).toHaveBeenCalledWith({ kind: 'discard', card: 'h' });
  });

  it('other keys do nothing on a hand card', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(inHand('h'));

    await press('e');
    await press('P', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('freeSlot', () => {
  const sizeOf = (c: TableCard): Size => (c.code === '01010' ? 'dstd' : 'std');
  const deck = pile('deck:p0', { owner: 0, area: 'p0', x: 0 });
  const discard = pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', x: 120 });

  it('starts at 280, past the deck and the discard pile', () => {
    expect(freeSlot([], [deck, discard], 'p0', sizeOf)).toEqual({ x: 280, y: 0 });
  });

  it('steps by 140, keeping 20 free on each side of a 100-wide card', () => {
    // 280 needs 260–400 free: a card from 390 is in the way, and its right edge (490) blocks 420.
    expect(freeSlot([card('a', { x: 390 })], [], 'p0', sizeOf)).toEqual({ x: 560, y: 0 });
    // A card from 400 leaves 280 free; one ending at 400 leaves 420 free.
    expect(freeSlot([card('a', { x: 400 })], [], 'p0', sizeOf)).toEqual({ x: 280, y: 0 });
    expect(freeSlot([card('a', { x: 300 })], [], 'p0', sizeOf)).toEqual({ x: 420, y: 0 });
  });

  it('counts the visible width of a card: double size, face down, tilted when exhausted', () => {
    // Double size, 140 wide: 300–440 blocks 420.
    expect(freeSlot([card('a', { code: '01010', x: 300 })], [], 'p0', sizeOf)).toEqual({
      x: 560,
      y: 0,
    });
    // Face down, it is 100 wide again.
    const faceDown = card('a', { code: '01010', faceDown: true, x: 300 });
    expect(freeSlot([faceDown], [], 'p0', sizeOf)).toEqual({ x: 420, y: 0 });
    // Exhausted, it turns 15°: its bounding box reaches past 400.
    const exhausted = card('a', { x: 300, exhausted: true });
    expect(freeSlot([exhausted], [], 'p0', sizeOf)).toEqual({ x: 560, y: 0 });
  });

  it('a pile in play is in the way; a victory or set-aside pile is not', () => {
    const inPlay = pile('deck:p0', { owner: 0, area: 'p0', x: 300 });
    expect(freeSlot([], [inPlay], 'p0', sizeOf)).toEqual({ x: 420, y: 0 });
    // Out-of-play piles are drawn at the right end of the zone, wherever the server put them.
    const aside = pile('aside:p0', { kind: 'aside', owner: 0, area: 'p0', x: 280 });
    const victory = pile('vic', { kind: 'victory', area: 'p0', x: 280 });
    expect(freeSlot([], [aside, victory], 'p0', sizeOf)).toEqual({ x: 280, y: 0 });
  });

  it('only the top row of the area counts', () => {
    const cards = [card('low', { x: 280, y: 140 }), card('there', { area: 'p1', x: 280 })];
    const piles = [pile('deck:p1', { owner: 1, area: 'p1', x: 280 })];
    expect(freeSlot(cards, piles, 'p0', sizeOf)).toEqual({ x: 280, y: 0 });
  });
});
