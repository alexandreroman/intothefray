import { fireEvent, render, waitFor } from '@testing-library/svelte';
import Table from './Table.svelte';
import tableSource from './Table.svelte?raw';
import arrowsSource from './Arrows.svelte?raw';
import dragSource from './DragLayer.svelte?raw';
import flightsSource from './Flights.svelte?raw';
import hintSource from './ArrowHint.svelte?raw';
import pillSource from './TokenPill.svelte?raw';
import handSource from './Hand.svelte?raw';
import dialogSource from '../components/Dialog.svelte?raw';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  Arrow,
  CardView as TableCard,
  PackFace,
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

// The villain's row at the top, then Alex's, then Sam's, 300 apart.
const CARDS = [
  card('mine', { y: 300 }),
  card('other', { x: 400, y: 300 }),
  card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
  card('sam', { owner: 1, y: 600 }),
  card('h', { zone: 'hand' }),
];

/**
 * Alex (seat 0, p0) and Sam (seat 1, p1) against Rhino. Their
 * colours are not their seats: Alex is colour 2 (--p3), Sam colour 0 (--p1).
 * The viewer is Alex, or a spectator.
 */
function makeView(
  extra: { cards?: TableCard[]; arrows?: Arrow[]; spectator?: boolean } = {},
): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 2, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 2,
        host: true,
        ready: true,
        online: true,
        decks: [{ area: 'p0', ready: true, handCount: 1 }],
      },
      {
        name: 'Sam',
        color: 0,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p1', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: extra.cards ?? CARDS,
      piles: [],
      hands: extra.spectator ? undefined : { p0: ['h'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 860, y: 40 },
      arrows: extra.arrows,
    },
    log: [],
  };
}

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

// The screen, at zoom 1: the table's scroller fills it, the surface 20 px in and 40 px down
// until it is scrolled. The arrows layer starts 10 px below the top of the screen.
const SURFACE = { left: 20, top: 40 };
const LAYER_TOP = 10;
// Wherever the pointer is, a dragged card's ghost lies there on the screen.
const GHOST = { left: 800, top: 600 };
const GHOST_MIDDLE = [850, 660];

/** How far the table is scrolled, in screen pixels. */
let scrolled = { x: 0, y: 0 };

/** Lays the table out on the screen; `view` gives the table cards their place. */
function layOut(view: () => View): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('arrows')) {
      return domRect(0, LAYER_TOP, 1000, 900);
    }
    if (this.closest('.draglayer') && this.classList.contains('card')) {
      return domRect(GHOST.left, GHOST.top, 100, 140);
    }
    const surfaceLeft = SURFACE.left - scrolled.x;
    const surfaceTop = SURFACE.top - scrolled.y;
    if (this.classList.contains('surface')) {
      return domRect(surfaceLeft, surfaceTop, 1200, 1200);
    }
    const id = (this as HTMLElement).dataset.id;
    const placed = view().table?.cards.find((c) => c.id === id && c.zone === 'table');
    if (this.closest('.surface') && placed) {
      return domRect(surfaceLeft + placed.x, surfaceTop + placed.y, 100, 140);
    }
    return domRect(0, 0, 0, 0);
  });
}

