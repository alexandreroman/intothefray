import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { Area, CardView as TableCard, PackFace, PileView, View } from '../lib/types';

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

/** Alex (p0) alone with Rhino. */
function makeView(extra: { cards?: TableCard[]; spectator?: boolean } = {}): View {
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
      cards: extra.cards ?? CARDS,
      piles: PILES,
      hand: ['h1', 'h2', 'h3'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
  };
}

function fakeSession() {
  return { act: vi.fn(() => 1), lobby: vi.fn(() => true) };
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
function layOut(view: () => View): void {
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
      return domRect(SURFACE.left, zoneTop + SURFACE.top, 960, 240);
    }
    const id = (this as HTMLElement).dataset.id;
    if (this.closest('.surface') && id && zoneTop !== undefined) {
      const placed = view().table?.cards.find((c) => c.id === id) ?? PILES.find((p) => p.id === id);
      if (placed) {
        return domRect(SURFACE.left + placed.x, zoneTop + SURFACE.top + placed.y, 100, 140);
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

async function renderTable(view: View = makeView()) {
  const session = fakeSession();
  let current = view;
  layOut(() => current);
  const result = render(Table, { session, view });
  // The bar needs the catalog.
  await Promise.resolve();
  return {
    session,
    async rerender(next: View) {
      current = next;
      await result.rerender({ session, view: next });
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
    expect(ghosts()).toEqual([]);
    expect(placed('mine').classList).not.toContain('lifted');
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
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'play', card: 'h2', area: 'p0' }),
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
