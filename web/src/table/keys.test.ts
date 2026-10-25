import { fireEvent, render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { freeSlot, handleKey, type KeyTable } from './keys';
import { footprints, visualBox } from './layout';
import { openModal } from '../components/modal.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  CardView as TableCard,
  PackFace,
  PileView,
  Point,
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
  '01095': [{ name: 'Rhino', stage: 'II' }],
  '01097': [
    { name: 'The Break-In!', size: 'land' },
    { name: 'The Break-In!', size: 'land' },
  ],
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
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        online: true,
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 1 }],
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
      hands: { p0: ['h'] },
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
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' }, 0);
  });

  it('F flips a single-faced card in play and a face-down one, not a single-faced identity', async () => {
    const cards = [
      card('mine', { x: 280 }),
      card('played', { code: undefined, faceDown: true, x: 560 }),
      card('hero', { identity: true, x: 840 }),
      card('v', { code: '01094', owner: -1, back: 'villain' }),
    ];
    const { session } = await renderTable(makeView({ cards }));

    await fireEvent.pointerEnter(placed('mine'));
    await press('f');
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'flip', card: 'mine' }, 0);

    // A card played from the deck lies face down, with no code: F turns it face up.
    await fireEvent.pointerEnter(placed('played'));
    await press('f');
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'flip', card: 'played' }, 0);
    expect(screen.queryByLabelText('Card preview')).toBeNull();

    await fireEvent.pointerEnter(placed('hero'));
    await press('f');
    expect(session.act).toHaveBeenCalledTimes(2);
  });

  it('Shift + Space readies all cards, wherever the pointer is', async () => {
    // Only the villain is exhausted: Ready all readies it too.
    const exhausted = [card('v', { code: '01094', owner: -1, back: 'villain', exhausted: true })];
    const { session } = await renderTable(makeView({ cards: exhausted }));

    // Held down, it readies once; it never scrolls the page.
    expect(await press(' ', { shiftKey: true, repeat: true })).toBe(false);
    expect(session.act).not.toHaveBeenCalled();
    expect(await press(' ', { shiftKey: true })).toBe(false);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'readyAll' }, 0);
    // Shift + E is not it.
    await press('E', { shiftKey: true });
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('Shift + Space does nothing without a card to ready, nor in a field', async () => {
    // Alex's card is exhausted, but locked: it does not ready; the villain is ready.
    const lockedOnly = [
      card('mine', { x: 280, exhausted: true, status: { locked: 1 } }),
      card('v', { code: '01094', owner: -1, back: 'villain' }),
    ];
    const { session } = await renderTable(makeView({ cards: lockedOnly }));

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
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' }, 0);
  });

  it('shift+D removes damage', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('D', { shiftKey: true });
    expect(session.act).toHaveBeenCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: -1,
      },
      0,
    );
  });

  it('D adds damage; Shift takes nothing from a card that has none', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('d');
    expect(session.act).toHaveBeenCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: 1,
      },
      0,
    );
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

  it('the status keys reach the items of the Add a status submenu', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('g');
    expect(session.act).toHaveBeenCalledWith(
      {
        kind: 'status',
        card: 'mine',
        name: 'tough',
        delta: 1,
      },
      0,
    );
  });

  it('R adds Retaliate to a card in play, Shift + R takes one off; on the encounter deck it reveals', async () => {
    const cards = [
      card('mine', { x: 280, status: { retaliate: 2 } }),
      card('v', { code: '01094', owner: -1, back: 'villain' }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    await fireEvent.pointerEnter(placed('mine'));

    await press('r');
    expect(session.act).toHaveBeenCalledWith(
      { kind: 'status', card: 'mine', name: 'retaliate', delta: 1 },
      0,
    );
    await press('R', { shiftKey: true });
    expect(session.act).toHaveBeenLastCalledWith(
      { kind: 'status', card: 'mine', name: 'retaliate', delta: -1 },
      0,
    );

    await fireEvent.pointerEnter(placed('enc'));
    await press('r');
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'reveal' }, 0);
  });

  it('W draws a card revealed on the own deck; E and the token and status keys do nothing on it', async () => {
    const cards = [
      card('rev', { x: 0, onPile: 'deck:p0' }),
      card('v', { code: '01094', owner: -1, back: 'villain' }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    await fireEvent.pointerEnter(placed('rev'));

    for (const key of ['e', 'd', 't', 'n', 's', 'c', 'g', 'r', 'l']) {
      await press(key);
    }
    expect(session.act).not.toHaveBeenCalled();
    await press('w');
    expect(session.act).toHaveBeenCalledWith({ kind: 'draw', n: 1, pile: 'deck:p0' }, 0);
  });

  it("R on the viewer's own deck reveals its top card onto it", async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));

    await press('r');
    expect(session.act).toHaveBeenCalledWith({ kind: 'reveal', pile: 'deck:p0' }, 0);
  });

  it('menu items answer to their keys', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await press('h');
    expect(session.act).toHaveBeenCalledWith({ kind: 'toHand', card: 'mine' }, 0);

    await fireEvent.pointerEnter(placed('deck:p0'));
    await press('u');
    expect(session.act).toHaveBeenCalledWith({ kind: 'shuffle', pile: 'deck:p0' }, 0);

    await press('l');
    expect(screen.getByRole('dialog', { name: 'Look at the top cards' })).toBeTruthy();
  });

  it('W draws 1 from the own deck; Shift + W asks how many with Draw X', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));

    await press('w');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'draw', n: 1 }, 0);
    expect(screen.queryByRole('dialog')).toBeNull();

    // Shift gives an upper-case key.
    await press('W', { shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Draw cards' })).toBeTruthy();
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('X discards the own deck top card; Shift + X asks how many with Discard X', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));

    await press('x');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'discardTop', pile: 'deck:p0', n: 1 },
      0,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    await press('X', { shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Discard from the top' })).toBeTruthy();
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('Backspace discards the own deck top card, as X does', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));

    await press('Backspace');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'discardTop', pile: 'deck:p0', n: 1 },
      0,
    );
  });

  it('Shift + W does not repeat while held', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('deck:p0'));

    await press('W', { shiftKey: true, repeat: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Shift + W does nothing on what is not the own deck', async () => {
    const { session } = await renderTable();
    for (const id of ['mine', 'enc']) {
      await fireEvent.pointerEnter(placed(id));
      await press('W', { shiftKey: true });
    }
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
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

  it('disabled items do nothing, nor do the items of a disabled submenu', async () => {
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

  it('X, Backspace, H and B do nothing on an identity card, which stays on the table', async () => {
    const cards = [
      card('hero', { x: 200, identity: true }),
      card('v', { code: '01094', owner: -1, back: 'villain' }),
    ];
    const { session } = await renderTable(makeView({ cards }));

    await fireEvent.pointerEnter(placed('hero'));
    await press('x');
    await press('Backspace');
    await press('h');
    await press('b');
    expect(session.act).not.toHaveBeenCalled();
    // It is still played on the table.
    await press('e');
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('X, Backspace and B do nothing on the villain card, which stays on the table', async () => {
    const { session } = await renderTable();

    await fireEvent.pointerEnter(placed('v'));
    await press('x');
    await press('Backspace');
    await press('b');
    expect(session.act).not.toHaveBeenCalled();
  });

  it('B sends a card in play to the bottom of its deck', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('b');
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'mine', where: 'bottom' },
      0,
    );
  });

  it('B sends a side card to the bottom of its side deck; X and Backspace leave it without a discard pile', async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain' }),
      card('sense', { x: 200, home: 'side:p0:0' }),
    ];
    const view = makeView({ cards });
    view.table!.piles.push(pile('side:p0:0', { kind: 'sideDeck', owner: 0, label: 'Sense' }));
    const { session } = await renderTable(view);
    await fireEvent.pointerEnter(placed('sense'));

    await press('x');
    await press('Backspace');
    expect(session.act).not.toHaveBeenCalled();
    await press('b');
    // The server follows the card's home: the action names no pile.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'sense', where: 'bottom' },
      0,
    );
  });

  it('B does nothing on an encounter card without an encounter deck to go back to', async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain' }),
      card('enemy', { owner: -1, back: 'encounter', x: 200 }),
    ];
    const view = makeView({ cards });
    view.table!.piles = view.table!.piles.filter((p) => p.id !== 'enc');
    const { session } = await renderTable(view);

    await fireEvent.pointerEnter(placed('enemy'));
    await press('b');
    expect(session.act).not.toHaveBeenCalled();
  });

  it('F turns a two-faced main scheme over, and does nothing on a single-faced villain stage', async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain' }),
      card('v2', { code: '01095', owner: -1, back: 'villain', zone: 'stage' }),
      card('s', { code: '01097', owner: -1, back: 'encounter', x: 560 }),
    ];
    const view = makeView({ cards });
    view.table!.stages = [
      { key: 'villain', label: 'Villain', current: 'v', cards: ['v', 'v2'] },
      { key: 'main', label: 'Main scheme', current: 's', cards: ['s'] },
    ];
    const { session } = await renderTable(view);

    // Stage II waits in the stage zone, yet F never changes the card: Change card… (V) does.
    await fireEvent.pointerEnter(placed('v'));
    await press('f');
    expect(session.act).not.toHaveBeenCalled();

    await fireEvent.pointerEnter(placed('s'));
    await press('f');
    expect(session.act).toHaveBeenLastCalledWith(
      { kind: 'chooseStage', stage: 'main', card: 's', face: 1 },
      0,
    );
  });

  it('V opens the card choice of the villain card, and does nothing elsewhere', async () => {
    const stageBox = () =>
      screen.queryByRole('dialog', { name: 'Villain: choose the card to show' });
    const { session } = await renderTable();

    await fireEvent.pointerEnter(placed('mine'));
    await press('v');
    expect(stageBox()).toBeNull();

    await fireEvent.pointerEnter(placed('v'));
    await press('v');
    expect(stageBox()).toBeTruthy();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('Shift + X, B or V does nothing', async () => {
    const stageBox = () =>
      screen.queryByRole('dialog', { name: 'Villain: choose the card to show' });
    const { session } = await renderTable();

    await fireEvent.pointerEnter(placed('mine'));
    await press('X', { shiftKey: true });
    await press('B', { shiftKey: true });
    await fireEvent.pointerEnter(placed('v'));
    await press('V', { shiftKey: true });
    await fireEvent.pointerEnter(inHand('h'));
    await press('X', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();
    expect(stageBox()).toBeNull();
  });

  it('Z sends undo', async () => {
    const { session, rerender } = await renderTable(makeView({ canUndo: false }));
    await press('z');
    expect(session.act).not.toHaveBeenCalled();

    await rerender({ view: makeView({ canUndo: true }) });
    await press('Z', { shiftKey: true });
    expect(session.act).not.toHaveBeenCalled();
    await press('z');
    expect(session.act).toHaveBeenCalledWith({ kind: 'undo' }, 0);
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
    expect(session.act).toHaveBeenLastCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: 1,
      },
      0,
    );
    await press('D', { shiftKey: true, repeat: true });
    expect(session.act).toHaveBeenLastCalledWith(
      {
        kind: 'token',
        card: 'mine',
        name: 'dmg',
        delta: -1,
      },
      0,
    );
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'undo' }, 0);
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

  it('takes the key (preventDefault) only when it drops something, so that fullscreen stays', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await press('a');

    // fireEvent reports false for a prevented event.
    expect(await press('Escape')).toBe(false);
    expect(interaction.arrowFrom).toBeNull();
    // The hover alone goes too, but leaves the key to the browser (fullscreen).
    expect(await press('Escape')).toBe(true);
    expect(interaction.hovered).toBeNull();
  });

  it('ignores a held Escape repeating', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    await press('a');

    expect(await press('Escape', { repeat: true })).toBe(true);
    expect(interaction.arrowFrom).toBe('mine');
  });
});

