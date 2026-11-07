import { fireEvent, render } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards } from '../lib/catalog';
import { DESKTOP, mockScreen } from '../lib/screen.testing';
import type { PackFace, View } from '../lib/types';
import {
  card,
  domRect,
  fakeSession,
  infoFrom,
  pile,
  placed,
  playingView,
  seated,
  tallTable,
  VILLAIN_STAGE,
} from './fixtures.testing';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
};

/** A tablet: a finger, no hover, wide enough for the hand to show as a fan. */
const TOUCH_TABLET = { width: 1280, height: 800, touch: true };

/** Alex (p0) with Rhino: one card of Alex's on the table, three in the hand, and the first player token. */
function makeView(): View {
  return playingView({
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [seated('Alex', 0, [{ area: 'p0', heroName: 'Spider-Man', handCount: 3 }], true)],
    table: {
      cards: [
        card('mine', { y: 300 }),
        card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
        card('h1', { zone: 'hand' }),
        card('h2', { zone: 'hand' }),
        card('h3', { zone: 'hand' }),
      ],
      piles: [pile('enc', { kind: 'encounter', x: 0, count: 20 })],
      hands: { p0: ['h1', 'h2', 'h3'] },
      stages: [VILLAIN_STAGE],
      firstPlayer: { x: 860, y: 340 },
    },
  });
}

// The screen, at zoom 1: the surface 20 px in from the left and 40 px down from the top, the hand
// at the bottom. "mine" lies at 20, 340 on the screen, the first player token at 880, 380.
const SURFACE = { left: 20, top: 40 };
const HAND_TOP = 700;

function layOut(view: View): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('tablewrap')) {
      return domRect(0, 0, 1000, 900);
    }
    if (this.classList.contains('surface')) {
      return domRect(SURFACE.left, SURFACE.top, 1200, 1200);
    }
    const token = view.table?.firstPlayer;
    if (this.closest('.surface') && this.classList.contains('marker') && token) {
      return domRect(SURFACE.left + token.x, SURFACE.top + token.y, 84, 70);
    }
    const id = (this as HTMLElement).dataset.id;
    if (this.closest('.surface') && id) {
      const table = view.table;
      const at =
        table?.cards.find((c) => c.id === id && c.zone === 'table') ??
        table?.piles.find((p) => p.id === id);
      if (at) {
        return domRect(SURFACE.left + at.x, SURFACE.top + at.y, 112, 157);
      }
    }
    const hcard = this.closest<HTMLElement>('.hcard');
    if (hcard && !hcard.classList.contains('gap')) {
      const hand = hcard.closest<HTMLElement>('.hand');
      const index = [...(hand?.querySelectorAll('.hcard') ?? [])].indexOf(hcard);
      return domRect(300 + index * 140, HAND_TOP, 132, 185);
    }
    return domRect(0, 0, 0, 0);
  });
}

async function renderTable(view = makeView()) {
  const session = fakeSession();
  layOut(view);
  const { unmount } = render(Table, { session, view });
  // The actions need the catalog.
  await Promise.resolve();
  return { session, unmount };
}

async function press(element: Element, x: number, y: number, pointerType = 'touch', pointerId = 1) {
  await fireEvent.pointerDown(element, { clientX: x, clientY: y, pointerType, pointerId });
}

async function moveTo(x: number, y: number, pointerType = 'touch', pointerId = 1) {
  await fireEvent.pointerMove(window, {
    clientX: x,
    clientY: y,
    buttons: 1,
    pointerType,
    pointerId,
  });
}

async function release(x: number, y: number, pointerType = 'touch', pointerId = 1) {
  await fireEvent.pointerUp(window, { clientX: x, clientY: y, pointerType, pointerId });
}

/** Lets that much time go by with the finger where it is. */
async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

function ghosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.draglayer .card')];
}

function marker(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.surface .marker[data-marker="firstPlayer"]',
  );
  if (!element) {
    throw new Error('no first player token on the table');
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

beforeEach(() => {
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoFrom(FACES));
  tallTable();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  interaction.reset();
});

