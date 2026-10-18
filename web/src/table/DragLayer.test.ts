import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  Area,
  CardView as TableCard,
  PackFace,
  PileView,
  SessionError,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
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
  return { card: { code, faces: [full], back: 'player', quantity: 1 }, face: 0, pack: 'core' };
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

const CARDS = [
  card('mine', { tokens: { dmg: 2 } }),
  card('other', { x: 400 }),
  card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain', x: 300 }),
  card('h1', { zone: 'hand', area: undefined }),
  card('h2', { zone: 'hand', area: undefined }),
  card('h3', { zone: 'hand', area: undefined }),
];

const PILES = [
  pile('enc', { kind: 'encounter', x: 0, count: 20 }),
  pile('deck:p0', { owner: 0, area: 'p0', x: 600 }),
  pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', x: 720, count: 0, cards: [] }),
];

// The cards that can lie in Alex's discard pile: two Spider-Man, then a Rhino.
const DISCARD_CODES: Record<string, string> = { d1: '01001', d2: '01094' };

/** Alex (p0) alone with Rhino; `discarded` lists his discard pile, bottom to top. */
function makeView(
  extra: { cards?: TableCard[]; spectator?: boolean; discarded?: string[] } = {},
): View {
  const discarded = extra.discarded ?? [];
  const piles = PILES.map((p) =>
    p.id === 'disc:p0' ? { ...p, count: discarded.length, cards: discarded } : p,
  );
  const inPile = discarded.map((id) =>
    card(id, { code: DISCARD_CODES[id], zone: 'pile', area: undefined }),
  );
  return {
    id: 'g1',
    phase: 'playing',
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        area: 'p0',
        heroName: 'Spider-Man',
        ready: true,
        handCount: 3,
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [...(extra.cards ?? CARDS), ...inPile],
      piles,
      hand: ['h1', 'h2', 'h3'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
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

// The screen, at zoom 1: the villain's zone on top, Alex's below, each surface
// 20 px in from the left and 40 px below the top of its zone; the hand at the
// bottom, its three cards side by side.
const ZONE_TOP: Record<string, number> = { villain: 0, p0: 300 };
const SURFACE = { left: 20, top: 40 };
const HAND_TOP = 700;

function zoneOf(element: Element): Area | undefined {
  return element.closest<HTMLElement>('.zsec')?.dataset.area as Area | undefined;
}

/** Lays the table out on the screen; `view` gives the table cards and piles their place. */
function layOut(view: () => View, zoom: number): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const area = zoneOf(this);
    const zoneTop = area ? ZONE_TOP[area] : undefined;
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('zsec') && zoneTop !== undefined) {
      return domRect(0, zoneTop, 1000, 300);
    }
    if (this.classList.contains('surface') && zoneTop !== undefined) {
      return domRect(SURFACE.left, zoneTop + SURFACE.top, 960 * zoom, 240 * zoom);
    }
    const id = (this as HTMLElement).dataset.id;
    if (this.closest('.surface') && id && zoneTop !== undefined) {
      const table = view().table;
      const placed =
        table?.cards.find((c) => c.id === id && c.zone === 'table') ??
        table?.piles.find((p) => p.id === id);
      if (placed) {
        return domRect(
          SURFACE.left + placed.x * zoom,
          zoneTop + SURFACE.top + placed.y * zoom,
          100 * zoom,
          140 * zoom,
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
  // The bar needs the catalog.
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
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
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
    // Its corner at 224, 392 on the screen: 204, 52 on Alex's table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'move',
      card: 'mine',
      area: 'p0',
      x: 200,
      y: 50,
    });
  });

  it('counts the move in table units at another zoom', async () => {
    localStorage.setItem('itf-zoom', '2');
    const { session } = await renderTable();
    // "mine" is drawn 200 by 280 at 20, 340: held 60 px in from its left edge, 120 down.
    await press(placed('mine'), 80, 460);
    await moveTo(480, 560);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);

    await release(480, 560);
    // Its corner at 420, 440 on the screen: 400, 100 px into the surface, 200, 50 units.
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'move',
      card: 'mine',
      area: 'p0',
      x: 200,
      y: 50,
    });
  });

  it('measures only the cards and piles of the zone under the pointer', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400);
    const measure = vi.mocked(Element.prototype.getBoundingClientRect);
    measure.mockClear();
    await moveTo(254, 452);

    const measured = measure.mock.contexts as Element[];
    expect(measured).not.toContain(placed('v'));
    expect(measured).not.toContain(placed('enc'));
    expect(measured).toContain(placed('other'));
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'move',
      card: 'mine',
      area: 'p0',
      x: 200,
      y: 50,
    });
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'attach',
      card: 'mine',
      target: 'other',
    });
  });

  it('shows the label of the pile it would go to, and sends that', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    // Next to the discard pile, at 740, 340: within its 20 px margin.
    await moveTo(735, 400);
    expect(placed('disc:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Discard')).toBeTruthy();

    await moveTo(660, 400);
    expect(placed('disc:p0').classList).not.toContain('drop-pile');
    expect(placed('deck:p0').classList).toContain('drop-pile');
    expect(screen.getByText('Top of deck')).toBeTruthy();

    await release(660, 400);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'toDeck',
      card: 'mine',
      where: 'top',
    });
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'toHand', card: 'mine' });
  });

  it("is not taken by the hand when it is another player's card or an encounter card", async () => {
    const theirs = card('theirs', { owner: 1, x: 200 });
    const { session } = await renderTable(makeView({ cards: [...CARDS, theirs] }));
    await press(placed('theirs'), 250, 400);
    await moveTo(450, 740);
    expect(document.querySelector('.hand')?.classList).not.toContain('drop');
    expect(screen.queryByText('Hand')).toBeNull();
    await release(450, 740);

    // The villain's card lies at 320, 40 on the screen.
    await press(placed('v'), 350, 100);
    await moveTo(450, 740);
    expect(screen.queryByText('Hand')).toBeNull();
    await release(450, 740);
    // Dropped outside every zone: nothing moves.
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

  it('hides the action bar and the token pill while dragging', async () => {
    await renderTable();
    await fireEvent.pointerEnter(placed('mine'));
    const token = placed('mine').querySelector<HTMLElement>('[data-counter="token:dmg"]');
    await fireEvent.pointerEnter(token as HTMLElement);
    await waitFor(() => expect(document.querySelector('.actionbar')).not.toBeNull());
    expect(document.querySelector('.tokpill')).not.toBeNull();

    await press(placed('mine'), 50, 400);
    await moveTo(150, 420);
    expect(document.querySelector('.actionbar')).toBeNull();
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

  it('does not select the card with the tap that ends a touch drag', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400, 'touch');
    await moveTo(254, 452);
    await release(254, 452);
    await fireEvent.click(placed('mine'));
    expect(interaction.locked).toBe(false);

    // A plain tap still selects.
    await press(placed('mine'), 50, 400, 'touch');
    await release(50, 400);
    await fireEvent.click(placed('mine'));
    expect(interaction.locked).toBe(true);
  });
});

