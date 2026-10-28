import { fireEvent, render } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards } from '../lib/catalog';
import { GameSession } from '../lib/session.svelte';
import type { Arrow, CardView as TableCard, PackFace, PileView, View } from '../lib/types';
import { card, infoFrom, placed, domRect, tallTable } from './fixtures.testing';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
};

const infoOf = infoFrom(FACES);

// The villain's row at the top, then Alex's, then Sam's, 300 apart.
const CARDS = [
  card('mine', { y: 300 }),
  card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
  card('sam', { owner: 1, x: 200, y: 600 }),
  card('h', { zone: 'hand' }),
];

/**
 * Alex (colour 0, seat p0) and Sam (colour 1, seat p1) against Rhino. The
 * viewer is Alex, or a spectator.
 */
function makeView(extra: { spectator?: boolean; arrows?: Arrow[] } = {}): View {
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
        decks: [{ area: 'p0', ready: true, handCount: 1 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p1', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: CARDS,
      piles: [],
      hands: extra.spectator ? undefined : { p0: ['h'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: 40 },
      arrows: extra.arrows,
    },
    log: [],
  };
}

/** The network under a real session: what it sends, and a way to answer. */
class FakeWebSocket {
  static last: FakeWebSocket | null = null;

  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

// The screen: the table starts 40 px below the top of the window, under the top
// bar, and the presence layer covers it exactly. The surface lies 20 px in and
// 40 px down from the table's top until it is scrolled. Positions inside it are
// table units times the zoom.
const TABLE_TOP = 40;
const SURFACE = { left: 20, top: TABLE_TOP + 40 };

/** How far the table is scrolled, in screen pixels. */
let scrolled = { x: 0, y: 0 };
let zoom = 1;

function layOut(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap') || this.classList.contains('presence')) {
      return domRect(0, TABLE_TOP, 1000, 860);
    }
    const surfaceLeft = SURFACE.left - scrolled.x;
    const surfaceTop = SURFACE.top - scrolled.y;
    if (this.classList.contains('surface')) {
      return domRect(surfaceLeft, surfaceTop, 1200 * zoom, 1200 * zoom);
    }
    const id = (this as HTMLElement).dataset.id;
    const placed = CARDS.find((c) => c.id === id && c.zone === 'table');
    if (this.closest('.surface') && placed) {
      return domRect(
        surfaceLeft + placed.x * zoom,
        surfaceTop + placed.y * zoom,
        100 * zoom,
        140 * zoom,
      );
    }
    return domRect(0, 0, 0, 0);
  });
}

/** Draws the table for a real session, connected to a fake server. */
async function renderTable(view: View = makeView()) {
  localStorage.setItem('itf-zoom', String(zoom));
  layOut();
  const session = new GameSession('g1', view.you.name ?? 'Watcher', {
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
  });
  session.connect();
  const socket = FakeWebSocket.last!;
  socket.open();
  // The session sends presence only once a view tells it someone else watches.
  let version = 1;
  socket.receive({ type: 'view', version, view });
  const result = render(Table, { session, view });
  // The catalog loads.
  await Promise.resolve();
  return {
    socket,
    /** A new view, as the server would send it. */
    async show(next: View): Promise<void> {
      version += 1;
      socket.receive({ type: 'view', version, view: next });
      await result.rerender({ session, view: next });
    },
    /** The presence messages sent so far, without their type. */
    sent(): Record<string, unknown>[] {
      return socket.sent
        .filter((message) => message.type === 'presence')
        .map(({ type: _type, ...fields }) => fields);
    },
    /** Another viewer's presence, relayed by the server. */
    receive(fields: object): void {
      socket.receive({ type: 'presence', ...fields });
    },
  };
}

/** Lets the next animation frame draw. */
async function nextFrame(): Promise<void> {
  await vi.advanceTimersByTimeAsync(16);
}

function surface(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.tablewrap .surface');
  if (!element) {
    throw new Error('no surface');
  }
  return element;
}

function cursors(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.presence .rcursor')];
}

function pings(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.presence .ping')];
}

/** The rings of the cards other players preview, each drawn inside its card. */
function rings(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.rring')];
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  scrolled = { x: 0, y: 0 };
  zoom = 1;
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  tallTable();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  interaction.reset();
});