describe('keys on a hand card', () => {
  it('P plays to a free slot', async () => {
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain' }),
      // Past the deck at 0–140, a card at 190–330 and the encounter deck at 500–640 leave no room
      // before 690, where only the first player token at 860–944 is in the way (makeView): the card
      // lands 50 past the token, taken up to the grid, at 1000.
      card('a', { x: 190 }),
      // Below the viewer's row, or in another row: not in the way.
      card('low', { x: 1200, y: 200 }),
      card('there', { x: 1200, y: 330 }),
      card('h', { zone: 'hand' }),
    ];
    const { session } = await renderTable(makeView({ cards }));
    await fireEvent.pointerEnter(inHand('h'));

    await press('p');
    expect(session.act).toHaveBeenCalledWith({ kind: 'play', card: 'h', x: 1000, y: 0 }, 0);
  });

  it('X and Backspace discard a hand card', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(inHand('h'));

    await press('x');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'h' }, 0);
    await press('Backspace');
    expect(session.act).toHaveBeenCalledTimes(2);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discard', card: 'h' }, 0);
  });

  it('X and Backspace leave a card of a side deck without a discard pile in the hand', async () => {
    const view = makeView({
      cards: [
        card('v', { code: '01094', owner: -1, back: 'villain' }),
        card('sense', { zone: 'hand', home: 'side:p0:0' }),
      ],
    });
    view.table!.hands = { p0: ['sense'] };
    view.table!.piles.push(pile('side:p0:0', { kind: 'sideDeck', owner: 0, label: 'Sense' }));
    const { session } = await renderTable(view);
    await fireEvent.pointerEnter(inHand('sense'));

    await press('x');
    await press('Backspace');
    expect(session.act).not.toHaveBeenCalled();
  });

  it('X and Backspace discard a table card', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('mine'));

    await press('x');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'mine' }, 0);
    await press('Backspace');
    expect(session.act).toHaveBeenCalledTimes(2);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discard', card: 'mine' }, 0);
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
  // 01010 is a double-size card and 01108 a landscape side scheme.
  const sizeOf = (c: TableCard): Size =>
    c.code === '01010' ? 'dstd' : c.code === '01108' ? 'land' : 'std';
  // The card played: a portrait card from the hand.
  const played = card('h', { zone: 'hand' });
  // The first player token where the setup puts it, under the deck: below the row.
  const underDeck = { x: 30, y: 580 };
  /** The free slot of seat 0 for the played card, on a table of these cards, piles and token. */
  const slot = (cards: TableCard[], piles: PileView[], firstPlayer: Point, active?: Point) =>
    freeSlot(played, { cards, piles, firstPlayer, active }, 0, sizeOf);
  // Alex's row, as the setup lays it out: deck, discard, identity at 360.
  const row = [
    pile('deck:p0', { owner: 0, x: 0, y: 360 }),
    pile('disc:p0', { kind: 'discard', owner: 0, x: 160, y: 360 }),
  ];
  const identity = card('id', { x: 360, y: 360 });
  // Doctor Strange's row: his Invocation deck and its discard pile push the identity to 680.
  const sides = [
    pile('side:p0:0', { kind: 'sideDeck', owner: 0, x: 320, y: 360 }),
    pile('side:p0:1', { kind: 'sideDiscard', owner: 0, x: 480, y: 360 }),
  ];
  const strange = card('id', { x: 680, y: 360 });

  it("starts 50 past the identity on a fresh row, the height of the viewer's deck", () => {
    // The piles lie 20 apart and the identity 60 past them: no room for a card between them.
    expect(slot([identity], row, underDeck)).toEqual({ x: 550, y: 360 });
    // Without the identity, past the discard pile.
    expect(slot([], row, underDeck)).toEqual({ x: 350, y: 360 });
  });

  it('starts 50 past the identity wherever the side piles push it', () => {
    expect(slot([strange], [...row, ...sides], underDeck)).toEqual({ x: 870, y: 360 });
  });

  it('starts at 0 at the top of the table without a deck', () => {
    expect(slot([], [], underDeck)).toEqual({ x: 0, y: 0 });
  });

  it('lands 50 past the last card of the row', () => {
    // A card at 550–690 sends the next one to 740.
    expect(slot([identity, card('a', { x: 550, y: 360 })], row, underDeck)).toEqual({
      x: 740,
      y: 360,
    });
    // Past one at 740–880 too, it lands at 930.
    const cards = [identity, card('a', { x: 550, y: 360 }), card('b', { x: 740, y: 360 })];
    expect(slot(cards, row, underDeck)).toEqual({ x: 930, y: 360 });
  });

  it('finds the last card whatever the order of the cards', () => {
    const cards = [card('b', { x: 740, y: 360 }), card('a', { x: 550, y: 360 }), identity];
    expect(slot(cards, row, underDeck)).toEqual({ x: 930, y: 360 });
    const hole = [card('b', { x: 930, y: 360 }), card('a', { x: 550, y: 360 }), identity];
    expect(slot(hole, row, underDeck)).toEqual({ x: 740, y: 360 });
  });

  it("the first player token is in the way when it lies in the viewer's row", () => {
    // Dragged to 840–924, the token lies where 870, past Doctor Strange at 680–820, would be.
    const firstPlayer = { x: 840, y: 360 };
    expect(slot([strange], [...row, ...sides], firstPlayer)).toEqual({ x: 980, y: 360 });
    // Under the deck, where the setup puts it, or in another row, it is not.
    expect(slot([identity], row, underDeck)).toEqual({ x: 550, y: 360 });
    expect(slot([identity], row, { x: 550, y: 0 })).toEqual({ x: 550, y: 360 });
  });

  it('freeSlot avoids the active counter', () => {
    // The 70 wide counter at 840–910 lies where 870, past Doctor Strange at 680–820, would be.
    const active = { x: 840, y: 360 };
    expect(slot([strange], [...row, ...sides], underDeck)).toEqual({ x: 870, y: 360 });
    expect(slot([strange], [...row, ...sides], underDeck, active)).toEqual({ x: 960, y: 360 });
    // In another row, it is not in the way.
    expect(slot([strange], [...row, ...sides], underDeck, { x: 840, y: 0 })).toEqual({
      x: 870,
      y: 360,
    });
  });

  it('leaves room for two neighbours to be exhausted without overlapping', () => {
    const first = card('a', { ...slot([identity], row, underDeck) });
    const second = card('b', { ...slot([identity, first], row, underDeck) });
    const [left, right] = footprints(
      [first, second].map((c) => ({ ...c, exhausted: true })),
      [],
      sizeOf,
    ).map(visualBox);
    expect(left!.right).toBeLessThanOrEqual(right!.left);
  });

  it('fills a hole wide enough for a 140-wide card with 50 free on each side', () => {
    // 550 needs 500–740 free: a card from 740 leaves it free, one from 730 does not.
    expect(slot([identity, card('a', { x: 740, y: 360 })], row, underDeck)).toEqual({
      x: 550,
      y: 360,
    });
    expect(slot([identity, card('a', { x: 730, y: 360 })], row, underDeck)).toEqual({
      x: 920,
      y: 360,
    });
    // Between 690 and 930, 740 has 690–930 free.
    const wide = [identity, card('a', { x: 550, y: 360 }), card('b', { x: 930, y: 360 })];
    expect(slot(wide, row, underDeck)).toEqual({ x: 740, y: 360 });
    // Between 690 and 920, it does not: the card goes past the last one, at 1110.
    const narrow = [identity, card('a', { x: 550, y: 360 }), card('b', { x: 920, y: 360 })];
    expect(slot(narrow, row, underDeck)).toEqual({ x: 1110, y: 360 });
  });

  it('makes room for the played card as wide as it lands', () => {
    // Between 690 and 930, a portrait card has room at 740, a landscape side scheme, 196 wide, does not.
    const cards = [identity, card('a', { x: 550, y: 360 }), card('b', { x: 930, y: 360 })];
    const table = { cards, piles: row, firstPlayer: underDeck };
    expect(freeSlot(played, table, 0, sizeOf)).toEqual({ x: 740, y: 360 });
    const scheme = card('s', { code: '01108', owner: -1, back: 'encounter', zone: 'pile' });
    expect(freeSlot(scheme, table, 0, sizeOf)).toEqual({ x: 1120, y: 360 });
  });

  it('counts the visible width of a card: double size, face down, tilted when exhausted', () => {
    // Double size, 196 wide: 550–746, then 50 more, up to the grid.
    const double = card('a', { code: '01010', x: 550, y: 360 });
    expect(slot([identity, double], row, underDeck)).toEqual({ x: 800, y: 360 });
    // Face down, it is 140 wide again.
    const faceDown = card('a', { code: '01010', faceDown: true, x: 550, y: 360 });
    expect(slot([identity, faceDown], row, underDeck)).toEqual({ x: 740, y: 360 });
    // Exhausted, it turns 15°: its bounding box spans 527–713, and 763 goes up to 770.
    const exhausted = card('a', { x: 550, y: 360, exhausted: true });
    expect(slot([identity, exhausted], row, underDeck)).toEqual({ x: 770, y: 360 });
    // Its tilt counts on its left too: from 740, it reaches 717, before 740.
    const tilted = card('a', { x: 740, y: 360, exhausted: true });
    expect(slot([identity, tilted], row, underDeck)).toEqual({ x: 960, y: 360 });
  });

  it('a pile is in the way, but not an out-of-play pile, which is not drawn', () => {
    const inPlay = pile('deck:p1', { owner: 1, x: 570, y: 360 });
    expect(slot([identity], [...row, inPlay], underDeck)).toEqual({ x: 760, y: 360 });
    const aside = pile('aside:p0', { kind: 'aside', owner: 0, x: 570, y: 360 });
    expect(slot([identity], [...row, aside], underDeck)).toEqual({ x: 550, y: 360 });
  });

  it("only what reaches into the viewer's row counts", () => {
    const cards = [
      identity,
      card('above', { x: 550, y: 160 }),
      card('reaching', { x: 740, y: 170 }),
      card('below', { x: 550, y: 560 }),
    ];
    // "above" ends at 356, "reaching" at 366: only the second one is in the way.
    expect(slot(cards, row, underDeck)).toEqual({ x: 550, y: 360 });
    expect(slot([...cards, card('a', { x: 550, y: 400 })], row, underDeck)).toEqual({
      x: 930,
      y: 360,
    });
  });
});

