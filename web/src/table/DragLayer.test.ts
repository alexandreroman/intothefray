import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  CardView as TableCard,
  PackFace,
  PresenceState,
  PileView,
  SessionError,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

const FACES: Record<string, Partial<PackFace>> = {
  '01001': { name: 'Spider-Man' },
  '01094': { name: 'Rhino', stage: 'I' },
};

function infoOf(code: string): CardInfo | null {
  const face = FACES[code];
  if (!face) {
    return null;
  }
  const full: PackFace = { name: '', type: '', size: 'std', images: [`${code}.png`], ...face };
  return { card: { code, faces: [full], back: 'player', quantity: 1 }, face: 0 };
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

// The villain's row at the top, Alex's 300 below it.
const CARDS = [
  card('mine', { y: 300, tokens: { dmg: 2 } }),
  card('other', { x: 400, y: 300 }),
  card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
  card('h1', { zone: 'hand' }),
  card('h2', { zone: 'hand' }),
  card('h3', { zone: 'hand' }),
];

const PILES = [
  pile('enc', { kind: 'encounter', x: 0, count: 20 }),
  pile('deck:p0', { owner: 0, x: 600, y: 300 }),
  pile('disc:p0', { kind: 'discard', owner: 0, x: 760, y: 300, count: 0, cards: [] }),
];

// The cards that can lie in Alex's discard pile: two Spider-Man, then a Rhino.
const DISCARD_CODES: Record<string, string> = { d1: '01001', d2: '01094' };

/**
 * Alex (p0) with Rhino, alone or with Sam (p1), whose row is 300 below
 * Alex's; `discarded` lists Alex's discard pile, bottom to top, and
 * `firstPlayerY` is the height the token lies at.
 */
function makeView(
  extra: {
    cards?: TableCard[];
    spectator?: boolean;
    discarded?: string[];
    withSam?: boolean;
    firstPlayerY?: number;
    active?: { x: number; y: number };
  } = {},
): View {
  const discarded = extra.discarded ?? [];
  const piles = PILES.map((p) =>
    p.id === 'disc:p0' ? { ...p, count: discarded.length, cards: discarded } : p,
  );
  if (extra.withSam) {
    piles.push(pile('deck:p1', { owner: 1, x: 600, y: 600 }));
  }
  const inPile = discarded.map((id) => card(id, { code: DISCARD_CODES[id], zone: 'pile' }));
  return {
    id: 'g1',
    phase: 'playing',
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        online: true,
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 3 }],
      },
      ...(extra.withSam
        ? [
            {
              name: 'Sam',
              color: 1,
              host: false,
              ready: true,
              online: true,
              decks: [{ area: 'p1' as const, ready: true, handCount: 0 }],
            },
          ]
        : []),
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [...(extra.cards ?? CARDS), ...inPile],
      piles,
      hands: { p0: ['h1', 'h2', 'h3'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: extra.firstPlayerY ?? 340 },
      active: extra.active,
    },
    log: [],
  };
}

/** A session whose actions all go out, the first one as action 1; nothing answers them. */
function fakeSession() {
  return {
    act: vi.fn((_action: Action): number | null => 1),
    lobby: vi.fn(() => true),
    lastError: null as SessionError | null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
    viewGap: 0,
  };
}

// A real DOMRect, as a browser measures it: its sides are getters on its prototype, which a
// spread of the rect loses.
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

// The screen, at zoom 1: the surface 20 px in from the left and 40 px down
// from the top; the hand at the bottom, its three cards side by side.
const SURFACE = { left: 20, top: 40 };
const HAND_TOP = 700;