describe("the viewer's own presence", () => {
  it('cursor sent as table coordinates, throttled', async () => {
    zoom = 2;
    const { sent } = await renderTable();

    // The surface starts at (20, 80) on the screen, at zoom 2.
    await fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    await fireEvent.pointerMove(window, { clientX: 223, clientY: 481 });
    await fireEvent.pointerMove(window, { clientX: 225, clientY: 482 });
    expect(sent()).toEqual([{ cursor: { x: 100, y: 200 } }]);

    // The latest position follows at the end of the 150 ms window, in whole units.
    await vi.advanceTimersByTimeAsync(149);
    expect(sent()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent()).toEqual([{ cursor: { x: 100, y: 200 } }, { cursor: { x: 103, y: 201 } }]);
  });

  it('counts the scroll of the table', async () => {
    const { sent } = await renderTable();
    scrolled = { x: 100, y: 300 };

    await fireEvent.pointerMove(window, { clientX: 120, clientY: 330 });

    expect(sent()).toEqual([{ cursor: { x: 200, y: 550 } }]);
  });

  it('sends nothing outside the table', async () => {
    const { sent } = await renderTable();

    // The top bar, then the side column.
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 20 });
    await fireEvent.pointerMove(window, { clientX: 1100, clientY: 400 });

    expect(sent()).toEqual([]);
  });

  it('sends the cursor during the move itself, before any microtask', async () => {
    const { sent } = await renderTable();

    // A browser runs microtasks between the listeners of a move it dispatches: a cursor sent from
    // one would go out before the hand had decided whether the move raises it.
    const moved = fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    expect(sent()).toEqual([{ cursor: { x: 200, y: 400 } }]);
    await moved;
  });

  it('hides the cursor while the hand is raised, never telling where the pointer goes in it', async () => {
    const { sent } = await renderTable();
    await fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    await vi.advanceTimersByTimeAsync(50);
    expect(sent()).toEqual([{ cursor: { x: 200, y: 400 } }]);

    // Over the hand's band (its cards are measured at the window's corner here): it rises.
    await fireEvent.pointerMove(window, { clientX: 3, clientY: 500 });
    expect(document.querySelector('.hand')?.classList).toContain('open');
    await fireEvent.pointerMove(window, { clientX: 5, clientY: 600 });
    await vi.advanceTimersByTimeAsync(100);
    expect(sent()).toEqual([{ cursor: { x: 200, y: 400 } }, { cursor: null }]);

    // Back on the table, the hand lowers and the cursor shows again.
    await fireEvent.pointerMove(window, { clientX: 320, clientY: 480 });
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('.hand')?.classList).not.toContain('open');
    expect(sent().at(-1)).toEqual({ cursor: { x: 300, y: 400 } });
  });

  it('hides the cursor while a dialog is open', async () => {
    const { sent } = await renderTable();
    await fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    await vi.advanceTimersByTimeAsync(50);

    // The shortcuts sheet opens from the keyboard, the pointer still on the table.
    await fireEvent.keyDown(window, { key: '?' });
    expect(document.querySelector('[aria-modal="true"]')).not.toBeNull();
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 300 });
    await vi.advanceTimersByTimeAsync(100);
    expect(sent()).toEqual([{ cursor: { x: 200, y: 400 } }, { cursor: null }]);

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    await fireEvent.pointerMove(window, { clientX: 320, clientY: 480 });
    await vi.advanceTimersByTimeAsync(50);
    expect(sent().at(-1)).toEqual({ cursor: { x: 300, y: 400 } });
  });

  it('spectator sends no hidden cursor', async () => {
    const { sent } = await renderTable(makeView({ spectator: true }));

    await fireEvent.keyDown(window, { key: '?' });
    await vi.advanceTimersByTimeAsync(100);

    expect(sent()).toEqual([]);
  });

  it('sends the card previewed, and an empty preview once it is cleared', async () => {
    const { sent } = await renderTable();

    await fireEvent.pointerEnter(placed('mine', '.card'), { clientX: 30, clientY: 400 });
    expect(sent()).toEqual([{ preview: 'mine' }]);

    await fireEvent.pointerLeave(placed('mine', '.card'));
    await vi.advanceTimersByTimeAsync(300);
    expect(sent()).toEqual([{ preview: 'mine' }, { preview: '' }]);
  });

  it('alt-click sends ping', async () => {
    // Without Alt, a press on an empty spot would clear Alex's arrow.
    const { sent, socket } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );

    await fireEvent.pointerDown(surface(), {
      clientX: 220,
      clientY: 480,
      altKey: true,
      button: 0,
    });

    expect(sent()).toEqual([{ ping: { x: 200, y: 400 } }]);
    // Nothing else: the press neither selects nor clears the viewer's arrows.
    expect(socket.sent.filter((message) => message.type === 'action')).toEqual([]);

    // The viewer sees their own ping too, in their colour, at the spot.
    await nextFrame();
    expect(pings().length).toBeGreaterThan(0);
    expect(pings()[0]!.style.getPropertyValue('--c')).toBe('var(--p1)');
    expect(pings()[0]!.style.left).toBe('220px');
    expect(pings()[0]!.style.top).toBe('440px');

    // The ring expands for 1.2 s, then goes at the next frame.
    await vi.advanceTimersByTimeAsync(1100);
    expect(pings().length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(pings()).toEqual([]);
  });

  it('spectator sends no ping', async () => {
    const { sent } = await renderTable(makeView({ spectator: true }));

    await fireEvent.pointerDown(surface(), {
      clientX: 220,
      clientY: 480,
      altKey: true,
      button: 0,
    });
    await fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    await vi.advanceTimersByTimeAsync(100);

    // No player draws a spectator's presence: a spectator sends none.
    expect(sent()).toEqual([]);
    expect(pings()).toEqual([]);
  });

  it('sends a drag while it moves, and its end', async () => {
    const { sent } = await renderTable();

    await fireEvent.pointerDown(placed('mine', '.card'), { clientX: 30, clientY: 400, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 530, clientY: 400, buttons: 1 });
    await vi.advanceTimersByTimeAsync(50);
    // The card's corner, grabbed 10 px in and 20 px down.
    expect(sent()).toContainEqual(
      expect.objectContaining({ drag: { cards: ['mine'], x: 500, y: 300 } }),
    );

    await fireEvent.pointerUp(window, { clientX: 530, clientY: 400 });
    await vi.advanceTimersByTimeAsync(50);
    expect(sent().at(-1)).toMatchObject({ drag: null });
  });
});