describe('a touch press on a table card, in touch mode', () => {
  beforeEach(() => {
    mockScreen(TOUCH_TABLET);
  });

  it('scrolls the table on a quick swipe: no lift, no drop', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await wait(50);
    await moveTo(50, 430);
    await wait(50);
    await moveTo(50, 470);
    expect(ghosts()).toEqual([]);
    expect(interaction.held).toBeNull();
    expect(interaction.armed).toBe(false);

    await release(50, 470);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('waits while the finger stays within the slop, before the hold', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400);
    await wait(100);
    await moveTo(53, 400);
    expect(interaction.held).not.toBeNull();
    expect(interaction.armed).toBe(false);
    expect(ghosts()).toEqual([]);
  });

  it('arms after the hold, lifts the card and buzzes; then a move drags it', async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, vibrate });
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await wait(299);
    expect(interaction.armed).toBe(false);
    expect(placed('mine').classList).not.toContain('armed');

    await wait(1);
    expect(interaction.armed).toBe(true);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(10);
    expect(placed('mine').classList).toContain('armed');
    expect(ghosts()).toEqual([]);

    await moveTo(110, 400);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
    expect(placed('mine').classList).toContain('lifted');

    await release(110, 400);
    expect(session.act).toHaveBeenCalledOnce();
    expect(interaction.armed).toBe(false);
  });

  it("drops the card on the tablet's coarser grid: across on 20s, down on 10 past them", async () => {
    const { session } = await renderTable();
    // Held 30 px in from its left edge, 60 down: let go there, its corner lies at 215, 362 on the
    // table, which the 10-unit grid would take to 220, 360.
    await press(placed('mine'), 50, 400);
    await wait(300);
    await moveTo(265, 462);
    await release(265, 462);
    expect(session.act).toHaveBeenCalledExactlyOnceWith(
      { kind: 'move', card: 'mine', x: 220, y: 370 },
      0,
    );
  });

  it('keeps the page from scrolling under the finger once armed, and only then', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400);
    const early = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    placed('mine').dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);

    await wait(300);
    const armed = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    placed('mine').dispatchEvent(armed);
    expect(armed.defaultPrevented).toBe(true);

    await release(50, 400);
    const after = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    placed('mine').dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('is cleared by a pointercancel, armed or not', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400);
    await fireEvent.pointerCancel(window, { clientX: 50, clientY: 400, pointerId: 1 });
    expect(interaction.held).toBeNull();
    await wait(300);
    expect(interaction.armed).toBe(false);

    await press(placed('mine'), 50, 400);
    await wait(300);
    expect(interaction.armed).toBe(true);
    await fireEvent.pointerCancel(window, { clientX: 50, clientY: 400, pointerId: 1 });
    expect(interaction.held).toBeNull();
    expect(interaction.armed).toBe(false);
    expect(placed('mine').classList).not.toContain('armed');
  });

  it('opens nothing when armed and let go without a move', async () => {
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400);
    await wait(300);
    await release(50, 400);
    await fireEvent.click(placed('mine'));
    expect(interaction.contextMenu).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('holds a pile and the first player token the same way', async () => {
    await renderTable();
    // The encounter deck lies at 20, 40 on the screen.
    await press(placed('enc'), 60, 100);
    await moveTo(60, 140);
    expect(interaction.held).toBeNull();

    await press(placed('enc'), 60, 100);
    await wait(300);
    expect(placed('enc').classList).toContain('armed');
    await release(60, 100);

    await press(marker(), 900, 400);
    await wait(300);
    expect(interaction.armed).toBe(true);
    expect(marker().classList).toContain('armed');
    await moveTo(900, 460);
    expect(document.querySelector('.draglayer .marker')).not.toBeNull();
  });

  it('drags a hand card at once, as before', async () => {
    await renderTable();
    await press(handCard('h2'), 500, 760);
    await moveTo(500, 600);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['h2']);
    expect(interaction.armed).toBe(false);
  });

  it('adds its scroll guard at the press, and stops the scroll only once armed', async () => {
    await renderTable();
    // Touch events target the element the finger landed on.
    const add = vi.spyOn(placed('mine'), 'addEventListener');
    const remove = vi.spyOn(placed('mine'), 'removeEventListener');
    await press(placed('mine'), 50, 400);
    const touchmoves = () => add.mock.calls.filter(([type]) => type === 'touchmove');
    expect(touchmoves()).toEqual([['touchmove', expect.any(Function), { passive: false }]]);

    await wait(300);
    expect(interaction.armed).toBe(true);
    expect(touchmoves()).toHaveLength(1);

    await release(50, 400);
    const guard = touchmoves()[0]![1];
    expect(remove).toHaveBeenCalledWith('touchmove', guard);
  });

  it('guards the whole page from before the first touch, and stops the scroll only once armed', async () => {
    // Chrome asks the page whether it may cancel a touch's moves where the first one lands: a
    // guard on the touched card alone lets a finger that leaves the card at once scroll the page.
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await renderTable();
    const guards = add.mock.calls.filter(([type]) => type === 'touchmove');
    expect(guards).toEqual([['touchmove', expect.any(Function), { passive: false }]]);

    const moveOverThePage = () => {
      const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(move);
      return move.defaultPrevented;
    };
    expect(moveOverThePage()).toBe(false);
    await press(placed('mine'), 50, 400);
    expect(moveOverThePage()).toBe(false);
    await wait(300);
    expect(moveOverThePage()).toBe(true);
    await release(50, 400);
    expect(moveOverThePage()).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledWith('touchmove', guards[0]![1]);
  });

  it('removes its scroll guard when the finger scrolls the table instead', async () => {
    await renderTable();
    const remove = vi.spyOn(placed('mine'), 'removeEventListener');
    await press(placed('mine'), 50, 400);
    await moveTo(50, 470);
    expect(interaction.held).toBeNull();
    expect(remove.mock.calls.some(([type]) => type === 'touchmove')).toBe(true);
  });

  it('no longer shows its pile card armed once the drag starts', async () => {
    await renderTable();
    await press(placed('enc'), 60, 100);
    await wait(300);
    expect(placed('enc').classList).toContain('armed');

    await moveTo(60, 160);
    expect(interaction.dragging).not.toBeNull();
    expect(interaction.isArmed({ kind: 'pile', id: 'enc' })).toBe(false);
    expect(placed('enc').classList).not.toContain('armed');
  });

  it('keeps the page from scrolling when the pile it drags its last card from empties', async () => {
    const view = makeView();
    view.table!.cards.push(card('d1', { zone: 'pile' }));
    view.table!.piles.push(
      pile('disc:p0', { kind: 'discard', owner: 0, x: 150, count: 1, cards: ['d1'] }),
    );
    await renderTable(view);
    // The finger lands on the pile's card art, which touch events target until the finger lifts.
    const touched = placed('disc:p0').querySelector('.art')!;
    await press(touched, 200, 100);
    await wait(300);
    await moveTo(200, 300);
    expect(interaction.dragging).not.toBeNull();
    // The pile counts its only card out: it draws its empty slot, and the art the finger touched is gone.
    expect(touched.isConnected).toBe(false);

    const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    touched.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
  });
});

