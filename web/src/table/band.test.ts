import { fireEvent, render, screen } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  Arrow,
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

// The villain's row at the top, then Alex's, then Sam's, 300 apart.
const CARDS = [
  card('mine', { y: 300 }),
  card('other', { x: 400, y: 300 }),
  card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
  card('sam', { owner: 1, y: 600 }),
  card('h', { zone: 'hand' }),
];

/** Alex (seat 0, colour 2: --p3) and Sam (seat 1) against Rhino; the viewer is Alex, or a spectator. */
function makeView(
  extra: { cards?: TableCard[]; piles?: PileView[]; arrows?: Arrow[]; spectator?: boolean } = {},
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
      piles: extra.piles ?? [],
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

// The screen, at zoom 1: the table's scroller spans 1000 × 900, the surface starts 20 px in and
// 40 px down; every card is 100 × 140. "mine" spans 20-120 × 340-480, "other" 420-520 × 340-480.
const SURFACE = { left: 20, top: 40 };

/** Lays the table out on the screen; `view` gives the table cards their place. */
function layOut(view: () => View): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('surface')) {
      return domRect(SURFACE.left, SURFACE.top, 1200, 1200);
    }
    const id = (this as HTMLElement).dataset.id;
    const placed = view().table?.cards.find((c) => c.id === id && c.zone === 'table');
    if (this.closest('.surface') && placed) {
      return domRect(SURFACE.left + placed.x, SURFACE.top + placed.y, 100, 140);
    }
    return domRect(0, 0, 0, 0);
  });
}

async function renderTable(view: View = makeView()) {
  const session = fakeSession();
  let current = view;
  layOut(() => current);
  const result = render(Table, { session, view });
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

function drawnBand(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app > .band');
}

/** Presses the main button of a mouse on an empty spot of the table. */
async function pressEmpty(x: number, y: number, extra: Partial<PointerEventInit> = {}) {
  await fireEvent.pointerDown(surface(), {
    clientX: x,
    clientY: y,
    button: 0,
    pointerType: 'mouse',
    ...extra,
  });
}

async function moveTo(x: number, y: number) {
  await fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons: 1 });
}

async function letGo(x: number, y: number) {
  await fireEvent.pointerUp(window, { clientX: x, clientY: y });
}

async function pressEscape() {
  await fireEvent.keyDown(window, { key: 'Escape' });
}

const OWN_ARROW: Arrow = { from: 'mine', to: 'v', seat: 0 };

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