async function renderTable(view: View = makeView()) {
  const session = fakeSession();
  let current = view;
  layOut(() => current);
  const result = render(Table, { session, view });
  // The actions need the catalog.
  await Promise.resolve();
  return {
    session,
    async rerender(next: View) {
      current = next;
      await result.rerender({ session, view: next });
    },
  };
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface .card[data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function surface(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.tablewrap .surface');
  if (!element) {
    throw new Error('no surface');
  }
  return element;
}

function scroller(): HTMLElement {
  return document.querySelector<HTMLElement>('.tablewrap')!;
}

/** The arrows drawn between cards, the rubber band left out. */
function shafts(): SVGPathElement[] {
  return [...document.querySelectorAll<SVGPathElement>('.arrows path.shaft:not(.rubber)')];
}

function rubber(): SVGPathElement | null {
  return document.querySelector<SVGPathElement>('.arrows path.shaft.rubber');
}

/** Where a path starts: "M70,400 Q…" gives [70, 400]. */
function startOf(path: SVGPathElement): number[] {
  const match = /^M(-?[\d.]+),(-?[\d.]+)/.exec(path.getAttribute('d') ?? '');
  return match ? [Number(match[1]), Number(match[2])] : [];
}

/** Where a path ends. */
function endOf(path: SVGPathElement): number[] {
  const numbers = (path.getAttribute('d') ?? '').match(/-?[\d.]+/g) ?? [];
  return numbers.slice(-2).map(Number);
}

/** The card element found under the pointer, for the rubber band and the drop of a Shift + drag. */
function pointAt(id: string | null): void {
  vi.spyOn(document, 'elementFromPoint').mockImplementation(() =>
    id === null ? null : placed(id),
  );
}

beforeEach(() => {
  localStorage.clear();
  scrolled = { x: 0, y: 0 };
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  interaction.reset();
});

describe('arrows', () => {
  it('draws one path per arrow in its seat colour', async () => {
    await renderTable(
      makeView({
        arrows: [
          { from: 'mine', to: 'v', seat: 0 },
          { from: 'sam', to: 'v', seat: 1 },
        ],
      }),
    );

    const drawn = shafts();
    expect(drawn).toHaveLength(2);
    // The seat's player colour, not the seat: Alex has colour 2, Sam colour 0.
    expect(drawn.map((path) => path.style.stroke)).toEqual(['var(--p3)', 'var(--p1)']);
    expect(drawn[0]?.getAttribute('marker-end')).toBe('url(#ah-2)');
    // From the middle of the card, in the layer's own coordinates.
    expect(startOf(drawn[0]!)).toEqual([70, 400]);
    const dots = [...document.querySelectorAll('.arrows circle')];
    expect(dots.map((dot) => [dot.getAttribute('cx'), dot.getAttribute('cy')])).toEqual([
      ['70', '400'],
      ['70', '700'],
    ]);
    // To the edge of the card it points at, not into its middle.
    const [x = 0, y = 0] = endOf(drawn[0]!);
    expect(x).toBeLessThan(370);
    expect(y).toBeGreaterThan(100);
  });

  it("arrow colour of seat 1 is Alex's", async () => {
    // Alex plays two decks, seats 0 and 1; Sam sits at seat 2.
    const view = makeView({ arrows: [{ from: 'sam', to: 'v', seat: 1 }] });
    view.players = [
      {
        ...view.players[0]!,
        decks: [
          { area: 'p0', ready: true, handCount: 1 },
          { area: 'p1', ready: true, handCount: 0 },
        ],
      },
      { ...view.players[1]!, decks: [{ area: 'p2', ready: true, handCount: 0 }] },
    ];
    await renderTable(view);

    expect(shafts().map((path) => path.style.stroke)).toEqual(['var(--p3)']);
  });

  it('skips arrows whose cards are gone', async () => {
    const arrows = [
      { from: 'mine', to: 'gone', seat: 0 },
      { from: 'mine', to: 'h', seat: 0 },
      { from: 'mine', to: 'v', seat: 0 },
    ];
    const { rerender } = await renderTable(makeView({ arrows }));
    expect(shafts()).toHaveLength(1);

    // The villain leaves the table: its arrow goes, and nothing breaks.
    const cards = CARDS.map((c) => (c.id === 'v' ? { ...c, zone: 'pile' as const } : c));
    await rerender(makeView({ cards, arrows }));
    expect(shafts()).toHaveLength(0);
  });

  it('follows the table scrolled under it, both ways', async () => {
    await renderTable(makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }));
    expect(startOf(shafts()[0]!)).toEqual([70, 400]);

    scrolled = { x: 30, y: 100 };
    await fireEvent.scroll(scroller());
    await waitFor(() => expect(startOf(shafts()[0]!)).toEqual([40, 300]));
  });

  it('goes back to its card when a drag of that card ends without a new view', async () => {
    await renderTable(makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }));
    expect(startOf(shafts()[0]!)).toEqual([70, 400]);

    // While dragged, the arrow follows the card's ghost.
    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400 });
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 450, buttons: 1 });
    await fireEvent.pointerMove(window, { clientX: 310, clientY: 460, buttons: 1 });
    await waitFor(() => expect(startOf(shafts()[0]!)).toEqual(GHOST_MIDDLE));

    // Let go outside the table: nothing is sent, no view comes, the card is back in its place.
    await fireEvent.pointerUp(window, { clientX: 500, clientY: 950 });
    await waitFor(() => expect(startOf(shafts()[0]!)).toEqual([70, 400]));
  });

  it('rises over the moving cards while a card is dragged, and goes back under the rest after', async () => {
    await renderTable(makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }));
    const layer = document.querySelector('.arrows')!;
    expect(layer.classList).not.toContain('raised');

    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400 });
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 450, buttons: 1 });
    expect(layer.classList).toContain('raised');

    await fireEvent.pointerUp(window, { clientX: 500, clientY: 950 });
    expect(layer.classList).not.toContain('raised');
  });

  it('stacks over the cards in motion, under the page controls', () => {
    /** The z-index a rule of that source sets. */
    function zOf(source: string, selector: string): number {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = new RegExp(`\\n\\s*${escaped} \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
      const z = /z-index: (-?\d+);/.exec(rule)?.[1];
      if (z === undefined) {
        throw new Error(`no z-index for ${selector}`);
      }
      return Number(z);
    }
    const atRest = zOf(arrowsSource, '.arrows');
    const raised = zOf(arrowsSource, '.arrows.raised');

    // At rest: under the resting hand and the preview.
    expect(atRest).toBeLessThan(zOf(handSource, '.hand'));
    expect(atRest).toBeLessThan(zOf(tableSource, '.peek'));
    // Raised: over the flights and the drag ghosts, under the controls and the dialogs.
    expect(raised).toBeGreaterThan(zOf(flightsSource, '.fly'));
    expect(raised).toBeGreaterThan(zOf(dragSource, '.draglayer'));
    expect(raised).toBeLessThan(zOf(hintSource, '.arrowhint'));
    expect(raised).toBeLessThan(zOf(pillSource, '.tokpill'));
    expect(raised).toBeLessThan(zOf(dialogSource, '.backdrop'));
    // The scroller does not trap the arrows in a stacking context of its own.
    const scroller = /\n {2}\.tablewrap \{([^}]*)\}/.exec(tableSource)?.[1] ?? '';
    expect(scroller).not.toMatch(/z-index|isolation/);
  });

  it('shows a rubber band from the source card in arrow mode', async () => {
    await renderTable();
    pointAt(null);
    await fireEvent.pointerEnter(placed('mine'), { clientX: 50, clientY: 400 });
    await fireEvent.keyDown(window, { key: 'a' });
    expect(interaction.arrowFrom).toBe('mine');

    await fireEvent.pointerMove(window, { clientX: 600, clientY: 500 });
    await waitFor(() => expect(rubber()).not.toBeNull());
    expect(rubber()?.style.stroke).toBe('var(--p3)');
    expect(startOf(rubber()!)).toEqual([70, 400]);
    expect(endOf(rubber()!)).toEqual([600, 490]);

    // Over another card, it snaps to that card's edge: "other" spans 420-520, its middle at 470,
    // and the arrow stops 10 px into it.
    pointAt('other');
    await fireEvent.pointerMove(window, { clientX: 470, clientY: 420 });
    await waitFor(() => expect(endOf(rubber()!)).toEqual([430, 400]));

    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(rubber()).toBeNull());
  });
});

describe('Shift + drag', () => {
  it('draws an arrow from the pressed card to the card it is released on', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400, shiftKey: true });
    expect(interaction.arrowFrom).toBe('mine');

    // The card itself does not move.
    await fireEvent.pointerMove(window, { clientX: 300, clientY: 100, buttons: 1 });
    expect(document.querySelectorAll('.draglayer .card')).toHaveLength(0);

    pointAt('v');
    await fireEvent.pointerUp(window, { clientX: 350, clientY: 100 });
    expect(session.act).toHaveBeenCalledWith({ kind: 'arrowAdd', card: 'mine', target: 'v' }, 0);
    expect(interaction.arrowFrom).toBeNull();
  });

  it('released on no other card, it draws nothing', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400, shiftKey: true });
    pointAt(null);
    await fireEvent.pointerUp(window, { clientX: 900, clientY: 800 });

    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400, shiftKey: true });
    pointAt('mine');
    await fireEvent.pointerUp(window, { clientX: 60, clientY: 410 });

    expect(session.act).not.toHaveBeenCalled();
    expect(interaction.arrowFrom).toBeNull();
  });

  it('a spectator draws no arrow', async () => {
    const { session } = await renderTable(makeView({ spectator: true }));
    await fireEvent.pointerDown(placed('mine'), { clientX: 50, clientY: 400, shiftKey: true });
    expect(interaction.arrowFrom).toBeNull();

    pointAt('v');
    await fireEvent.pointerUp(window, { clientX: 350, clientY: 100 });
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('a click on an empty spot', () => {
  it('empty click clears own arrows', async () => {
    const { session } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );
    // A touch tap opened a card's menu: the same tap on an empty spot closes it too.
    await fireEvent.pointerDown(placed('other'), { pointerType: 'touch' });
    await fireEvent.click(placed('other'));
    expect(interaction.contextMenu).not.toBeNull();

    await fireEvent.pointerDown(surface(), { pointerType: 'touch' });
    expect(interaction.contextMenu).toBeNull();
    // Ruling P5c-R7: once let go, as the press did not become a rubber band.
    expect(session.act).not.toHaveBeenCalled();
    await fireEvent.pointerUp(window, { pointerType: 'touch' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'arrowClear' }, 0);
  });

  it('clears them with the main button only', async () => {
    const { session } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );
    await fireEvent.pointerDown(surface(), { button: 2 });
    await fireEvent.pointerDown(surface(), { button: 1 });

    expect(session.act).not.toHaveBeenCalled();
  });

  it("does not clear them from the table's scrollbars", async () => {
    const { session } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );
    // The scroller spans 1000 × 900 on the screen; its scrollbars take 16 px at the bottom and the
    // right.
    Object.defineProperty(scroller(), 'clientHeight', { value: 884 });
    Object.defineProperty(scroller(), 'clientWidth', { value: 984 });

    await fireEvent.pointerDown(scroller(), { clientX: 500, clientY: 890 });
    await fireEvent.pointerUp(window, { clientX: 500, clientY: 890 });
    await fireEvent.pointerDown(scroller(), { clientX: 990, clientY: 500 });
    await fireEvent.pointerUp(window, { clientX: 990, clientY: 500 });
    expect(session.act).not.toHaveBeenCalled();

    // Inside the scrollbars, the scroller is an empty spot like any other.
    await fireEvent.pointerDown(scroller(), { clientX: 500, clientY: 870 });
    await fireEvent.pointerUp(window, { clientX: 500, clientY: 870 });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'arrowClear' }, 0);
  });

  it("clears them from the frame around an owner's piles", async () => {
    const view = makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] });
    view.table!.piles = [{ id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 330, count: 30 }];
    const { session } = await renderTable(view);

    await fireEvent.pointerDown(document.querySelector<HTMLElement>('.ownerbox .owner')!);
    await fireEvent.pointerUp(window);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'arrowClear' }, 0);
  });

  it("sends nothing without arrows of one's own", async () => {
    const { session } = await renderTable(
      makeView({ arrows: [{ from: 'sam', to: 'v', seat: 1 }] }),
    );
    await fireEvent.pointerDown(surface());

    expect(session.act).not.toHaveBeenCalled();
  });

  it('only cancels the arrow mode', async () => {
    const { session } = await renderTable(
      makeView({ arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );
    await fireEvent.pointerEnter(placed('mine'), { clientX: 50, clientY: 400 });
    await fireEvent.keyDown(window, { key: 'a' });
    await fireEvent.pointerDown(surface());

    expect(interaction.arrowFrom).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it("a spectator's clears nothing", async () => {
    const { session } = await renderTable(
      makeView({ spectator: true, arrows: [{ from: 'mine', to: 'v', seat: 0 }] }),
    );
    await fireEvent.pointerDown(surface());

    expect(session.act).not.toHaveBeenCalled();
  });
});