describe('a pinch, in touch mode', () => {
  beforeEach(() => {
    mockScreen(TOUCH_TABLET);
  });

  it('lets go of a press waiting for the hold, which then never arms', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400, 'touch', 1);
    await press(placed('v'), 340, 100, 'touch', 2);
    expect(interaction.held).toBeNull();

    await wait(300);
    expect(interaction.armed).toBe(false);
    expect(placed('mine').classList).not.toContain('armed');
  });

  it('gives the press to no second finger, on a card or on a marker', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400, 'touch', 1);
    await press(marker(), 900, 400, 'touch', 2);
    expect(interaction.held).toBeNull();
    await wait(300);
    expect(interaction.armed).toBe(false);
    expect(marker().classList).not.toContain('armed');
  });

  it('is over once the fingers lift: the next press holds again', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400, 'touch', 1);
    await press(placed('v'), 340, 100, 'touch', 2);
    await release(340, 100, 'touch', 2);
    await release(50, 400, 'touch', 1);

    await press(placed('mine'), 50, 400, 'touch', 3);
    await wait(300);
    expect(interaction.armed).toBe(true);
  });

  it('cancels a hand card press not yet dragged', async () => {
    await renderTable();
    await press(handCard('h2'), 500, 760, 'touch', 1);
    await press(placed('mine'), 50, 400, 'touch', 2);
    expect(interaction.held).toBeNull();
    await moveTo(500, 600, 'touch', 1);
    expect(ghosts()).toEqual([]);
  });
});