/** Lays the table out on the screen; `view` gives the table cards and piles their place. */
function layOut(view: () => View, zoom: number): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('surface')) {
      return domRect(SURFACE.left, SURFACE.top, 1200 * zoom, 1200 * zoom);
    }
    const marker = (this as HTMLElement).dataset?.marker;
    const token = marker === 'active' ? view().table?.active : view().table?.firstPlayer;
    if (this.closest('.surface') && this.classList.contains('marker') && token) {
      const width = marker === 'active' ? 70 : 84;
      return domRect(
        SURFACE.left + token.x * zoom,
        SURFACE.top + token.y * zoom,
        width * zoom,
        70 * zoom,
      );
    }
    const id = (this as HTMLElement).dataset.id;
    if (this.closest('.surface') && id) {
      const table = view().table;
      const placed =
        table?.cards.find((c) => c.id === id && c.zone === 'table') ??
        table?.piles.find((p) => p.id === id);
      if (placed) {
        return domRect(
          SURFACE.left + placed.x * zoom,
          SURFACE.top + placed.y * zoom,
          140 * zoom,
          196 * zoom,
        );
      }
    }
    const hcard = this.closest<HTMLElement>('.hcard');
    if (hcard && !hcard.classList.contains('gap')) {
      const index = [...document.querySelectorAll('.hand .hcard')].indexOf(hcard);
      return domRect(300 + index * 140, HAND_TOP, 132, 185);
    }
    return domRect(0, 0, 0, 0);
  });
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function handCard(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.hand .hcard[data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} in the hand`);
  }
  return element;
}

function ghosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.draglayer .card')];
}

/** Draws the table at the stored zoom (itf-zoom), 1 by default. */
async function renderTable(view: View = makeView()) {
  const zoom = Number(localStorage.getItem('itf-zoom') ?? '1');
  const session = fakeSession();
  let current = view;
  layOut(() => current, zoom);
  const result = render(Table, { session, view });
  // The actions need the catalog.
  await Promise.resolve();
  return {
    session,
    async rerender(next: View) {
      current = next;
      await result.rerender({ session, view: next });
    },
    /** The server refuses the action of that id. */
    async refuse(id: number) {
      session.lastError = { id, code: 'invalid', message: 'refused' };
      await result.rerender({ session: { ...session }, view: current });
    },
  };
}

/** Presses at a point, then moves the pointer over the window. */
async function press(element: HTMLElement, x: number, y: number, pointerType = 'mouse') {
  await fireEvent.pointerDown(element, { clientX: x, clientY: y, pointerType });
}

/** Moves the pointer, the button still down (`buttons: 0` once it was let go unseen). */
async function moveTo(x: number, y: number, buttons = 1) {
  await fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons });
}

async function release(x: number, y: number) {
  await fireEvent.pointerUp(window, { clientX: x, clientY: y });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  interaction.reset();
});

describe('dragging a table card', () => {
  it('moves its stack once the pointer has moved 4 px, snapped to the grid', async () => {
    const { session } = await renderTable();
    // "mine" lies at 20, 340 on the screen: it is held 30 px in from its left edge, 60 down.
    await press(placed('mine'), 50, 400);
    await moveTo(53, 400);
    expect(ghosts()).toEqual([]);

    await moveTo(254, 452);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
    // The card on the table is hidden while its ghost follows the pointer.
    expect(placed('mine').classList).toContain('lifted');

    await release(254, 452);
    // Its corner at 224, 392 on the screen: 204, 352 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'move',
        card: 'mine',
        x: 200,
        y: 350,
      },
      0,
    );
  });

  it('carries every card of the stack, each at its offset, until the server answers', async () => {
    // Two attachments where they were dropped, one tucked at the default offset.
    const stack = [
      ...CARDS.filter((c) => c.id !== 'mine'),
      card('mine', { y: 300, z: 10 }),
      card('a1', { x: 40, y: 380, z: 9, parent: 'mine' }),
      card('a2', { x: 100, y: 420, z: 9, parent: 'mine' }),
      card('t1', { x: 0, y: 320, z: 9, parent: 'mine' }),
    ];
    const { session } = await renderTable(makeView({ cards: stack }));
    const ids = ['mine', 'a1', 'a2', 't1'];
    const corners = () =>
      ghosts().map((g) => [g.dataset.id, parseFloat(g.style.left), parseFloat(g.style.top)]);
    const expected = [
      ['mine', 224, 392],
      ['a1', 264, 472],
      ['a2', 324, 512],
      ['t1', 224, 412],
    ];

    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    expect(corners()).toEqual(expected);
    for (const id of ids) {
      expect(placed(id).classList, id).toContain('lifted');
    }

    await release(254, 452);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'move',
        card: 'mine',
        x: 200,
        y: 350,
      },
      0,
    );
    // Waiting for the server: the whole stack stays where it landed, on the grid.
    expect(corners()).toEqual([
      ['mine', 220, 390],
      ['a1', 260, 470],
      ['a2', 320, 510],
      ['t1', 220, 410],
    ]);
    for (const id of ids) {
      expect(placed(id).classList, id).toContain('lifted');
    }
  });

  it('counts the move in table units at another zoom', async () => {
    localStorage.setItem('itf-zoom', '2');
    const { session } = await renderTable();
    // "mine" is drawn 280 by 392 at 20, 640: held 60 px in from its left edge, 120 down.
    await press(placed('mine'), 80, 760);
    await moveTo(480, 560);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);

    await release(480, 560);
    // Its corner at 420, 440 on the screen: 400, 400 px into the surface, 200, 200 units.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'move',
        card: 'mine',
        x: 200,
        y: 200,
      },
      0,
    );
  });

  it('drag survives a new view', async () => {
    const { session, rerender } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);

    // Someone else acts meanwhile: the table is drawn again.
    await rerender(makeView({ cards: [...CARDS, card('new', { x: 600, y: 100 })] }));
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);

    await moveTo(254, 452);
    await release(254, 452);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'move',
        card: 'mine',
        x: 200,
        y: 350,
      },
      0,
    );
  });

  it('is cancelled when the card leaves the table meanwhile, and sends nothing', async () => {
    const { session, rerender } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);

    await rerender(makeView({ cards: CARDS.filter((c) => c.id !== 'mine') }));
    expect(ghosts()).toEqual([]);
    await release(254, 452);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('spectator cannot drag', async () => {
    const { session } = await renderTable(makeView({ spectator: true }));
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
    await release(254, 452);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('tucks it under the card it is dropped on', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    // Over "other", at 420, 340 on the screen.
    await moveTo(470, 420);
    expect(placed('other').classList).toContain('drop-target');
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    // Where it is dropped, behind the card.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'attach',
        card: 'mine',
        target: 'other',
        x: expect.any(Number),
        y: expect.any(Number),
        placed: true,
      },
      0,
    );
  });

  it('shows the label of the pile it would go to, and sends that', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    // Next to the discard pile, at 780, 340: within its 20 px margin, nearer than the deck.
    await moveTo(775, 400);
    expect(placed('disc:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Discard')).toBeTruthy();

    await moveTo(660, 400);
    expect(placed('disc:p0').classList).not.toContain('drop-pile');
    expect(placed('deck:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Top of deck')).toBeTruthy();

    await release(660, 400);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'toDeck',
        card: 'mine',
        where: 'top',
      },
      0,
    );
  });

  it('goes on top of the deck when dropped on its lower part', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    // The deck lies from 340 to 536 on the screen.
    await moveTo(660, 500);
    expect(placed('deck:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Top of deck')).toBeTruthy();

    await release(660, 500);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'mine', where: 'top' },
      0,
    );
  });

  it('puts an encounter card on top of the encounter deck', async () => {
    const minion = card('minion', { owner: -1, back: 'encounter', x: 200, y: 300 });
    const { session } = await renderTable(makeView({ cards: [...CARDS, minion] }));
    await press(placed('minion'), 250, 400);
    // The encounter deck lies at 20, 40 on the screen.
    await moveTo(90, 200);
    expect(placed('enc').classList).toContain('drop-pile');
    expect(screen.getByText('Top of deck')).toBeTruthy();

    await release(90, 200);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'minion', where: 'top' },
      0,
    );
  });

  it('goes back to the hand when dropped over it', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    // Over the hand, between its cards and the bottom of the window.
    await moveTo(450, 740);
    const hand = document.querySelector('.hand');
    expect(hand?.classList).toContain('drop');
    expect(hand?.classList).toContain('open');
    expect(screen.getByText('Hand')).toBeTruthy();
    // No gap opens: the card is not slotted in among the others.
    expect(document.querySelector('.hand .hcard.gap')).toBeNull();

    await release(450, 740);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' }, 0);
  });

  it('selection follows drag to own hand', async () => {
    // Alex plays a second deck, Ant-Man (p1): its card goes to its own hand, which then shows.
    const view = makeView({
      cards: [
        ...CARDS,
        card('second', { owner: 1, x: 200, y: 300 }),
        card('h4', { owner: 1, zone: 'hand' }),
      ],
    });
    view.you = { ...view.you, areas: ['p0', 'p1'] };
    view.players[0]!.decks = [
      { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 3 },
      { area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 1 },
    ];
    view.table = { ...view.table!, hands: { p0: ['h1', 'h2', 'h3'], p1: ['h4'] } };
    const { session } = await renderTable(view);
    const handIds = () =>
      [...document.querySelectorAll<HTMLElement>('.hand .hcard[data-id]')].map(
        (slot) => slot.dataset.id,
      );
    expect(handIds()).toEqual(['h1', 'h2', 'h3']);

    await press(placed('second'), 250, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).toContain('drop');
    expect(screen.getByText("Ant-Man's hand")).toBeTruthy();

    await release(450, 740);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'second' }, 1);
    expect(handIds()).not.toContain('h1');
    expect(handIds()).toContain('h4');
  });

  it("goes to its owner's hand, which then shows, while another player's row shows", async () => {
    // Alex plays Spider-Man (p0) and Ant-Man (p1), Sam She-Hulk (p2); an Ant-Man card lies in the villain's
    // row, which "Villain + player" shows above Sam's.
    localStorage.setItem('itf-view', 'focus');
    const view = makeView({ cards: [...CARDS, card('second', { owner: 1, x: 200, y: 0 })] });
    view.you = { ...view.you, areas: ['p0', 'p1'] };
    view.players = [
      {
        ...view.players[0]!,
        decks: [
          { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 3 },
          { area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 0 },
        ],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p2', heroName: 'She-Hulk', ready: true, handCount: 0 }],
      },
    ];
    view.table = {
      ...view.table!,
      piles: [
        ...view.table!.piles,
        pile('deck:p1', { owner: 1, y: 600 }),
        pile('deck:p2', { owner: 2, y: 900 }),
      ],
      hands: { p0: ['h1', 'h2', 'h3'], p1: [] },
    };
    const { session } = await renderTable(view);
    const picker = screen.getByRole('radiogroup', { name: 'Player shown' });
    await fireEvent.click(within(picker).getByRole('radio', { name: 'Sam · She-Hulk' }));
    expect(document.querySelector('.hand')).toBeNull();

    // No hand shows: the drop lands in the room an empty hand has, at the bottom middle of the table.
    await press(placed('second'), 250, 100);
    await moveTo(500, 850);
    expect(screen.getByText("Ant-Man's hand")).toBeTruthy();

    await release(500, 850);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'second' }, 1);
    expect(
      within(picker)
        .getAllByRole('radio', { checked: true })
        .map((swatch) => swatch.getAttribute('aria-label')),
    ).toEqual(['Alex · Ant-Man']);
    expect(document.querySelector('.hand')).not.toBeNull();
  });

  it("is not taken by the hand when it is another player's card or an encounter card", async () => {
    const theirs = card('theirs', { owner: 1, x: 200, y: 300 });
    const { session } = await renderTable(makeView({ cards: [...CARDS, theirs] }));
    await press(placed('theirs'), 250, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).not.toContain('drop');
    expect(screen.queryByText('Hand')).toBeNull();
    await release(450, 950);

    // The villain's card lies at 320, 40 on the screen.
    await press(placed('v'), 350, 100);
    await moveTo(450, 740);
    expect(screen.queryByText('Hand')).toBeNull();
    await release(450, 950);
    // Dropped below the table: nothing moves.
    expect(session.act).not.toHaveBeenCalled();
  });

  it('sends nothing when it is put back where it was', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(90, 400);
    await moveTo(52, 403);
    await release(52, 403);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('hides the token pill while dragging', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    const token = placed('mine').querySelector<HTMLElement>('[data-counter="token:dmg"]');
    await fireEvent.pointerEnter(token as HTMLElement);
    await waitFor(() => expect(document.querySelector('.tokpill')).not.toBeNull());

    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);
    expect(document.querySelector('.tokpill')).toBeNull();
  });

  it('shows the grid more clearly while dragging', async () => {
    await renderTable();
    const app = document.querySelector('.app');
    await press(placed('mine'), 50, 400);
    expect(app?.classList).not.toContain('dragging');
    await moveTo(150, 420);
    expect(app?.classList).toContain('dragging');
    await release(150, 420);
    expect(app?.classList).not.toContain('dragging');
  });

  it('ends a drag whose button was let go outside the window, sending nothing', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);
    // Back over the window with no button down: the pointerup was missed.
    await moveTo(254, 452, 0);
    expect(ghosts()).toEqual([]);
    await release(254, 452);
    expect(session.act).not.toHaveBeenCalled();

    // The next drag works.
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
    expect(session.act).toHaveBeenCalledOnce();
  });

  it('leaves the next click alone when a drag ends without a release', async () => {
    await renderTable();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });

    // Cancelled by the browser.
    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);
    await fireEvent.pointerCancel(window, { clientX: 150, clientY: 420 });
    // A click from the keyboard: no pointer press comes before it.
    await fireEvent.click(zoomIn);
    expect(screen.getByRole('button', { name: 'Back to 100%' }).textContent).toBe('110%');

    // Let go outside the window.
    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);
    await moveTo(160, 420, 0);
    await fireEvent.click(zoomIn);
    expect(screen.getByRole('button', { name: 'Back to 100%' }).textContent).toBe('120%');
  });

  it('opens no menu with the click or the tap that ends a drag', async () => {
    await renderTable();
    for (const pointerType of ['mouse', 'touch'] as const) {
      await press(placed('mine'), 50, 400, pointerType);
      await moveTo(254, 452);
      await release(254, 452);
      await fireEvent.click(placed('mine'));
      expect(interaction.contextMenu).toBeNull();
    }

    // A plain tap opens it.
    await press(placed('mine'), 50, 400, 'touch');
    await release(50, 400);
    await fireEvent.click(placed('mine'));
    expect(interaction.contextMenu?.element).toEqual({ kind: 'card', id: 'mine' });
  });
});

describe('dragging from a pile', () => {
  it('plays the top card of a discard pile under the card it is dropped on', async () => {
    const { session } = await renderTable(makeView({ discarded: ['d1'] }));
    // The discard pile lies at 780, 340 on the screen.
    await press(placed('disc:p0'), 830, 410);
    await moveTo(470, 420);
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    // Where it is dropped, behind the card.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        card: 'd1',
        target: 'other',
        x: expect.any(Number),
        y: expect.any(Number),
        placed: true,
      },
      0,
    );
  });

  it('keeps the card it took when another card is put on the pile meanwhile', async () => {
    const { session, rerender } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 830, 410);
    await moveTo(300, 450);

    // Another player discards the Rhino onto it.
    await rerender(makeView({ discarded: ['d1', 'd2'] }));
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['d1']);
    // The pile shows its new top card, without the one being dragged.
    const pileView = placed('disc:p0');
    expect(pileView.querySelector('img')?.getAttribute('alt')).toBe('Rhino');
    expect(pileView.querySelector('.count')?.textContent).toBe('1');

    await release(300, 450);
    // Held by its middle: its corner at 230, 352 on the screen, 210, 312 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        card: 'd1',
        x: 210,
        y: 310,
      },
      0,
    );
  });

  it('is cancelled when the card it took leaves the pile meanwhile', async () => {
    const { session, rerender } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 830, 410);
    await moveTo(300, 450);

    await rerender(makeView({ discarded: [] }));
    expect(ghosts()).toEqual([]);
    await release(300, 450);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('deals the encounter card where it lands, even over a card', async () => {
    const { session } = await renderTable();
    await press(placed('enc'), 70, 100);
    await moveTo(470, 420);
    // It is not tucked: no outline, no label.
    expect(placed('other').classList).not.toContain('drop-target');
    expect(screen.queryByText(/^Under/)).toBeNull();

    await release(470, 420);
    // Held by its middle: its corner at 400, 322 on the screen, 380, 282 on the table, in Alex's
    // row, which starts 30 above his deck (at 300).
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'deal',
        area: 'p0',
        x: 380,
        y: 280,
      },
      0,
    );
  });

  it('deals to the player whose row it lands in, or to the viewer in the villain row', async () => {
    const { session } = await renderTable(makeView({ withSam: true }));
    // Sam's deck lies at 600 on the table: his row starts at 570, 610 on the screen.
    await press(placed('enc'), 70, 100);
    await moveTo(300, 700);
    await release(300, 700);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'deal', area: 'p1', x: 210, y: 560 }, 0);

    await press(placed('enc'), 70, 100);
    await moveTo(600, 200);
    await release(600, 200);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'deal', area: 'p0', x: 510, y: 60 }, 0);
  });

  it('deals the top card of the encounter deck face down where it lands', async () => {
    const { session } = await renderTable();
    await press(placed('enc'), 70, 100);
    await moveTo(300, 450);
    // A face-down encounter card, centred on the pointer.
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Encounter card back"]')).not.toBeNull();

    await release(300, 450);
    // Its corner at 230, 352 on the screen: 210, 312 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'deal',
        area: 'p0',
        x: 210,
        y: 310,
      },
      0,
    );
  });
});

describe("dragging the top card of the viewer's deck", () => {
  it('lowers the hand once the pointer leaves it, the drawn card still flying in', async () => {
    const { session, rerender } = await renderTable();
    await press(placed('deck:p0'), 690, 410);
    await moveTo(450, 740);
    const hand = document.querySelector('.hand')!;
    expect(hand.classList).toContain('open');
    await release(450, 740);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'draw', n: 1 }, 0);
    // Dropped on the hand, the pointer still over it: the hand stays up.
    expect(hand.classList).toContain('open');

    const next = makeView();
    next.table = {
      ...next.table!,
      cards: [...next.table!.cards, card('h4', { zone: 'hand' })],
      hands: { p0: ['h1', 'h2', 'h3', 'h4'] },
    };
    await rerender(next);
    // The drawn card flies in from the deck: it is drawn there until it lands.
    const drawn = handCard('h4');
    drawn.getBoundingClientRect = () => domRect(620, 340, 140, 196);
    drawn.getAnimations = () => [{ playState: 'running' } as Animation];

    // Above the resting cards, though over the flying one: the hand lowers.
    await moveTo(650, 450, 0);
    expect(hand.classList).not.toContain('open');
  });

  it('plays it face up where it lands, showing only its back until then', async () => {
    const { session } = await renderTable();
    // The deck lies at 620, 340 on the screen.
    await press(placed('deck:p0'), 690, 410);
    await moveTo(300, 450);
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Player card back"]')).not.toBeNull();
    expect(placed('deck:p0').querySelector('.count')?.textContent).toBe('29');

    await release(300, 450);
    // Held by its middle: its corner at 230, 352 on the screen, 210, 312 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        pile: 'deck:p0',
        x: 210,
        y: 310,
      },
      0,
    );
  });

  it('draws it when dropped on the hand, and discards it on the discard pile', async () => {
    const { session } = await renderTable();
    await press(placed('deck:p0'), 690, 410);
    await moveTo(450, 740);
    expect(screen.getByText('Hand')).toBeTruthy();
    await release(450, 740);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'draw', n: 1 }, 0);

    await press(placed('deck:p0'), 690, 410);
    await moveTo(850, 400);
    expect(screen.getByText('Discard')).toBeTruthy();
    await release(850, 400);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discardTop', pile: 'deck:p0', n: 1 }, 0);
  });

  it('plays the top card of a side deck that shows it, its face shown while dragged', async () => {
    const view = makeView();
    view.table!.cards.push(card('inv', { code: '01094', zone: 'pile', home: 'side:p0:0' }));
    view.table!.piles.push(
      pile('side:p0:0', {
        kind: 'sideDeck',
        owner: 0,
        x: 920,
        y: 300,
        count: 5,
        label: 'Invocation',
        topFaceUp: true,
        cards: ['inv'],
      }),
    );
    const { session } = await renderTable(view);
    // The side deck lies at 940, 340 on the screen.
    await press(placed('side:p0:0'), 1010, 410);
    await moveTo(300, 450);
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Rhino"]')).not.toBeNull();
    // Taken off the deck: the next card is unknown.
    expect(placed('side:p0:0').querySelector('[alt="Player card back"]')).not.toBeNull();

    await release(300, 450);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'play', pile: 'side:p0:0', x: 210, y: 310 },
      0,
    );
  });

  it('plays the top card of a side deck tucked under the card it is dropped on', async () => {
    const view = makeView();
    view.table!.cards.push(card('sense', { code: '01001', zone: 'pile', home: 'side:p0:0' }));
    view.table!.piles.push(
      pile('side:p0:0', {
        kind: 'sideDeck',
        owner: 0,
        x: 920,
        y: 300,
        count: 5,
        label: 'Sense',
        topFaceUp: true,
        cards: ['sense'],
      }),
    );
    const { session } = await renderTable(view);
    await press(placed('side:p0:0'), 1010, 410);
    // Over "other", at 420, 340 on the screen.
    await moveTo(470, 420);
    expect(placed('other').classList).toContain('drop-target');
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        pile: 'side:p0:0',
        target: 'other',
        x: expect.any(Number),
        y: expect.any(Number),
        placed: true,
      },
      0,
    );
  });

  it("shows the own back of a side deck's unknown top card while it is dragged", async () => {
    const view = makeView();
    view.table!.piles.push(
      pile('side:p0:0', {
        kind: 'sideDeck',
        owner: 0,
        x: 920,
        y: 300,
        count: 3,
        label: 'Gift',
        back: 'encounter',
      }),
    );
    await renderTable(view);
    await press(placed('side:p0:0'), 1010, 410);
    await moveTo(300, 450);
    const [ghost] = ghosts();
    const back = ghost?.querySelector('[aria-label="Gift card back"]');
    expect(back?.querySelector('img')?.getAttribute('src')).toContain('EncounterBack.jpg');
    expect(back?.querySelector('.caption')?.textContent).toBe('GIFT');
    await release(300, 450);
  });

  it("cannot be dragged from another player's deck", async () => {
    const view = makeView({ withSam: true });
    const { session } = await renderTable(view);
    await press(placed('deck:p1'), 690, 710);
    await moveTo(300, 450);
    expect(ghosts()).toEqual([]);
    await release(300, 450);
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('dragging a hand card', () => {
  it('plays it where it lands on the table', async () => {
    const { session } = await renderTable();
    await press(handCard('h2'), 500, 780);
    await moveTo(300, 450);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['h2']);
    // Out of the fan meanwhile.
    expect(document.querySelector('.hand .hcard[data-id="h2"]')).toBeNull();

    await release(300, 450);
    // Held 60 px in from its left edge and 80 down, out of 132 by 185: at table size (140 by 196)
    // its corner lands at 236.4, 365.2 on the screen, 216.4, 325.2 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        card: 'h2',
        x: 220,
        y: 330,
      },
      0,
    );
  });

  it('plays it under the card it is dropped on', async () => {
    const { session } = await renderTable();
    await press(handCard('h2'), 500, 780);
    // Over "other", at 420, 340 on the screen.
    await moveTo(470, 420);
    expect(placed('other').classList).toContain('drop-target');
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    // Where it is dropped, behind the card.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'play',
        card: 'h2',
        target: 'other',
        x: expect.any(Number),
        y: expect.any(Number),
        placed: true,
      },
      0,
    );
  });

  it('reorders the hand, the other cards making room, and the hand stays open', async () => {
    const { session } = await renderTable();
    await press(handCard('h1'), 350, 780);
    // Over the hand, right of both other cards: with h1 out of the fan, h2 and h3 are drawn at 300
    // and 440, their middles at 366 and 506.
    await moveTo(700, 760);
    const slots = [...document.querySelectorAll<HTMLElement>('.hand .hcard')];
    expect(slots.map((slot) => slot.dataset.id ?? 'gap')).toEqual(['h2', 'h3', 'gap']);
    expect(slots[2]?.classList).toContain('gap');
    expect(document.querySelector('.hand')?.classList).toContain('open');

    await release(700, 760);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'handOrder',
        area: 'p0',
        cards: ['h2', 'h3', 'h1'],
      },
      0,
    );
    expect(document.querySelector('.hand')?.classList).toContain('open');
  });

  it('can be dropped on a pile', async () => {
    const { session } = await renderTable();
    await press(handCard('h3'), 650, 780);
    await moveTo(800, 400);
    expect(screen.getByText('Discard')).toBeTruthy();
    await release(800, 400);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'h3' }, 0);
  });

  it('goes on top of its deck when dropped on it', async () => {
    const { session } = await renderTable();
    await press(handCard('h3'), 650, 780);
    await moveTo(660, 500);
    expect(placed('deck:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Top of deck')).toBeTruthy();

    await release(660, 500);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'toDeck', card: 'h3', where: 'top' },
      0,
    );
  });
});

describe('the hand on touch', () => {
  const finger = { pointerType: 'touch' };

  function hand(): HTMLElement {
    return screen.getByRole('list', { name: 'Your hand' });
  }

  function isOpen(): boolean {
    return hand().classList.contains('open');
  }

  async function touchDown(element: HTMLElement, x: number, y: number) {
    await fireEvent.pointerDown(element, { ...finger, clientX: x, clientY: y });
  }

  async function touchMove(x: number, y: number) {
    await fireEvent.pointerMove(window, { ...finger, clientX: x, clientY: y, buttons: 1 });
  }

  /** The finger lifts: it lets go, then leaves the window, as a lifted finger does. */
  async function touchUp(x: number, y: number) {
    await fireEvent.pointerUp(window, { ...finger, clientX: x, clientY: y });
    await fireEvent.pointerLeave(document.documentElement, finger);
  }

  /** A tap on an element: a press, the lift, then the click it makes. */
  async function tap(element: HTMLElement, x: number, y: number) {
    await touchDown(element, x, y);
    await fireEvent.pointerUp(element, { ...finger, clientX: x, clientY: y });
    await fireEvent.click(element, { clientX: x, clientY: y });
    await fireEvent.pointerLeave(document.documentElement, finger);
  }

  /** Raises the hand with a tap on one of its resting cards. */
  async function raise() {
    await tap(handCard('h2'), 500, 780);
    expect(isOpen()).toBe(true);
  }

  it('a tap on the resting hand raises it and keeps it up once the finger lifts', async () => {
    await renderTable();
    expect(isOpen()).toBe(false);

    await tap(handCard('h2'), 500, 780);
    expect(isOpen()).toBe(true);
    expect(document.querySelector('.veil')?.classList).toContain('open');
    // The first tap only raises the hand: no card is selected yet.
    expect(interaction.locked).toBe(false);

    // A finger moving elsewhere has no band to leave.
    await fireEvent.pointerMove(window, { ...finger, clientX: 50, clientY: 50 });
    expect(isOpen()).toBe(true);
  });

  it('a tap selects a card of the raised hand, another moves it, a tap on it lets go', async () => {
    await renderTable();
    await raise();

    await tap(handCard('h2'), 500, 780);
    expect(handCard('h2').classList).toContain('locked');
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'h2' });
    // The raised hand shows the card large enough: no side preview.
    expect(interaction.previewed).toBeNull();

    await tap(handCard('h3'), 650, 780);
    expect(handCard('h3').classList).toContain('locked');
    expect(handCard('h2').classList).not.toContain('locked');

    await tap(handCard('h3'), 650, 780);
    expect(handCard('h3').classList).not.toContain('locked');
    expect(interaction.locked).toBe(false);
    expect(isOpen()).toBe(true);
  });

  it('a tap on the table lowers it and does what it does there', async () => {
    await renderTable();
    await raise();
    await tap(handCard('h2'), 500, 780);

    await tap(placed('mine'), 50, 400);
    expect(isOpen()).toBe(false);
    expect(handCard('h2').classList).not.toContain('locked');
    // The card's menu opens as well.
    expect(interaction.contextMenu?.element).toEqual({ kind: 'card', id: 'mine' });
  });

  it('Escape lowers it', async () => {
    await renderTable();
    await raise();

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });

  it('a swipe down lowers it, dragging no card', async () => {
    const { session } = await renderTable();
    await raise();

    await touchDown(handCard('h2'), 500, 760);
    await touchMove(501, 766);
    expect(ghosts()).toEqual([]);
    expect(isOpen()).toBe(true);
    // 40 px below the press.
    await touchMove(503, 800);
    expect(isOpen()).toBe(false);

    await touchUp(503, 800);
    // The click the lift makes on the card is no tap that would raise the hand again.
    await fireEvent.click(handCard('h2'));
    expect(isOpen()).toBe(false);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('a card dragged to the table is played, and the hand lowers', async () => {
    const { session } = await renderTable();
    await raise();

    await touchDown(handCard('h2'), 500, 780);
    await touchMove(500, 770);
    await touchMove(300, 450);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['h2']);

    await touchUp(300, 450);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h2' }),
      0,
    );
    expect(isOpen()).toBe(false);
  });

  it('a reorder keeps it raised', async () => {
    const { session } = await renderTable();
    await raise();

    await touchDown(handCard('h1'), 350, 780);
    await touchMove(700, 760);
    await touchUp(700, 760);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'handOrder', area: 'p0', cards: ['h2', 'h3', 'h1'] },
      0,
    );
    expect(isOpen()).toBe(true);
  });

  it('another hand shown keeps it raised', async () => {
    const view = makeView({ cards: [...CARDS, card('h4', { owner: 1, zone: 'hand' })] });
    view.you = { ...view.you, areas: ['p0', 'p1'] };
    view.players[0]!.decks = [
      { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 3 },
      { area: 'p1', heroName: 'Ant-Man', ready: true, handCount: 1 },
    ];
    view.table = { ...view.table!, hands: { p0: ['h1', 'h2', 'h3'], p1: ['h4'] } };
    await renderTable(view);
    await raise();
    await tap(handCard('h2'), 500, 780);

    await fireEvent.keyDown(window, { key: 'q' });
    expect(document.querySelector('.hand .hcard[data-id="h4"]')).not.toBeNull();
    expect(isOpen()).toBe(true);
    // The selected card is no longer shown: its selection goes.
    expect(interaction.locked).toBe(false);
  });

  it('a mouse takes over from the finger, following its band again', async () => {
    await renderTable();
    await raise();

    // Far above the cards, at 700.
    await fireEvent.pointerMove(window, { clientX: 500, clientY: 300 });
    expect(isOpen()).toBe(false);
  });
});

describe('telling the other players about the drag', () => {
  type Fields = { drag?: unknown };

  /** The drags sent with the session's presence, in order. */
  function dragsSent(session: { sendPresence: ReturnType<typeof vi.fn> }): unknown[] {
    return session.sendPresence.mock.calls
      .map(([fields]) => fields as Fields)
      .filter((fields) => 'drag' in fields)
      .map((fields) => fields.drag);
  }

  it('tells where it is over the table, and null once when it leaves it', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    // Its corner at 224, 392 on the screen: 204, 352 on the table, not snapped.
    expect(dragsSent(session)).toEqual([{ cards: ['mine'], x: 204, y: 352 }]);

    // Below the table.
    await moveTo(500, 950);
    await moveTo(510, 960);
    await release(510, 960);
    expect(dragsSent(session)).toEqual([{ cards: ['mine'], x: 204, y: 352 }, null]);
  });

  it('ends with null when it is dropped', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
    expect(dragsSent(session).at(-1)).toBeNull();
  });

  it('tells nothing of a hand card over the hand, and hides its id over the table', async () => {
    const { session } = await renderTable();
    await press(handCard('h1'), 350, 780);
    await moveTo(700, 760);
    expect(dragsSent(session)).toEqual([]);

    await moveTo(300, 450);
    expect(dragsSent(session)).toEqual([expect.objectContaining({ cards: ['hidden-0'] })]);
    expect(JSON.stringify(dragsSent(session))).not.toContain('h1');
  });

  it('keeps the real id of a card from a public pile', async () => {
    const { session } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 830, 410);
    await moveTo(300, 450);
    expect(dragsSent(session)).toEqual([expect.objectContaining({ cards: ['d1'] })]);
  });

  it("carries the encounter deck's pile id for its unknown top card", async () => {
    const { session } = await renderTable();
    await press(placed('enc'), 70, 100);
    await moveTo(300, 150);
    expect(dragsSent(session)).toEqual([expect.objectContaining({ cards: ['enc'] })]);
  });

  it('carries 50 cards at most', async () => {
    const tucked = Array.from({ length: 59 }, (_, i) => card(`t${i}`, { parent: 'mine', z: 0 }));
    const { session } = await renderTable(makeView({ cards: [...CARDS, ...tucked] }));
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);

    const [drag] = dragsSent(session) as { cards: string[] }[];
    expect(drag?.cards).toHaveLength(50);
    expect(drag?.cards[0]).toBe('mine');
  });

  it('sends nothing for a spectator', async () => {
    const { session } = await renderTable(makeView({ spectator: true }));
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
    expect(dragsSent(session)).toEqual([]);
  });
});

describe('a drop waiting for the server', () => {
  /** Drags "mine" so that its corner lands at 204, 352 on the table, and lets go. */
  async function dropMine() {
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
  }

  /** The table once the server took the move of "mine" to 200, 350. */
  function moved(): View {
    return makeView({
      cards: CARDS.map((c) => (c.id === 'mine' ? { ...c, x: 200, y: 350 } : c)),
    });
  }

  function handOrder(): string[] {
    return [...document.querySelectorAll<HTMLElement>('.hand .hcard')].map(
      (slot) => slot.dataset.id ?? 'gap',
    );
  }

  it('keeps a moved card on its grid spot until the next view', async () => {
    const { rerender } = await renderTable();
    await dropMine();
    // Where the move puts it: 200, 350 on the table, 220, 390 on the screen.
    const [ghost] = ghosts();
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
    expect(ghost?.style.left).toBe('220px');
    expect(ghost?.style.top).toBe('390px');
    // Set down: no longer held up under the pointer.
    expect(ghost?.classList).toContain('landed');
    expect(placed('mine').classList).toContain('lifted');

    await rerender(moved());
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
    expect(placed('mine').style.left).toBe('200px');
  });

  it('puts the card back at once when the action could not be sent', async () => {
    const { session } = await renderTable();
    session.act.mockReturnValue(null);
    await dropMine();
    expect(session.act).toHaveBeenCalledOnce();
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
  });

  it('puts the card back when the server refuses that action', async () => {
    const { refuse } = await renderTable();
    await dropMine();
    // The refusal of another action changes nothing.
    await refuse(7);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);

    await refuse(1);
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
  });

  it('puts the card back after 2 s without an answer', async () => {
    await renderTable();
    vi.useFakeTimers();
    await dropMine();
    await vi.advanceTimersByTimeAsync(1999);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
    await vi.advanceTimersByTimeAsync(1);
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
  });

  it('keeps a played hand card out of the hand, where it was played', async () => {
    const { rerender } = await renderTable();
    await press(handCard('h2'), 500, 780);
    await moveTo(300, 450);
    await release(300, 450);
    // Played at 220, 330 on the table: 240, 370 on the screen.
    const [ghost] = ghosts();
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['h2']);
    expect(ghost?.style.left).toBe('240px');
    expect(ghost?.style.top).toBe('370px');
    expect(handOrder()).toEqual(['h1', 'h3']);

    const played = makeView({
      cards: CARDS.map((c) => (c.id === 'h2' ? { ...c, zone: 'table', x: 220, y: 330 } : c)),
    });
    played.table!.hands = { p0: ['h1', 'h3'] };
    await rerender(played);
    expect(ghosts()).toEqual([]);
    expect(placed('h2').style.left).toBe('220px');
  });

  it('keeps the new order of a reordered hand', async () => {
    const { rerender } = await renderTable();
    await press(handCard('h1'), 350, 780);
    await moveTo(700, 760);
    await release(700, 760);
    expect(handOrder()).toEqual(['h2', 'h3', 'h1']);
    expect(ghosts()).toEqual([]);

    const reordered = makeView();
    reordered.table!.hands = { p0: ['h2', 'h3', 'h1'] };
    await rerender(reordered);
    expect(handOrder()).toEqual(['h2', 'h3', 'h1']);
  });

  it('puts a reordered hand back in its order when the server refuses it', async () => {
    const { refuse } = await renderTable();
    await press(handCard('h1'), 350, 780);
    await moveTo(700, 760);
    await release(700, 760);
    await refuse(1);
    expect(handOrder()).toEqual(['h1', 'h2', 'h3']);
  });

  it('keeps the card taken from a pile out of it', async () => {
    const { rerender } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 830, 410);
    await moveTo(300, 450);
    await release(300, 450);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['d1']);
    expect(placed('disc:p0').classList).toContain('empty');

    const view = makeView();
    view.table!.cards.push(card('d1', { x: 210, y: 310 }));
    await rerender(view);
    expect(ghosts()).toEqual([]);
    expect(placed('d1').style.left).toBe('210px');
  });

  it('deals the encounter card face down where it lands, the deck one card lower', async () => {
    await renderTable();
    await press(placed('enc'), 70, 100);
    await moveTo(300, 450);
    await release(300, 450);
    // Dealt at 210, 310 on the table: 230, 350 on the screen.
    expect(ghosts()).toHaveLength(1);
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Encounter card back"]')).not.toBeNull();
    expect(ghost?.style.left).toBe('230px');
    expect(ghost?.style.top).toBe('350px');
    expect(placed('enc').querySelector('.count')?.textContent).toBe('19');
  });
});

describe('dragging the first player token', () => {
  function token(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.surface .marker');
  }

  function tokenGhost(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.draglayer .marker');
  }

  it("moves it to another player's row, snapped to the grid", async () => {
    const { session, rerender } = await renderTable(makeView({ withSam: true }));
    // The token lies at 880, 380 on the screen: it is held 20 px in from its corner.
    await press(token()!, 900, 400);
    await moveTo(204, 703);
    expect(token()).toBeNull();
    expect(tokenGhost()).not.toBeNull();

    await release(204, 703);
    // Its corner at 184, 683 on the screen: 164, 643 on the table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'marker', name: 'firstPlayer', x: 160, y: 640 },
      0,
    );
    // It waits where it was dropped until the next view.
    expect(token()).toBeNull();
    expect(tokenGhost()).not.toBeNull();

    await rerender(makeView({ withSam: true, firstPlayerY: 640 }));
    expect(tokenGhost()).toBeNull();
    expect(token()?.style.top).toBe('640px');
  });

  it('tells the other players where it is, and null once dropped', async () => {
    const { session } = await renderTable(makeView({ withSam: true }));
    await press(token()!, 900, 400);
    await moveTo(204, 703);
    await release(204, 703);

    const drags = session.sendPresence.mock.calls
      .map(([fields]) => fields as { drag?: unknown })
      .filter((fields) => 'drag' in fields)
      .map((fields) => fields.drag);
    // Its corner at 184, 683 on the screen: 164, 643 on the table, not snapped.
    expect(drags).toEqual([{ cards: [], token: 'firstPlayer', x: 164, y: 643 }, null]);
  });

  it('sends nothing when put back where it was', async () => {
    const { session } = await renderTable(makeView({ withSam: true }));
    await press(token()!, 900, 400);
    await moveTo(910, 400);
    await release(901, 401);

    expect(session.act).not.toHaveBeenCalled();
    expect(token()).not.toBeNull();
  });

  it('a spectator cannot drag it', async () => {
    const { session } = await renderTable(makeView({ withSam: true, spectator: true }));
    await press(token()!, 900, 400);
    await moveTo(204, 703);
    await release(204, 703);

    expect(session.act).not.toHaveBeenCalled();
    expect(tokenGhost()).toBeNull();
  });
});

describe('the card under a still pointer after the viewer acts', () => {
  /** The browser's hit test, from the laid out boxes: the topmost table card or hand card under the point. */
  function hitTestFrom(): void {
    document.elementFromPoint = (x: number, y: number) => {
      const candidates = [
        ...document.querySelectorAll<HTMLElement>('.surface .card, .hand .hcard'),
      ];
      const under = candidates.filter((element) => {
        const box = element.getBoundingClientRect();
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      });
      return under.at(-1) ?? null;
    };
  }

  afterEach(() => {
    // jsdom has no hit test of its own.
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('hovers the card dealt under the pointer, so that F flips it, and F again flips it back', async () => {
    hitTestFrom();
    // A card with two faces: F turns it from one to the other.
    const twoFaced = (code: string): CardInfo | null => {
      if (code !== '01097') {
        return infoOf(code);
      }
      const face = (name: string): PackFace => ({
        name,
        type: 'side_scheme',
        size: 'std',
        images: [`${name}.png`],
      });
      return {
        card: { code, faces: [face('A'), face('B')], back: 'encounter', quantity: 1 },
        face: 0,
      };
    };
    vi.mocked(knownCard).mockImplementation(twoFaced);
    const { session, rerender } = await renderTable();
    await press(placed('enc'), 70, 100);
    await moveTo(300, 450);
    await release(300, 450);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'deal', area: 'p0', x: 210, y: 310 }, 0);

    // The server deals it face down where it was dropped, under the pointer, which has not moved.
    const dealt = (extra: Partial<TableCard>) =>
      card('dealt', { back: 'encounter', owner: -1, x: 210, y: 310, z: 5, ...extra });
    await rerender(makeView({ cards: [...CARDS, dealt({ faceDown: true, code: undefined })] }));
    await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'card', id: 'dealt' }));

    await fireEvent.keyDown(window, { key: 'f' });
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'flip', card: 'dealt' }, 0);

    // Turned face up: it is still the one the keys act on, and turns to its other face.
    await rerender(makeView({ cards: [...CARDS, dealt({ code: '01097' })] }));
    await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'card', id: 'dealt' }));
    await fireEvent.keyDown(window, { key: 'f' });
    expect(session.act).toHaveBeenCalledTimes(3);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'flip', card: 'dealt' }, 0);
  });

  it('hovers the discard pile a card was dropped on, so that the keys act on it', async () => {
    hitTestFrom();
    const { session, rerender } = await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(830, 400);
    await release(830, 400);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discard', card: 'mine' }, 0);

    // The server puts it on the discard pile, under the pointer, which has not moved.
    const others = CARDS.filter((c) => c.id !== 'mine');
    await rerender(makeView({ cards: others, discarded: ['d1'] }));
    await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'pile', id: 'disc:p0' }));
  });

  it("hovers a side deck's discard pile a card was dropped on", async () => {
    hitTestFrom();
    /** Alex's Invocation deck and its discard pile, the Invocation card on the table or discarded. */
    const invocation = (discarded: boolean): View => {
      const inv = discarded
        ? card('inv', { zone: 'pile', home: 'side:p0:0' })
        : card('inv', { x: 200, y: 300, home: 'side:p0:0' });
      const view = makeView({ cards: [...CARDS, inv] });
      view.table!.piles.push(
        pile('side:p0:0', {
          kind: 'sideDeck',
          owner: 0,
          x: 920,
          y: 300,
          count: 3,
          label: 'Invocation',
        }),
        pile('sided:p0:0', {
          kind: 'sideDiscard',
          owner: 0,
          x: 920,
          y: 600,
          count: discarded ? 1 : 0,
          label: 'Invocation',
          cards: discarded ? ['inv'] : [],
        }),
      );
      return view;
    };
    const { session, rerender } = await renderTable(invocation(false));
    // The side discard pile lies at 940, 640 on the screen.
    await press(placed('inv'), 270, 400);
    await moveTo(1000, 700);
    await release(1000, 700);
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'discard', card: 'inv' }, 0);

    await rerender(invocation(true));
    await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'pile', id: 'sided:p0:0' }));
    await fireEvent.keyDown(window, { key: 'k' });
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'search', pile: 'sided:p0:0' }, 0);
  });

  it("hovers what another player's action puts under the pointer, and drops what it takes away", async () => {
    hitTestFrom();
    const { rerender } = await renderTable();
    await moveTo(300, 450, 0);

    const dealt = card('dealt', {
      back: 'encounter',
      owner: -1,
      faceDown: true,
      code: undefined,
      x: 210,
      y: 310,
    });
    await rerender(makeView({ cards: [...CARDS, dealt] }));
    await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'card', id: 'dealt' }));

    // Moved away from under the pointer by someone else: nothing is hovered there any more.
    await rerender(makeView({ cards: [...CARDS, { ...dealt, x: 700, y: 600 }] }));
    await waitFor(() => expect(interaction.hovered).toBeNull());
  });

  it('keeps the hover while the context menu is open, whatever the view moves', async () => {
    hitTestFrom();
    const { rerender } = await renderTable();
    await moveTo(300, 450, 0);
    interaction.openContextMenu({ kind: 'card', id: 'mine' }, { x: 300, y: 450 });

    await rerender(makeView({ cards: CARDS.map((c) => (c.id === 'mine' ? { ...c, x: 700 } : c)) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
  });
});

describe('dragging the active counter', () => {
  const ACTIVE = { x: 400, y: 100 };

  function counter(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.surface .marker[data-marker="active"]');
  }

  it("drag active counter sends {kind:'marker', name:'active', x, y}", async () => {
    const { session } = await renderTable(makeView({ withSam: true, active: ACTIVE }));
    // The counter lies at 420, 140 on the screen: it is held 20 px in from its corner.
    await press(counter()!, 440, 160);
    await moveTo(204, 703);
    await release(204, 703);

    // Its corner at 184, 683 on the screen: 164, 643 on the table, snapped.
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'marker', name: 'active', x: 160, y: 640 },
      0,
    );
  });

  it('tells the other players which marker it is', async () => {
    const { session } = await renderTable(makeView({ withSam: true, active: ACTIVE }));
    await press(counter()!, 440, 160);
    await moveTo(204, 703);
    await release(204, 703);

    const drags = session.sendPresence.mock.calls
      .map(([fields]) => fields as { drag?: unknown })
      .filter((fields) => 'drag' in fields)
      .map((fields) => fields.drag);
    expect(drags).toEqual([{ cards: [], token: 'active', x: 164, y: 643 }, null]);
  });

  it('is not drawn when the table has none', async () => {
    await renderTable(makeView());
    expect(document.querySelector('.surface .marker[data-marker="active"]')).toBeNull();
    expect(document.querySelector('.surface .marker[data-marker="firstPlayer"]')).not.toBeNull();
  });

  it('shows the tooltip of a movable counter to players only', async () => {
    await renderTable(makeView({ active: ACTIVE }));
    expect(counter()?.dataset.tip).toBe('Active counter: drag to move');
  });

  it('a spectator cannot drag it', async () => {
    const { session } = await renderTable(makeView({ spectator: true, active: ACTIVE }));
    await press(counter()!, 440, 160);
    await moveTo(204, 703);
    await release(204, 703);
    expect(session.act).not.toHaveBeenCalled();
  });
});