describe('the rubber band', () => {
  it('bandSelectsTouchedCards: selects the free table cards it touches', async () => {
    await renderTable();
    await pressEmpty(10, 320);
    await moveTo(450, 500);

    // Drawn from the press to the pointer, whichever way it goes.
    expect(interaction.band).toEqual({ left: 10, top: 320, right: 450, bottom: 500 });
    const band = drawnBand();
    expect(band?.style.left).toBe('10px');
    expect(band?.style.top).toBe('320px');
    expect(band?.style.width).toBe('440px');
    expect(band?.style.height).toBe('180px');

    await letGo(450, 500);
    expect([...interaction.group].sort()).toEqual(['mine', 'other']);
    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();
    // The click that ends the band is swallowed.
    expect(await fireEvent.click(surface())).toBe(false);
  });

  it('is drawn the other way round too, cut to the table', async () => {
    // "far" lies under the table's bottom edge, out of sight: 940-1080 on the screen.
    await renderTable(makeView({ cards: [...CARDS, card('far', { y: 900 })] }));
    await pressEmpty(130, 470);
    await moveTo(50, 1000);

    expect(interaction.band).toEqual({ left: 50, top: 470, right: 130, bottom: 900 });
    await letGo(50, 1000);
    expect([...interaction.group]).toEqual(['mine', 'sam']);
  });

  it('bandPastThresholdOnly: a 3 px move is a plain click, which clears own arrows', async () => {
    const { session } = await renderTable(makeView({ arrows: [OWN_ARROW] }));
    interaction.setGroup(new Set(['other']));
    await pressEmpty(10, 320);
    // A press alone clears nothing: it may still become a band.
    expect(session.act).not.toHaveBeenCalled();

    await moveTo(13, 320);
    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();

    await letGo(13, 320);
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'arrowClear' }, 0);
    expect(interaction.group.size).toBe(0);
  });

  it('bandKeepsArrows: a band clears no arrows', async () => {
    const { session } = await renderTable(makeView({ arrows: [OWN_ARROW] }));
    await pressEmpty(10, 320);
    await moveTo(450, 500);
    await letGo(450, 500);

    expect(session.act).not.toHaveBeenCalled();
    expect(interaction.group.size).toBe(2);
  });

  it('escCancelsBand: Esc ends the press, which draws no band again', async () => {
    await renderTable();
    interaction.setGroup(new Set(['sam']));
    await pressEmpty(10, 320);
    await moveTo(450, 500);
    await pressEscape();
    expect(interaction.band).toBeNull();
    expect(interaction.group.size).toBe(0);

    await moveTo(500, 520);
    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();

    await letGo(500, 520);
    expect(interaction.group.size).toBe(0);
    // Nor is the click that ends it a click on an empty spot.
    expect(await fireEvent.click(surface())).toBe(false);
  });

  it('escapedBandKeepsArrows: a band cancelled with Esc clears no arrows when let go', async () => {
    const { session } = await renderTable(makeView({ arrows: [OWN_ARROW] }));
    await pressEmpty(10, 320);
    await moveTo(450, 500);
    await pressEscape();
    await letGo(450, 500);

    expect(session.act).not.toHaveBeenCalled();
  });

  it('a band touching nothing clears the selection', async () => {
    await renderTable();
    interaction.setGroup(new Set(['mine']));
    await pressEmpty(600, 700);
    await moveTo(700, 800);
    await letGo(700, 800);

    expect(interaction.group.size).toBe(0);
  });

  it('touchStartsNoBand: a finger scrolls the table', async () => {
    await renderTable();
    await pressEmpty(10, 320, { pointerType: 'touch' });
    await moveTo(450, 500);

    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();
  });

  it('starts with no modifier key, nor with another button', async () => {
    await renderTable();
    await pressEmpty(10, 320, { shiftKey: true });
    await moveTo(450, 500);
    expect(interaction.band).toBeNull();
    await letGo(450, 500);

    await pressEmpty(10, 320, { button: 2 });
    await moveTo(450, 500);
    expect(interaction.band).toBeNull();
  });

  it('spectatorStartsNoBand', async () => {
    await renderTable(makeView({ spectator: true }));
    await pressEmpty(10, 320);
    await moveTo(450, 500);

    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();
  });

  it('clickOnEmptySpotClearsGroup', async () => {
    await renderTable();
    interaction.setGroup(new Set(['mine', 'other']));
    await pressEmpty(600, 700);
    await letGo(600, 700);

    expect(interaction.group.size).toBe(0);
  });

  it('cards that leave the table drop out of the selection with the next view', async () => {
    const { rerender } = await renderTable();
    interaction.setGroup(new Set(['mine', 'other']));
    await rerender(makeView({ cards: CARDS.filter((c) => c.id !== 'mine') }));

    expect([...interaction.group]).toEqual(['other']);
  });

  it('cards of a row no longer shown drop out of the selection', async () => {
    // "Villain + player": Alex's row (row 1, from 470) or Sam's (row 2, from 800) under the villain's.
    localStorage.setItem('itf-view', 'focus');
    const piles: PileView[] = [
      { id: 'd0', kind: 'deck', owner: 0, x: 600, y: 500, count: 3 },
      { id: 'd1', kind: 'deck', owner: 1, x: 600, y: 830, count: 3 },
    ];
    const cards = [
      card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
      card('mine', { y: 500 }),
      card('sam', { owner: 1, y: 830 }),
    ];
    await renderTable(makeView({ cards, piles }));
    interaction.setGroup(new Set(['v', 'mine']));

    await fireEvent.click(screen.getByRole('radio', { name: /^Sam/ }));
    expect([...interaction.group]).toEqual(['v']);
  });

  it("selectedCardRinged: a selected card is ringed in the viewer's colour", async () => {
    await renderTable();
    interaction.setGroup(new Set(['mine']));
    await Promise.resolve();

    expect(placed('mine').querySelector('.sring')).not.toBeNull();
    expect(placed('other').querySelector('.sring')).toBeNull();
    expect(document.querySelector<HTMLElement>('.app')?.style.getPropertyValue('--you')).toBe(
      'var(--p3)',
    );
  });
});

describe('the chips of an owner frame', () => {
  // The encounter deck frames the villain's piles, whose victory display has a chip.
  const PILES: PileView[] = [
    { id: 'enc', kind: 'encounter', owner: -1, x: 600, y: 0, count: 20 },
    { id: 'vic', kind: 'victory', owner: -1, x: 0, y: 0, count: 1, cards: [] },
  ];

  function victoryChip(): HTMLElement {
    const chip = document.querySelector<HTMLElement>('.surface .chip[data-pile="vic"]');
    if (!chip) {
      throw new Error('no victory display chip');
    }
    return chip;
  }

  async function pressChip(extra: Partial<PointerEventInit> = {}) {
    await fireEvent.pointerDown(victoryChip(), {
      clientX: 700,
      clientY: 30,
      button: 0,
      pointerType: 'mouse',
      ...extra,
    });
  }

  it('a press on a chip is no empty spot: no band, the selection, the hover and the arrows stay', async () => {
    const { session } = await renderTable(makeView({ piles: PILES, arrows: [OWN_ARROW] }));
    interaction.setGroup(new Set(['mine']));
    await fireEvent.pointerEnter(placed('other'), { clientX: 450, clientY: 400 });

    await pressChip();
    await moveTo(450, 500);
    expect(interaction.band).toBeNull();
    expect(drawnBand()).toBeNull();
    await letGo(450, 500);

    expect([...interaction.group]).toEqual(['mine']);
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'other' });
    expect(session.act).not.toHaveBeenCalled();
  });

  it('Alt + click on a chip pings nothing', async () => {
    const { session } = await renderTable(makeView({ piles: PILES }));

    await pressChip({ altKey: true });

    expect(session.sendPresence).not.toHaveBeenCalledWith(
      expect.objectContaining({ ping: expect.anything() }),
    );
  });
});