describe('a touch press on a hand card in the carousel', () => {
  beforeEach(() => {
    mockScreen(TOUCH_TABLET);
  });

  /** Marks the hand as a carousel, as HandSheet.svelte does. */
  function asCarousel(): void {
    const hand = document.querySelector<HTMLElement>('.hand');
    if (!hand) {
      throw new Error('no hand');
    }
    hand.dataset.carousel = '';
  }

  it('lets a sideways move scroll the carousel: no drag', async () => {
    const { session } = await renderTable();
    asCarousel();
    await press(handCard('h2'), 500, 760);
    await moveTo(540, 755);
    expect(ghosts()).toEqual([]);
    expect(interaction.held).toBeNull();
    expect(interaction.dragging).toBeNull();

    await release(560, 755);
    expect(session.act).not.toHaveBeenCalled();
  });

  it('drags the card on a mostly upward move', async () => {
    await renderTable();
    asCarousel();
    await press(handCard('h2'), 500, 760);
    await moveTo(510, 720);
    expect(interaction.dragging?.element).toEqual({ kind: 'hand', id: 'h2' });
  });

  it('keeps the sideways reorder drag of the fan, which is no carousel', async () => {
    await renderTable();
    await press(handCard('h2'), 500, 760);
    await moveTo(540, 755);
    expect(interaction.dragging?.element).toEqual({ kind: 'hand', id: 'h2' });
  });

  it('keeps the sideways drag of a mouse in a carousel', async () => {
    await renderTable();
    asCarousel();
    await press(handCard('h2'), 500, 760, 'mouse');
    await moveTo(540, 755, 'mouse');
    expect(interaction.dragging?.element).toEqual({ kind: 'hand', id: 'h2' });
  });
});

describe('a pen press on a table card, in touch mode', () => {
  beforeEach(() => {
    mockScreen(TOUCH_TABLET);
  });

  // The card lets the browser pan under a pen as under a finger: a pen that dragged at once would
  // pan the table, and its pointercancel would end the drag.
  it('waits for the hold, then arms', async () => {
    await renderTable();
    await press(placed('mine'), 50, 400, 'pen');
    expect(interaction.awaitingHold).toBe(true);
    expect(interaction.armed).toBe(false);

    await wait(300);
    expect(interaction.armed).toBe(true);
    expect(placed('mine').classList).toContain('armed');
  });
});

describe('a mouse press', () => {
  it.each([
    ['outside touch mode', DESKTOP],
    ['in touch mode', TOUCH_TABLET],
  ])('drags a table card as soon as it moves past the threshold, %s', async (_, screen) => {
    mockScreen(screen);
    const { session } = await renderTable();
    await press(placed('mine'), 50, 400, 'mouse');
    await moveTo(60, 400, 'mouse');
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
    expect(interaction.armed).toBe(false);

    await release(60, 400, 'mouse');
    expect(session.act).toHaveBeenCalledOnce();
  });
});

describe('a touch press outside touch mode', () => {
  it('drags a table card at once, as before', async () => {
    mockScreen(DESKTOP);
    await renderTable();
    await press(placed('mine'), 50, 400);
    await moveTo(60, 400);
    expect(ghosts().map((g) => g.dataset.id)).toEqual(['mine']);
  });
});