describe('dragging from a pile', () => {
  it('plays the top card of a discard pile under the card it is dropped on', async () => {
    const { session } = await renderTable(makeView({ discarded: ['d1'] }));
    // The discard pile lies at 740, 340 on the screen.
    await press(placed('disc:p0'), 790, 410);
    await moveTo(470, 420);
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'play',
      card: 'd1',
      target: 'other',
    });
  });

  it('keeps the card it took when another card is put on the pile meanwhile', async () => {
    const { session, rerender } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 790, 410);
    await moveTo(300, 450);

    // Another player discards the Rhino onto it.
    await rerender(makeView({ discarded: ['d1', 'd2'] }));
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['d1']);
    // The pile shows its new top card, without the one being dragged.
    const pileView = placed('disc:p0');
    expect(pileView.querySelector('img')?.getAttribute('alt')).toBe('Rhino');
    expect(pileView.querySelector('.count')?.textContent).toBe('1');

    await release(300, 450);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'play',
      card: 'd1',
      area: 'p0',
      x: 230,
      y: 40,
    });
  });

  it('is cancelled when the card it took leaves the pile meanwhile', async () => {
    const { session, rerender } = await renderTable(makeView({ discarded: ['d1'] }));
    await press(placed('disc:p0'), 790, 410);
    await moveTo(300, 450);

    await rerender(makeView({ discarded: [] }));
    expect(ghosts()).toEqual([]);
    await release(300, 450);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('deals the encounter card where it lands, even over a card', async () => {
    const { session } = await renderTable();
    await press(placed('enc'), 50, 100);
    await moveTo(470, 420);
    // It is not tucked: no outline, no label.
    expect(placed('other').classList).not.toContain('drop-target');
    expect(screen.queryByText(/^Under/)).toBeNull();

    await release(470, 420);
    // Held by its middle: its corner at 420, 350 on the screen, 400, 10 on Alex's table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'deal',
      area: 'p0',
      x: 400,
      y: 10,
    });
  });

  it('deals the top card of the encounter deck face down where it lands', async () => {
    const { session } = await renderTable();
    await press(placed('enc'), 50, 100);
    await moveTo(300, 450);
    // A face-down encounter card, centred on the pointer.
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Encounter card back"]')).not.toBeNull();

    await release(300, 450);
    // Its corner at 250, 380 on the screen: 230, 40 on Alex's table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'deal',
      area: 'p0',
      x: 230,
      y: 40,
    });
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
    // Held 60 px in from its left edge and 80 down, out of 132 by 185: at table size its corner
    // lands at 254.5, 389.5 on the screen, 234.5, 49.5 on Alex's table.
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'play',
      card: 'h2',
      area: 'p0',
      x: 230,
      y: 50,
    });
  });

  it('plays it under the card it is dropped on', async () => {
    const { session } = await renderTable();
    await press(handCard('h2'), 500, 780);
    // Over "other", at 420, 340 on the screen.
    await moveTo(470, 420);
    expect(placed('other').classList).toContain('drop-target');
    expect(screen.getByText('Under Spider-Man')).toBeTruthy();

    await release(470, 420);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'play',
      card: 'h2',
      target: 'other',
    });
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'handOrder',
      area: 'p0',
      cards: ['h2', 'h3', 'h1'],
    });
    expect(document.querySelector('.hand')?.classList).toContain('open');
  });

  it('can be dropped on a pile', async () => {
    const { session } = await renderTable();
    await press(handCard('h3'), 650, 780);
    await moveTo(770, 400);
    expect(screen.getByText('Discard')).toBeTruthy();
    await release(770, 400);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'discard', card: 'h3' });
  });
});