describe("other players' presence", () => {
  it('remote cursor drawn with name and colour', async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 } });
    await nextFrame();

    const [cursor] = cursors();
    expect(cursor).toBeDefined();
    expect(cursor!.textContent).toBe('Sam');
    expect(cursor!.querySelector('path')!.style.fill).toBe('var(--p2)');
    expect(cursor!.querySelector('span')!.style.background).toBe('var(--p2)');
    // The surface starts at (20, 80) on the screen, the layer 40 px down.
    expect(cursor!.style.transform).toBe('translate(120px, 690px)');
  });

  it('follows the table scrolled under the cursor, held at its edge when out of view', async () => {
    const { receive } = await renderTable();
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 } });
    await nextFrame();

    scrolled = { x: 50, y: 100 };
    await fireEvent.scroll(document.querySelector('.tablewrap')!);
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(70px, 590px)');

    // Scrolled past it: the cursor waits at the left edge, its label pointing that way.
    scrolled = { x: 200, y: 0 };
    await fireEvent.scroll(document.querySelector('.tablewrap')!);
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(4px, 690px)');
    expect(cursors()[0]!.textContent).toBe('Sam ←');
    expect(cursors()[0]!.classList.contains('off')).toBe(true);
  });

  it('glides to the spots of a message, but moves with the table at once', async () => {
    const { receive } = await renderTable();
    const glide = () =>
      document.querySelector<HTMLElement>('.presence')!.style.getPropertyValue('--glide');
    // The table laid out as it showed.
    await nextFrame();

    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 } });
    await nextFrame();
    expect(glide()).toBe('150ms');

    // Scrolled, or resized: the cursors and the ghosts must not trail behind the table.
    scrolled = { x: 50, y: 100 };
    await fireEvent.scroll(document.querySelector('.tablewrap')!);
    await nextFrame();
    expect(glide()).toBe('0ms');
    receive({ color: 1, name: 'Sam', cursor: { x: 110, y: 650 } });
    await nextFrame();
    expect(glide()).toBe('150ms');
    await fireEvent(window, new Event('resize'));
    await nextFrame();
    expect(glide()).toBe('0ms');
  });

  it('holds a cursor scrolled out of view at the top or bottom edge, its label pointing there', async () => {
    const { receive } = await renderTable();
    // Far below what shows: the table spans 40 to 900 on the screen, the layer starting at 40.
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 5000 } });
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(120px, 816px)');
    expect(cursors()[0]!.textContent).toBe('Sam ↓');
    expect(cursors()[0]!.classList.contains('off')).toBe(true);

    // Scrolled past it, above the top edge and to the left.
    scrolled = { x: 300, y: 500 };
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 50 } });
    await fireEvent.scroll(document.querySelector('.tablewrap')!);
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(4px, 4px)');
    expect(cursors()[0]!.textContent).toBe('Sam ↑ ←');
  });

  it('hides a cursor its player hid, held at an edge or not, until their next move', async () => {
    const { receive } = await renderTable();
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 }, preview: 'sam' });
    await nextFrame();
    expect(cursors()).toHaveLength(1);

    // Sam raises their hand or opens a dialog: the cursor goes, the preview stays.
    receive({ color: 1, name: 'Sam', cursor: null });
    await nextFrame();
    expect(cursors()).toEqual([]);
    expect(rings()).toHaveLength(1);

    // Held at the bottom edge, scrolled out of view: its arrow goes too.
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 5000 } });
    await nextFrame();
    expect(cursors()[0]!.textContent).toBe('Sam ↓');
    receive({ color: 1, name: 'Sam', cursor: null });
    await nextFrame();
    expect(cursors()).toEqual([]);

    receive({ color: 1, name: 'Sam', cursor: { x: 110, y: 650 } });
    await nextFrame();
    expect(cursors()).toHaveLength(1);
  });

  it('stale cursor hidden after 10 s', async () => {
    const { receive } = await renderTable();
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 } });
    await nextFrame();
    expect(cursors()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9_000);
    expect(cursors()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(cursors()).toEqual([]);

    // It comes back with the next move.
    receive({ color: 1, name: 'Sam', cursor: { x: 110, y: 650 } });
    await nextFrame();
    expect(cursors()).toHaveLength(1);
  });

  it('draws a flood of messages once per frame, at the latest position', async () => {
    const { receive } = await renderTable();
    await nextFrame();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    for (let x = 0; x < 200; x++) {
      receive({ color: 1, name: 'Sam', cursor: { x, y: 650 } });
      await Promise.resolve();
    }

    expect(frames).toHaveLength(1);
    frames[0]!(performance.now());
    await Promise.resolve();
    expect(cursors()).toHaveLength(1);
    expect(cursors()[0]!.style.transform).toBe('translate(219px, 690px)');
  });

  it('rings the card another player previews in their colour', async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', preview: 'v' });
    await nextFrame();
    const [ring] = rings();
    expect(ring).toBeDefined();
    expect(ring!.style.getPropertyValue('--c')).toBe('var(--p2)');
    // Drawn by Rhino itself, never measured over it.
    expect(ring!.parentElement).toBe(placed('v', '.card'));
    expect(document.querySelector('.presence .rring')).toBeNull();

    receive({ color: 1, name: 'Sam', preview: '' });
    await nextFrame();
    expect(rings()).toEqual([]);
  });

  it('keeps the ring on the card a view moves, with no frame nor message to measure it again', async () => {
    const { receive, show } = await renderTable(makeView({ spectator: true }));
    receive({ color: 1, name: 'Sam', preview: 'sam' });
    await nextFrame();
    expect(rings().map((ring) => ring.parentElement)).toEqual([placed('sam', '.card')]);

    // Sam moved the card: the ring is still drawn by it, wherever it flies, turns or tilts.
    const view = makeView({ spectator: true });
    const moved = view.table!.cards.map((card) =>
      card.id === 'sam' ? { ...card, x: card.x + 500, exhausted: true } : card,
    );
    await show({ ...view, table: { ...view.table!, cards: moved } });
    expect(placed('sam', '.card').style.left).toBe('700px');
    expect(rings().map((ring) => ring.parentElement)).toEqual([placed('sam', '.card')]);
  });

  it('draws one ring on a card several players preview, and none on the ghost of a drag', async () => {
    const { receive } = await renderTable(makeView({ spectator: true }));

    receive({ color: 0, name: 'Alex', preview: 'sam' });
    receive({ color: 1, name: 'Sam', preview: 'sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    expect(rings()).toHaveLength(1);
    expect(rings()[0]!.parentElement).toBe(placed('sam', '.card'));
  });

  it('shows the ping of another player for 1.2 s', async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', ping: { x: 100, y: 50 } });
    await nextFrame();
    expect(pings().length).toBeGreaterThan(0);
    expect(pings()[0]!.style.getPropertyValue('--c')).toBe('var(--p2)');
    expect([pings()[0]!.style.left, pings()[0]!.style.top]).toEqual(['120px', '90px']);

    // A later message without a ping does not ping again.
    receive({ color: 1, name: 'Sam', cursor: { x: 100, y: 650 } });
    await vi.advanceTimersByTimeAsync(1100);
    expect(pings().length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(pings()).toEqual([]);
  });

  it("draws another player's drag where it is, until it ends", async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    const ghost = document.querySelector<HTMLElement>('.presence .card[data-id="sam"]');
    expect(ghost).not.toBeNull();
    // In table units of the layer: the surface lies at (20, 40) in it.
    expect([ghost!.style.left, ghost!.style.top]).toEqual(['520px', '360px']);

    // Let go: it stays where it was until a view shows where it went, 2 s at most.
    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    expect(document.querySelector('.presence .card[data-id="sam"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('ignores a dragged marker it does not know, instead of drawing the first player token', async () => {
    const { receive } = await renderTable();

    receive({
      color: 1,
      name: 'Sam',
      drag: { cards: [], token: 'bogus' as never, x: 500, y: 320 },
    });
    await nextFrame();
    expect(document.querySelector('.presence .marker')).toBeNull();

    receive({ color: 1, name: 'Sam', drag: { cards: [], token: 'active', x: 500, y: 320 } });
    await nextFrame();
    expect(document.querySelector('.presence .marker')).not.toBeNull();
  });

  it('draws a new ghost for a new drag of the same card, not the landing one gliding over', async () => {
    const { receive } = await renderTable();
    const ghost = () => document.querySelector<HTMLElement>('.presence .card[data-id="sam"]');

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    const landing = ghost();
    expect(landing).not.toBeNull();

    // Picked up again before the landing ended: the ghost shows at once where it starts.
    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 100, y: 120 } });
    await nextFrame();
    expect(ghost()).not.toBe(landing);
    expect([ghost()!.style.left, ghost()!.style.top]).toEqual(['120px', '160px']);
    expect(document.querySelectorAll('.presence .card')).toHaveLength(1);
  });

  it('draws the own back of a side deck whose unknown top card another player drags', async () => {
    const view = makeView();
    const labor: PileView = {
      id: 'side:p1:0',
      kind: 'sideDeck',
      owner: 1,
      x: 360,
      y: 600,
      count: 3,
      label: 'Labor',
      back: 'player',
    };
    view.table!.piles = [...view.table!.piles, labor];
    const { receive } = await renderTable(view);

    // The deck's top card is not known: the drag carries the deck.
    receive({ color: 1, name: 'Sam', drag: { cards: ['side:p1:0'], x: 500, y: 320 } });
    await nextFrame();
    const ghost = document.querySelector<HTMLElement>('.presence .card[data-id="side:p1:0"]');
    const back = ghost?.querySelector('[aria-label="Labor card back"]');
    expect(back?.querySelector('.caption')?.textContent).toBe('LABOR');
  });

  it('keeps the preview ring and the drag ghost after the cursor goes, for 60 s at most', async () => {
    const { receive } = await renderTable();
    receive({
      color: 1,
      name: 'Sam',
      cursor: { x: 100, y: 650 },
      preview: 'v',
      drag: { cards: ['sam'], x: 500, y: 320 },
    });
    await nextFrame();

    // Only the cursor goes after 10 s: the ring and the ghost stay until Sam clears them.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(cursors()).toEqual([]);
    expect(rings()).toHaveLength(1);
    expect(document.querySelector('.presence .card[data-id="sam"]')).not.toBeNull();

    // A lost connection clears nothing: they go after 60 s without a message.
    await vi.advanceTimersByTimeAsync(44_000);
    expect(rings()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(rings()).toEqual([]);
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('hides the cards another player drags in their places, the whole stack, until it lands', async () => {
    const { receive, show } = await renderTable();
    const hidden = () =>
      ['mine', 'v', 'sam'].filter((id) => placed(id, '.card').classList.contains('lifted'));

    // Sam drags a stack of two table cards, and a card of their hand.
    receive({ color: 1, name: 'Sam', drag: { cards: ['sam', 'mine', 'secret'], x: 500, y: 320 } });
    await nextFrame();
    expect(hidden()).toEqual(['mine', 'sam']);
    // Each shows once: as a ghost under Sam's pointer.
    const ghosts = [...document.querySelectorAll<HTMLElement>('.presence .card')];
    expect(ghosts.map((ghost) => ghost.dataset.id)).toEqual(['sam', 'mine', 'secret']);
    expect(ghosts.every((ghost) => !ghost.classList.contains('lifted'))).toBe(true);

    // Let go: they stay hidden, their ghosts where they were dropped, until the view moves them.
    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    expect(hidden()).toEqual(['mine', 'sam']);
    expect(document.querySelectorAll('.presence .card')).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(hidden()).toEqual(['mine', 'sam']);

    // The view moves them: they show at once where they went, never in their old places.
    const view = makeView();
    const moved = view.table!.cards.map((card) =>
      card.id === 'sam' || card.id === 'mine' ? { ...card, x: card.x + 500 } : card,
    );
    await show({ ...view, table: { ...view.table!, cards: moved } });
    expect(hidden()).toEqual([]);
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('shows them in their places again when no view moves them within 2 s', async () => {
    const { receive, show } = await renderTable();

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    // A view that does not move it (someone else acted) does not end the landing.
    await show(makeView());
    await vi.advanceTimersByTimeAsync(1_900);
    expect(placed('sam', '.card').classList).toContain('lifted');
    await vi.advanceTimersByTimeAsync(200);
    expect(placed('sam', '.card').classList).not.toContain('lifted');
  });

  it('shows them where they went when the view came before the drag ended', async () => {
    const { receive, show } = await renderTable();

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    const view = makeView();
    const moved = view.table!.cards.map((card) =>
      card.id === 'sam' ? { ...card, x: 500, y: 320 } : card,
    );
    await show({ ...view, table: { ...view.table!, cards: moved } });
    // Still dragged as far as the others know: hidden where it went, its ghost there.
    expect(placed('sam', '.card').classList).toContain('lifted');

    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    expect(placed('sam', '.card').classList).not.toContain('lifted');
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  describe('a card taken from a pile, which the view did not know before the drop', () => {
    // Sam's deck, and their discard pile, whose cards everybody sees.
    const DECK: PileView = { id: 'deck1', kind: 'deck', owner: 1, x: 0, y: 600, count: 30 };
    const DISCARD: PileView = {
      id: 'discard1',
      kind: 'discard',
      owner: 1,
      x: 100,
      y: 600,
      count: 1,
      cards: ['old'],
    };

    function withPiles(view: View, cards: TableCard[] = view.table!.cards): View {
      return { ...view, table: { ...view.table!, cards, piles: [DECK, DISCARD] } };
    }

    async function spectate() {
      const start = withPiles(makeView({ spectator: true }), [
        ...CARDS.filter((c) => c.zone !== 'hand'),
        card('old', { owner: 1, zone: 'pile' }),
      ]);
      return { start, ...(await renderTable(start)) };
    }

    it('shows the top card of a deck on the next view, with no wait', async () => {
      const { start, receive, show } = await spectate();

      // The deck's top card is not known: the drag carries the deck.
      receive({ color: 1, name: 'Sam', drag: { cards: ['deck1'], x: 500, y: 320 } });
      await nextFrame();
      receive({ color: 1, name: 'Sam', drag: null });
      await nextFrame();
      expect(document.querySelector('.presence .card[data-id="deck1"]')).not.toBeNull();

      // The view lays a card the spectator never saw where it was dropped.
      const drawn = card('drawn', { owner: 1, x: 500, y: 320 });
      await show(withPiles(start, [...start.table!.cards, drawn]));
      expect(document.querySelector('.presence .card')).toBeNull();
      expect(placed('drawn', '.card').classList).not.toContain('lifted');
    });

    it('shows a card of a discard pile on the next view, with no wait', async () => {
      const { start, receive, show } = await spectate();

      receive({ color: 1, name: 'Sam', drag: { cards: ['old'], x: 500, y: 320 } });
      await nextFrame();
      receive({ color: 1, name: 'Sam', drag: null });
      await nextFrame();
      expect(document.querySelector('.presence .card[data-id="old"]')).not.toBeNull();

      const cards = start.table!.cards.map((c) =>
        c.id === 'old' ? { ...c, zone: 'table' as const, x: 500, y: 320 } : c,
      );
      await show(withPiles(start, cards));
      expect(document.querySelector('.presence .card')).toBeNull();
      expect(placed('old', '.card').classList).not.toContain('lifted');
    });

    it('lets go of the ghost when the view came before the drag ended', async () => {
      const { start, receive, show } = await spectate();

      receive({ color: 1, name: 'Sam', drag: { cards: ['deck1'], x: 500, y: 320 } });
      await nextFrame();
      const drawn = card('drawn', { owner: 1, x: 500, y: 320 });
      await show(withPiles(start, [...start.table!.cards, drawn]));

      receive({ color: 1, name: 'Sam', drag: null });
      await nextFrame();
      expect(document.querySelector('.presence .card')).toBeNull();
    });
  });

  it('hides them from a spectator too', async () => {
    const { receive } = await renderTable(makeView({ spectator: true }));

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    expect(placed('sam', '.card').classList).toContain('lifted');
  });

  it('shows them again when the drag is lost: no message for 60 s, or a reconnection', async () => {
    const { receive, socket } = await renderTable();

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(placed('sam', '.card').classList).toContain('lifted');
    await vi.advanceTimersByTimeAsync(1_100);
    expect(placed('sam', '.card').classList).not.toContain('lifted');

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], x: 500, y: 320 } });
    await nextFrame();
    expect(placed('sam', '.card').classList).toContain('lifted');
    // The connection drops: what was known of the others goes with it.
    socket.onclose?.({ code: 1006 });
    await nextFrame();
    expect(placed('sam', '.card').classList).not.toContain('lifted');
  });

  it('draws a hostile message without throwing, skipping what the view does not know', async () => {
    const { receive } = await renderTable();

    receive({
      color: 1,
      name: 'Sam',
      cursor: { x: '10"] .x', y: 10 },
      preview: 'v"], .card[data-id="',
      ping: { x: 1, y: null },
      drag: { cards: ['a"]', 'a"]', 'v'], x: 0, y: 0 },
    });
    await nextFrame();

    expect(cursors()).toEqual([]);
    expect(rings()).toEqual([]);
    expect(pings()).toEqual([]);
    // Each card once, the unknown one face down.
    const ids = [...document.querySelectorAll<HTMLElement>('.presence .card')].map(
      (c) => c.dataset.id,
    );
    expect(ids).toEqual(['a"]', 'v']);

    // A drag at a spot given in no numbers is not drawn.
    receive({ color: 1, name: 'Sam', drag: { cards: ['v'], x: 'far', y: 0 } });
    await nextFrame();
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('draws a card it cannot see face down', async () => {
    const { receive } = await renderTable();

    // A card from Sam's hand, which Alex does not know.
    receive({ color: 1, name: 'Sam', drag: { cards: ['secret'], x: 0, y: 600 } });
    await nextFrame();

    const ghost = document.querySelector<HTMLElement>('.presence .card[data-id="secret"]');
    expect(ghost).not.toBeNull();
    expect(
      ghost!.querySelector('[alt="Player card back"], [aria-label="Player card back"]'),
    ).not.toBeNull();
  });
});
