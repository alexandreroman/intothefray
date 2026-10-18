import { fireEvent, render } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import { GameSession } from '../lib/session.svelte';
import type { Area, Arrow, CardView as TableCard, PackFace, View } from '../lib/types';

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

const CARDS = [
  card('mine'),
  card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain', x: 300 }),
  card('sam', { owner: 1, area: 'p1', x: 200 }),
  card('h', { zone: 'hand', area: undefined }),
];

/**
 * Alex (colour 0, area p0) and Sam (colour 1, area p1) against Rhino. The
 * viewer is Alex, or a spectator.
 */
function makeView(extra: { spectator?: boolean; arrows?: Arrow[] } = {}): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [
      { name: 'Alex', color: 0, host: true, area: 'p0', ready: true, handCount: 1 },
      { name: 'Sam', color: 1, host: false, area: 'p1', ready: true, handCount: 0 },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: CARDS,
      piles: [],
      hand: extra.spectator ? undefined : ['h'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
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

// The screen: the table starts 40 px below the top of the window, under the top
// bar, and the presence layer covers it exactly. The zones lie one under the
// other, 300 px tall; each scroller is as wide as the table, its surface 20 px
// in and 40 px down from the top of the zone. Positions inside a surface are
// table units times the zoom.
const TABLE_TOP = 40;
const ZONE_TOP: Record<string, number> = { villain: 40, p0: 340, p1: 640 };
const SURFACE = { left: 20, top: 40 };

/** How far each zone is scrolled to the left, in screen pixels. */
let scrolled: Record<string, number> = {};
let zoom = 1;

function zoneOf(element: Element): Area | undefined {
  return element.closest<HTMLElement>('.zsec')?.dataset.area as Area | undefined;
}

function layOut(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap') || this.classList.contains('presence')) {
      return domRect(0, TABLE_TOP, 1000, 860);
    }
    const area = zoneOf(this);
    const zoneTop = area ? ZONE_TOP[area] : undefined;
    if (area === undefined || zoneTop === undefined) {
      return domRect(0, 0, 0, 0);
    }
    const surfaceLeft = SURFACE.left - (scrolled[area] ?? 0);
    const surfaceTop = zoneTop + SURFACE.top;
    if (this.classList.contains('zsec')) {
      return domRect(0, zoneTop, 1000, 300);
    }
    if (this.classList.contains('zscroll')) {
      return domRect(0, zoneTop + 30, 1000, 270);
    }
    if (this.classList.contains('surface')) {
      return domRect(surfaceLeft, surfaceTop, 1200 * zoom, 240 * zoom);
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
  render(Table, { session, view });
  // The catalog loads.
  await Promise.resolve();
  return {
    socket,
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

function surfaceOf(area: Area): HTMLElement {
  const surface = document.querySelector<HTMLElement>(`.zsec[data-area="${area}"] .surface`);
  if (!surface) {
    throw new Error(`no surface for ${area}`);
  }
  return surface;
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface .card[data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function cursors(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.presence .rcursor')];
}

function pings(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.presence .ping')];
}

function rings(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.presence .rring')];
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  scrolled = {};
  zoom = 1;
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
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

    // Alex's zone: its surface starts at (20, 380) on the screen, at zoom 2.
    await fireEvent.pointerMove(window, { clientX: 220, clientY: 480 });
    await fireEvent.pointerMove(window, { clientX: 223, clientY: 481 });
    await fireEvent.pointerMove(window, { clientX: 225, clientY: 482 });
    expect(sent()).toEqual([{ cursor: { area: 'p0', x: 100, y: 50 } }]);

    // The latest position follows at the end of the 50 ms window, in whole units.
    await vi.advanceTimersByTimeAsync(50);
    expect(sent()).toEqual([
      { cursor: { area: 'p0', x: 100, y: 50 } },
      { cursor: { area: 'p0', x: 103, y: 51 } },
    ]);
  });

  it('counts a spot between two zones in the zone above', async () => {
    const { sent } = await renderTable();

    // Below the villain's zone (40 to 340), above Alex's header.
    await fireEvent.pointerMove(window, { clientX: 120, clientY: 330 });

    expect(sent()).toEqual([{ cursor: { area: 'villain', x: 100, y: 250 } }]);
  });

  it('sends nothing outside the table', async () => {
    const { sent } = await renderTable();

    // The top bar, then the side column.
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 20 });
    await fireEvent.pointerMove(window, { clientX: 1100, clientY: 400 });

    expect(sent()).toEqual([]);
  });

  it('sends the card previewed, and an empty preview once it is cleared', async () => {
    const { sent } = await renderTable();

    await fireEvent.pointerEnter(placed('mine'), { clientX: 30, clientY: 400 });
    expect(sent()).toEqual([{ preview: 'mine' }]);

    await fireEvent.pointerLeave(placed('mine'));
    await vi.advanceTimersByTimeAsync(300);
    expect(sent()).toEqual([{ preview: 'mine' }, { preview: '' }]);
  });

  it('alt-click sends ping', async () => {
    // Without Alt, a press on an empty spot would clear Alex's arrow.
    const { sent, socket } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );

    await fireEvent.pointerDown(surfaceOf('p0'), {
      clientX: 220,
      clientY: 480,
      altKey: true,
      button: 0,
    });

    expect(sent()).toEqual([{ ping: { area: 'p0', x: 200, y: 100 } }]);
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

    await fireEvent.pointerDown(surfaceOf('p0'), {
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

    await fireEvent.pointerDown(placed('mine'), { clientX: 30, clientY: 400, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 530, clientY: 400, buttons: 1 });
    await vi.advanceTimersByTimeAsync(50);
    // The card's corner, grabbed 10 px in and 20 px down, in Alex's zone.
    expect(sent()).toContainEqual(
      expect.objectContaining({ drag: { cards: ['mine'], area: 'p0', x: 500, y: 0 } }),
    );

    await fireEvent.pointerUp(window, { clientX: 530, clientY: 400 });
    await vi.advanceTimersByTimeAsync(50);
    expect(sent().at(-1)).toMatchObject({ drag: null });
  });
});

describe("other players' presence", () => {
  it('remote cursor drawn with name and colour', async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x: 100, y: 50 } });
    await nextFrame();

    const [cursor] = cursors();
    expect(cursor).toBeDefined();
    expect(cursor!.textContent).toBe('Sam');
    expect(cursor!.querySelector('path')!.style.fill).toBe('var(--p2)');
    expect(cursor!.querySelector('span')!.style.background).toBe('var(--p2)');
    // Sam's surface starts at (20, 680) on the screen, the layer 40 px down.
    expect(cursor!.style.transform).toBe('translate(120px, 690px)');
  });

  it('follows a zone scrolled under the cursor, held at its edge when out of view', async () => {
    const { receive } = await renderTable();
    receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x: 100, y: 50 } });
    await nextFrame();

    scrolled = { p1: 50 };
    await fireEvent.scroll(document.querySelector('.zsec[data-area="p1"] .zscroll')!);
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(70px, 690px)');

    // Scrolled past it: the cursor waits at the left edge, its label pointing that way.
    scrolled = { p1: 200 };
    await fireEvent.scroll(document.querySelector('.zsec[data-area="p1"] .zscroll')!);
    await nextFrame();
    expect(cursors()[0]!.style.transform).toBe('translate(4px, 690px)');
    expect(cursors()[0]!.textContent).toBe('Sam ←');
    expect(cursors()[0]!.classList.contains('off')).toBe(true);
  });

  it('stale cursor hidden after 10 s', async () => {
    const { receive } = await renderTable();
    receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x: 100, y: 50 } });
    await nextFrame();
    expect(cursors()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9_000);
    expect(cursors()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(cursors()).toEqual([]);

    // It comes back with the next move.
    receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x: 110, y: 50 } });
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
      receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x, y: 50 } });
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
    // Rhino lies at x 300 of the villain's surface: (320, 80) on the screen.
    expect([ring!.style.left, ring!.style.top, ring!.style.width, ring!.style.height]).toEqual([
      '320px',
      '40px',
      '100px',
      '140px',
    ]);

    receive({ color: 1, name: 'Sam', preview: '' });
    await nextFrame();
    expect(rings()).toEqual([]);
  });

  it('shows the ping of another player for 1.2 s', async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', ping: { area: 'villain', x: 100, y: 50 } });
    await nextFrame();
    expect(pings().length).toBeGreaterThan(0);
    expect(pings()[0]!.style.getPropertyValue('--c')).toBe('var(--p2)');
    expect([pings()[0]!.style.left, pings()[0]!.style.top]).toEqual(['120px', '90px']);

    // A later message without a ping does not ping again.
    receive({ color: 1, name: 'Sam', cursor: { area: 'p1', x: 100, y: 50 } });
    await vi.advanceTimersByTimeAsync(1100);
    expect(pings().length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(pings()).toEqual([]);
  });

  it("draws another player's drag where it is, until it ends", async () => {
    const { receive } = await renderTable();

    receive({ color: 1, name: 'Sam', drag: { cards: ['sam'], area: 'p0', x: 500, y: 20 } });
    await nextFrame();
    const ghost = document.querySelector<HTMLElement>('.presence .card[data-id="sam"]');
    expect(ghost).not.toBeNull();
    // In table units of the layer: Alex's surface lies at (20, 340) in it.
    expect([ghost!.style.left, ghost!.style.top]).toEqual(['520px', '360px']);

    receive({ color: 1, name: 'Sam', drag: null });
    await nextFrame();
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('keeps the preview ring and the drag ghost after the cursor goes, for 60 s at most', async () => {
    const { receive } = await renderTable();
    receive({
      color: 1,
      name: 'Sam',
      cursor: { area: 'p1', x: 100, y: 50 },
      preview: 'v',
      drag: { cards: ['sam'], area: 'p0', x: 500, y: 20 },
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

  it('draws a hostile message without throwing, skipping what the view does not know', async () => {
    const { receive } = await renderTable();

    receive({
      color: 1,
      name: 'Sam',
      cursor: { area: 'p9"] .x', x: 10, y: 10 },
      preview: 'v"], .card[data-id="',
      ping: { area: 'nowhere"]', x: 1, y: 1 },
      drag: { cards: ['a"]', 'a"]', 'v'], area: 'p0', x: 0, y: 0 },
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

    // A drag in an area the view does not know is not drawn.
    receive({ color: 1, name: 'Sam', drag: { cards: ['v'], area: 'p7"]', x: 0, y: 0 } });
    await nextFrame();
    expect(document.querySelector('.presence .card')).toBeNull();
  });

  it('draws a card it cannot see face down', async () => {
    const { receive } = await renderTable();

    // A card from Sam's hand, which Alex does not know.
    receive({ color: 1, name: 'Sam', drag: { cards: ['secret'], area: 'p1', x: 0, y: 0 } });
    await nextFrame();

    const ghost = document.querySelector<HTMLElement>('.presence .card[data-id="secret"]');
    expect(ghost).not.toBeNull();
    expect(
      ghost!.querySelector('[alt="Player card back"], [aria-label="Player card back"]'),
    ).not.toBeNull();
  });
});