describe('a drop waiting for the server', () => {
  /** Drags "mine" so that its corner lands at 204, 52 on Alex's table, and lets go. */
  async function dropMine() {
    await press(placed('mine'), 50, 400);
    await moveTo(254, 452);
    await release(254, 452);
  }

  /** The table once the server took the move of "mine" to 200, 50. */
  function moved(): View {
    return makeView({
      cards: CARDS.map((c) => (c.id === 'mine' ? { ...c, x: 200, y: 50 } : c)),
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
    // Where the move puts it: 200, 50 on Alex's table, 220, 390 on the screen.
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
    // Played at 230, 50 on Alex's table: 250, 390 on the screen.
    const [ghost] = ghosts();
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['h2']);
    expect(ghost?.style.left).toBe('250px');
    expect(ghost?.style.top).toBe('390px');
    expect(handOrder()).toEqual(['h1', 'h3']);

    const played = makeView({
      cards: CARDS.map((c) =>
        c.id === 'h2' ? { ...c, zone: 'table', area: 'p0', x: 230, y: 50 } : c,
      ),
    });
    played.table!.hand = ['h1', 'h3'];
    await rerender(played);
    expect(ghosts()).toEqual([]);
    expect(placed('h2').style.left).toBe('230px');
  });

  it('keeps the new order of a reordered hand', async () => {
    const { rerender } = await renderTable();
    await press(handCard('h1'), 350, 780);
    await moveTo(700, 760);
    await release(700, 760);
    expect(handOrder()).toEqual(['h2', 'h3', 'h1']);
    expect(ghosts()).toEqual([]);

    const reordered = makeView();
    reordered.table!.hand = ['h2', 'h3', 'h1'];
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
    await press(placed('disc:p0'), 790, 410);
    await moveTo(300, 450);
    await release(300, 450);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['d1']);
    expect(placed('disc:p0').classList).toContain('empty');

    const view = makeView();
    view.table!.cards.push(card('d1', { x: 230, y: 40 }));
    await rerender(view);
    expect(ghosts()).toEqual([]);
    expect(placed('d1').style.left).toBe('230px');
  });

  it('deals the encounter card face down where it lands, the deck one card lower', async () => {
    await renderTable();
    await press(placed('enc'), 50, 100);
    await moveTo(300, 450);
    await release(300, 450);
    // Dealt at 230, 40 on Alex's table: 250, 380 on the screen.
    expect(ghosts()).toHaveLength(1);
    const [ghost] = ghosts();
    expect(ghost?.querySelector('[alt="Encounter card back"]')).not.toBeNull();
    expect(ghost?.style.left).toBe('250px');
    expect(ghost?.style.top).toBe('380px');
    expect(placed('enc').querySelector('.count')?.textContent).toBe('19');
  });
});
