// Dragging several cards selected with the rubber band (spec 5.2). The
// fixtures mirror DragLayer.test.ts: the screen at zoom 1, the surface 20 px
// in from the left and 40 px down from the top, the hand at the bottom.
import { fireEvent, render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  CardView as TableCard,
  PackFace,
  PileView,
  PresenceState,
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

// The villain's row at the top, Alex's 300 below it: "mine" and "other" are Alex's cards.
const CARDS = [
  card('mine', { y: 300, z: 1 }),
  card('other', { x: 400, y: 300, z: 2 }),
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

/** Alex (p0) with Rhino. */
function makeView(cards: TableCard[] = CARDS): View {
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
        decks: [{ area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 3 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: PILES,
      hands: { p0: ['h1', 'h2', 'h3'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: 340 },
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

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

const SURFACE = { left: 20, top: 40 };
const HAND_TOP = 700;

/** Lays the table out on the screen at zoom 1; `view` gives the table cards and piles their place. */
function layOut(view: () => View): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('surface')) {
      return domRect(SURFACE.left, SURFACE.top, 1200, 1200);
    }
    const id = (this as HTMLElement).dataset.id;
    if (this.closest('.surface') && id) {
      const table = view().table;
      const placed =
        table?.cards.find((c) => c.id === id && c.zone === 'table') ??
        table?.piles.find((p) => p.id === id);
      if (placed) {
        return domRect(SURFACE.left + placed.x, SURFACE.top + placed.y, 140, 196);
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

/** The ghosts drawn in the drag layer: their ids and corners. */
function ghosts(): [string | undefined, number, number][] {
  return [...document.querySelectorAll<HTMLElement>('.draglayer .card')].map((g) => [
    g.dataset.id,
    parseFloat(g.style.left),
    parseFloat(g.style.top),
  ]);
}

/** Draws the table with these cards selected. */
async function renderTable(view: View, group: string[]) {
  const session = fakeSession();
  layOut(() => view);
  const result = render(Table, { session, view });
  // The actions need the catalog.
  await Promise.resolve();
  interaction.setGroup(new Set(group));
  return {
    session,
    /** The server refuses the action of that id. */
    async refuse(id: number) {
      session.lastError = { id, code: 'invalid', message: 'refused' };
      await result.rerender({ session: { ...session }, view });
    },
  };
}

async function press(element: HTMLElement, x: number, y: number) {
  await fireEvent.pointerDown(element, { clientX: x, clientY: y, pointerType: 'mouse' });
}

async function moveTo(x: number, y: number) {
  await fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons: 1 });
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
  interaction.reset();
});

describe('dragging a group of cards', () => {
  it('lifts every selected stack, each at its offset from the pressed card', async () => {
    // An attachment under "mine", selected with it.
    const cards = [...CARDS, card('a1', { x: 40, y: 380, z: 0, parent: 'mine' })];
    await renderTable(makeView(cards), ['mine', 'a1', 'other']);
    // "mine" lies at 20, 340 on the screen: it is held 30 px in from its left edge, 60 down.
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);

    expect(ghosts()).toEqual([
      ['mine', 224, 392],
      ['a1', 264, 472],
      ['other', 624, 392],
    ]);
    for (const id of ['mine', 'a1', 'other']) {
      expect(placed(id).classList, id).toContain('lifted');
    }
    expect(placed('v').classList).not.toContain('lifted');
  });

  it('sends one group action, moving every card by the same offset', async () => {
    const { session } = await renderTable(makeView(), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);

    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'group',
        actions: [
          { kind: 'move', card: 'mine', x: 200, y: 350 },
          { kind: 'move', card: 'other', x: 600, y: 350 },
        ],
      },
      0,
    );
    // Waiting for the server: both lie where they landed, on the grid.
    expect(ghosts()).toEqual([
      ['mine', 220, 390],
      ['other', 620, 390],
    ]);
    // A table move keeps the selection.
    expect([...interaction.group]).toEqual(['mine', 'other']);
  });

  it('moves the group where it is dropped over another card, tucking nothing', async () => {
    const { session } = await renderTable(makeView(), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    // Over the villain's card, at 320, 40 on the screen: the corner of "mine" right on it.
    await moveTo(350, 100);
    expect(placed('v').classList).not.toContain('drop-target');
    expect(screen.queryByText(/^Under/)).toBeNull();

    await release(350, 100);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'group',
        actions: [
          { kind: 'move', card: 'mine', x: 300, y: 0 },
          { kind: 'move', card: 'other', x: 700, y: 0 },
        ],
      },
      0,
    );
  });

  it('discards every card on the discard pile', async () => {
    const { session } = await renderTable(makeView(), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    // Next to the discard pile, at 780, 340 on the screen.
    await moveTo(775, 400);
    expect(placed('disc:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Discard')).toBeTruthy();

    await release(775, 400);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'group',
        actions: [
          { kind: 'discard', card: 'mine' },
          { kind: 'discard', card: 'other' },
        ],
      },
      0,
    );
  });

  it("takes the group into the hand when every card is the viewer's", async () => {
    const { session } = await renderTable(makeView(), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).toContain('drop');
    expect(screen.getByText('Hand')).toBeTruthy();

    await release(450, 740);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      {
        kind: 'group',
        actions: [
          { kind: 'toHand', card: 'mine' },
          { kind: 'toHand', card: 'other' },
        ],
      },
      0,
    );
  });

  it("offers no hand when a card of the group is another player's", async () => {
    const theirs = card('theirs', { owner: 1, x: 200, y: 300, z: 3 });
    const { session } = await renderTable(makeView([...CARDS, theirs]), ['mine', 'theirs']);
    await press(placed('mine'), 50, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).not.toContain('drop');
    expect(screen.queryByText('Hand')).toBeNull();

    // Dropped below the table: nothing moves.
    await release(450, 950);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('offers neither the hand nor a pile when the group holds an identity card', async () => {
    const cards = CARDS.map((c) => (c.id === 'other' ? { ...c, identity: true } : c));
    const { session } = await renderTable(makeView(cards), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).not.toContain('drop');
    await moveTo(775, 400);
    expect(placed('disc:p0').classList).not.toContain('drop-pile');

    // Dropped below the table: nothing moves.
    await release(450, 950);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('puts every card back when the server refuses the group', async () => {
    const { refuse } = await renderTable(makeView(), ['mine', 'other']);
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
    expect(ghosts().map(([id]) => id)).toEqual(['mine', 'other']);
    expect(placed('other').classList).toContain('lifted');

    await refuse(1);
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
    expect(placed('other').classList).not.toContain('lifted');
  });

  it("tells the other players the pressed card's stack first, at its corner", async () => {
    const cards = [...CARDS, card('a1', { x: 40, y: 380, z: 0, parent: 'mine' })];
    const { session } = await renderTable(makeView(cards), ['mine', 'other']);
    // "other" lies at 420, 340 on the screen: held 30 px in from its left edge, 60 down.
    await press(placed('other'), 450, 400);
    await moveTo(454, 452);

    const drags = session.sendPresence.mock.calls
      .map(([fields]) => fields as { drag?: unknown })
      .filter((fields) => 'drag' in fields)
      .map((fields) => fields.drag);
    // Its corner at 424, 392 on the screen: 404, 352 on the table.
    expect(drags).toEqual([{ cards: ['other', 'mine', 'a1'], x: 404, y: 352 }]);
  });

  it('clears the selection when a card outside it is pressed, then drags that card alone', async () => {
    await renderTable(makeView(), ['mine', 'other']);
    // The villain's card lies at 320, 40 on the screen.
    await press(placed('v'), 350, 100);
    expect(interaction.group.size).toBe(0);

    await moveTo(360, 150);
    expect(ghosts().map(([id]) => id)).toEqual(['v']);
    expect(placed('mine').classList).not.toContain('lifted');
  });

  it('drags a single stack alone when the selection holds only it', async () => {
    const cards = [...CARDS, card('a1', { x: 40, y: 380, z: 0, parent: 'mine' })];
    const { session } = await renderTable(makeView(cards), ['mine', 'a1']);
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'mine', x: 200, y: 350 },
      0,
    );
  });
});
