import { fireEvent, render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { freeSlot } from './keys';
import { openModal } from '../components/modal.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  CardView as TableCard,
  PackFace,
  PileView,
  PresenceState,
  Size,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
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

/** Rhino with Alex (p0, the viewer) alone. */
function makeView(extra: Partial<View> & { cards?: TableCard[] } = {}): View {
  const { cards: extraCards, ...rest } = extra;
  const cards = extraCards ?? [
    card('mine', { x: 280, tokens: { dmg: 2 } }),
    card('v', { code: '01094', owner: -1, back: 'villain' }),
    card('h', { zone: 'hand' }),
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
        pile('deck:p0', { owner: 0, x: 0 }),
        pile('enc', { kind: 'encounter', x: 500, count: 20 }),
      ],
      hand: ['h'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: 40 },
    },
    log: [],
    ...rest,
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
  await screen.findByRole('img', { name: 'Rhino' });
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
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(loadGameCards).mockReset();
  vi.mocked(knownCard).mockReset();
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

  it('Shift + Space readies all your cards, wherever the pointer is', async () => {
    const exhausted = [
      card('mine', { x: 280, exhausted: true }),
      card('v', { code: '01094', owner: -1, back: 'villain', exhausted: true }),
    ];
    const { session } = await renderTable(makeView({ cards: exhausted }));

    // Held down, it readies once; it never scrolls the page.
    expect(await press(' ', { shiftKey: true, repeat: true })).toBe(false);
    expect(session.act).not.toHaveBeenCalled();
    expect(await press(' ', { shiftKey: true })).toBe(false);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'readyAll' });
    // Shift + E is not it.
    await press('E', { shiftKey: true });
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('Shift + Space does nothing without a card of yours to ready, nor in a field', async () => {
    // Alex's card is exhausted, but locked: it does not ready.
    const villainOnly = [
      card('mine', { x: 280, exhausted: true, status: { locked: 1 } }),
      card('v', { code: '01094', owner: -1, back: 'villain', exhausted: true }),
    ];
    const { session } = await renderTable(makeView({ cards: villainOnly }));

    await press(' ', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();

    // In a field, a space is typed as ever.
    const field = document.body.appendChild(document.createElement('input'));
    expect(await fireEvent.keyDown(field, { key: ' ', shiftKey: true })).toBe(true);
    field.remove();
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
    await press(' ', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();

    // In a field, a space is typed as ever.
    const field = document.body.appendChild(document.createElement('input'));
    expect(await fireEvent.keyDown(field, { key: ' ', shiftKey: true })).toBe(true);
    field.remove();
  });

  it('the status keys reach the second section of the counter menu', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('g');
    expect(session.act).toHaveBeenCalledWith({
      kind: 'status',
      card: 'mine',
      name: 'tough',
      delta: 1,
    });
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

  it('A starts no arrow from a hand card or a pile, nor with Shift or held', async () => {
    await renderTable();
    await fireEvent.pointerEnter(inHand('h'));
    await press('a');
    await fireEvent.pointerEnter(placed('deck:p0'));
    await press('a');
    await fireEvent.pointerEnter(placed('mine'));
    await press('A', { shiftKey: true });
    await press('a', { repeat: true });
    expect(interaction.arrowFrom).toBeNull();
  });

  it('disabled items do nothing, nor do the items of a disabled dropdown', async () => {
    const cards = [
      // The villain card is tucked under 'host': Discard and Move to (and its Hand) are disabled.
      card('v', { code: '01094', owner: -1, back: 'villain', parent: 'host' }),
      card('host', { x: 200 }),
      // Reveal is disabled while a card is revealed on the encounter deck.
      card('shown', { owner: -1, x: 500, onPile: 'enc' }),
    ];
    const { session } = await renderTable(makeView({ cards }));

    await fireEvent.pointerEnter(placed('enc'));
    await press('r');
    await fireEvent.pointerEnter(placed('host'));
    await press('Backspace');
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
    // The dialog froze the table: it let go of the hovered card.
    expect(interaction.hovered).toBeNull();
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
    await press('a');
    await press('+');
    expect(session.act).not.toHaveBeenCalled();
    expect(interaction.arrowFrom).toBeNull();
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
    await press('Backspace', { repeat: true });
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('keys during a drag', () => {
  it('the keys of the dragged element do nothing; undo and the zoom still work', async () => {
    const { session } = await renderTable(makeView({ canUndo: true }));
    const mine = placed('mine');
    await fireEvent.pointerEnter(mine);
    await fireEvent.pointerDown(mine, { clientX: 300, clientY: 300 });
    await fireEvent.pointerMove(window, { clientX: 340, clientY: 330, buttons: 1 });
    expect(interaction.dragging).not.toBeNull();

    await press('Backspace');
    await press('e');
    await press('d');
    await press('a');
    expect(session.act).not.toHaveBeenCalled();
    expect(interaction.arrowFrom).toBeNull();
    expect(interaction.dragging).not.toBeNull();

    await press('+');
    expect(zoomLabel()).toBe('110%');
    await press('z');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' });
  });

  it('nor do the keys of a dragged hand card', async () => {
    const { session } = await renderTable();
    const held = inHand('h');
    await fireEvent.pointerEnter(held);
    await fireEvent.pointerDown(held, { clientX: 300, clientY: 700 });
    await fireEvent.pointerMove(window, { clientX: 340, clientY: 500, buttons: 1 });
    expect(interaction.dragging).not.toBeNull();

    await press('Backspace');
    await press('p');
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
      card('v', { code: '01094', owner: -1, back: 'villain' }),
      // 760–900 takes the slot at 760; a double-size card at 960–1156 the one at 980.
      card('a', { x: 760 }),
      card('b', { code: '01010', x: 960 }),
      // Below the viewer's row, or in another row: not in the way.
      card('low', { x: 1200, y: 200 }),
      card('there', { x: 1200, y: 330 }),
      card('h', { zone: 'hand' }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    await fireEvent.pointerEnter(inHand('h'));

    await press('p');
    expect(session.act).toHaveBeenCalledWith({ kind: 'play', card: 'h', x: 1200, y: 0 });
  });

  it('Backspace discards a hand card', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(inHand('h'));

    await press('Backspace');
    expect(session.act).toHaveBeenCalledWith({ kind: 'discard', card: 'h' });
  });

  it('Backspace discards a table card; X does nothing any more', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('x');
    expect(session.act).not.toHaveBeenCalled();
    await press('Backspace');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'mine' });
  });

  it('Backspace never goes back in history, and is left to the fields', async () => {
    const { session } = await renderTable();
    // Over nothing: no discard, and still no navigation.
    expect(await press('Backspace')).toBe(false);

    const field = document.body.appendChild(document.createElement('input'));
    await fireEvent.pointerEnter(placed('mine'));
    // In a field, it deletes a character as ever.
    expect(await fireEvent.keyDown(field, { key: 'Backspace' })).toBe(true);
    expect(session.act).not.toHaveBeenCalled();
    field.remove();
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
  // Alex's row, as the setup lays it out: deck, discard, identity at 360.
  const row = [
    pile('deck:p0', { owner: 0, x: 0, y: 360 }),
    pile('disc:p0', { kind: 'discard', owner: 0, x: 160, y: 360 }),
  ];
  const identity = card('id', { x: 360, y: 360 });

  it("starts at 760 on the viewer's row, the height of their deck", () => {
    expect(freeSlot([identity], row, 0, sizeOf)).toEqual({ x: 760, y: 360 });
  });

  it('starts at the top of the table without a deck', () => {
    expect(freeSlot([], [], 0, sizeOf)).toEqual({ x: 760, y: 0 });
  });

  it('steps by 220, keeping 40 free on each side of a 140-wide card', () => {
    // 760 needs 720–940 free: a card from 930 is in the way, and its right edge (1070) blocks 980.
    expect(freeSlot([card('a', { x: 930, y: 360 })], row, 0, sizeOf)).toEqual({ x: 1200, y: 360 });
    // A card from 940 leaves 760 free; one ending at 940 leaves 980 free.
    expect(freeSlot([card('a', { x: 940, y: 360 })], row, 0, sizeOf)).toEqual({ x: 760, y: 360 });
    expect(freeSlot([card('a', { x: 800, y: 360 })], row, 0, sizeOf)).toEqual({ x: 980, y: 360 });
  });

  it('counts the visible width of a card: double size, face down, tilted when exhausted', () => {
    // Double size, 196 wide: 760–956 blocks 980.
    const double = card('a', { code: '01010', x: 760, y: 360 });
    expect(freeSlot([double], row, 0, sizeOf)).toEqual({ x: 1200, y: 360 });
    // Face down, it is 140 wide again.
    const faceDown = card('a', { code: '01010', faceDown: true, x: 760, y: 360 });
    expect(freeSlot([faceDown], row, 0, sizeOf)).toEqual({ x: 980, y: 360 });
    // Exhausted, it turns 15°: its bounding box reaches past 940.
    const exhausted = card('a', { x: 800, y: 360, exhausted: true });
    expect(freeSlot([exhausted], row, 0, sizeOf)).toEqual({ x: 1200, y: 360 });
  });

  it('a pile is in the way, but not an out-of-play pile, which is not drawn', () => {
    const inPlay = pile('deck:p1', { owner: 1, x: 780, y: 360 });
    expect(freeSlot([], [...row, inPlay], 0, sizeOf)).toEqual({ x: 980, y: 360 });
    const aside = pile('aside:p0', { kind: 'aside', owner: 0, x: 780, y: 360 });
    expect(freeSlot([], [...row, aside], 0, sizeOf)).toEqual({ x: 760, y: 360 });
  });

  it("only what reaches into the viewer's row counts", () => {
    const cards = [
      card('above', { x: 760, y: 160 }),
      card('reaching', { x: 980, y: 170 }),
      card('below', { x: 1200, y: 560 }),
    ];
    // "above" ends at 356, "reaching" at 366: only the second one is in the way.
    expect(freeSlot(cards, row, 0, sizeOf)).toEqual({ x: 760, y: 360 });
    expect(freeSlot([...cards, card('a', { x: 760, y: 400 })], row, 0, sizeOf)).toEqual({
      x: 1200,
      y: 360,
    });
  });
});