describe('a player with two decks', () => {
  /** Alex plays p0 (deck at y 0) and p1 (deck at y 330); h4 is in the hand of p1. */
  function twoDeckView(): View {
    return makeView({
      you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] },
      table: {
        cards: [card('h', { zone: 'hand' }), card('h4', { zone: 'hand', owner: 1 })],
        piles: [pile('deck:p0', { owner: 0 }), pile('deck:p1', { owner: 1, y: 330 })],
        hands: { p0: ['h'], p1: ['h4'] },
        stages: [],
        firstPlayer: { x: 860, y: 40 },
      },
    });
  }

  function keyTable(view: View): KeyTable {
    return {
      view,
      items: [],
      zoom: 1,
      setZoom: vi.fn(),
      run: vi.fn(),
      act: vi.fn(),
      canReadyAll: false,
      showKeys: vi.fn(),
      selectNextDeck: vi.fn(),
      canStepHero: false,
      stepHero: vi.fn(),
      sizeOf: () => 'std',
    };
  }

  function keyDown(key: string, extra: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, cancelable: true, ...extra });
  }

  it('Q selects next own deck', () => {
    const table = keyTable(twoDeckView());
    const event = keyDown('q');
    handleKey(event, table);
    expect(table.selectNextDeck).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);

    handleKey(keyDown('Q', { repeat: true }), table);
    expect(table.selectNextDeck).toHaveBeenCalledOnce();
  });

  it('Q does nothing with one deck, nor for a spectator', () => {
    const single = keyTable(makeView());
    handleKey(keyDown('q'), single);
    expect(single.selectNextDeck).not.toHaveBeenCalled();

    const spectating = twoDeckView();
    spectating.you = { role: 'spectator', color: -1, host: false };
    const watcher = keyTable(spectating);
    handleKey(keyDown('q'), watcher);
    expect(watcher.selectNextDeck).not.toHaveBeenCalled();
  });

  it('Shift + ← / → steps the player selector to the previous / next hero, once per press', () => {
    const table = { ...keyTable(twoDeckView()), canStepHero: true };
    const next = keyDown('ArrowRight', { shiftKey: true });
    handleKey(next, table);
    expect(table.stepHero).toHaveBeenLastCalledWith(1);
    expect(next.defaultPrevented).toBe(true);
    handleKey(keyDown('ArrowLeft', { shiftKey: true }), table);
    expect(table.stepHero).toHaveBeenLastCalledWith(-1);

    handleKey(keyDown('ArrowRight', { shiftKey: true, repeat: true }), table);
    const plain = keyDown('ArrowRight');
    handleKey(plain, table);
    expect(table.stepHero).toHaveBeenCalledTimes(2);
    expect(plain.defaultPrevented).toBe(false);
  });

  it('Shift + ← / → steps a spectator through the players too', () => {
    const spectating = twoDeckView();
    spectating.you = { role: 'spectator', color: -1, host: false };
    const table = { ...keyTable(spectating), canStepHero: true };
    handleKey(keyDown('ArrowRight', { shiftKey: true }), table);
    expect(table.stepHero).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('Shift + ← / → does nothing without two heroes to step through, nor in a field', () => {
    const single = keyTable(makeView());
    const event = keyDown('ArrowRight', { shiftKey: true });
    handleKey(event, single);
    expect(single.stepHero).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    const table = { ...keyTable(twoDeckView()), canStepHero: true };
    const input = document.body.appendChild(document.createElement('input'));
    input.addEventListener('keydown', (typed) => handleKey(typed, table));
    input.dispatchEvent(keyDown('ArrowLeft', { shiftKey: true, bubbles: true }));
    expect(table.stepHero).not.toHaveBeenCalled();
  });

  it("P plays a card of the second deck's hand to that deck's row", () => {
    const table = keyTable(twoDeckView());
    interaction.hovered = { kind: 'hand', id: 'h4' };
    handleKey(keyDown('p'), table);
    // 50 past p1's deck at 0–140, in its row.
    expect(table.act).toHaveBeenCalledWith({ kind: 'play', card: 'h4', x: 190, y: 330 });
  });
});
