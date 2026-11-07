// A card the viewer draws into their own hand in dock mode (a phone): the hand is not drawn on the
// table, so its copy flies from its pile to the dock's hand button (the card's mini card, or the
// avatar of the rail), or to the hero selector entry of another of the viewer's decks, and the
// avatar pulses as it lands. With the hand sheet open on that hand, it flies into its carousel
// slot, over the sheet. A table card taken back into the hand flies to the dock the same way, face
// up. Out of dock mode, and under reduced motion, nothing changes.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Flights from './Flights.svelte';
import flightsSource from './Flights.svelte?raw';
import sheetSource from '../components/Sheet.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { PORTRAIT_CARD } from './layout';
import { motion } from './motion.svelte';
import { diffViews, type Anim } from './animate';
import type { CardView, PileView, TableView } from '../lib/types';
import { card, playingView } from './fixtures.testing';

const reducedMotion = vi.hoisted(() => ({ on: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return reducedMotion.on;
    },
  },
}));

const ZOOM = 0.8;
const DECK: PileView = { id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 0, count: 30 };

function table(cards: CardView[], hands: Record<string, string[]>, deckCount = 30): TableView {
  return {
    cards,
    piles: [{ ...DECK, count: deckCount }],
    stages: [],
    hands,
  } as unknown as TableView;
}

/** Seat 0's hand before: h1, h2, h3, h4, each card in it. */
const HELD = ['h1', 'h2', 'h3', 'h4'];
const heldCards = (ids: string[], owner = 0) => ids.map((id) => card(id, { zone: 'hand', owner }));

/** The viewer draws d (and e, f) out of their deck into seat 0's hand, after h1… */
function drawOf(ids: string[], held: string[] = []) {
  const before = table(heldCards(held), { p0: held });
  const after = table(heldCards([...held, ...ids]), { p0: [...held, ...ids] }, 30 - ids.length);
  const anims: Anim[] = ids.map((id) => ({ kind: 'draw', id, fromPile: 'deck:p0', faceUp: false }));
  return { anims, tables: { before, after } };
}

/** An element of the page, placed (jsdom lays nothing out: see fakeRect). */
function box(className: string, at: { left: number; top: number; width: number; height: number }) {
  const element = document.createElement('div');
  element.className = className;
  element.style.left = `${at.left}px`;
  element.style.top = `${at.top}px`;
  element.style.width = `${at.width}px`;
  element.style.height = `${at.height}px`;
  return element;
}

/** The deck's box on the surface, where a copy leaves from. */
const DECK_BOX = { left: 300, top: 20, width: 67, height: 94 };
const DECK_FROM = { cx: 333.5, cy: 67, w: 67, h: 94 };

/** The table screen: its surface with the viewer's deck. */
function page(dock = true): HTMLElement {
  const app = document.createElement('div');
  app.className = dock ? 'app dock-mode' : 'app';
  const surface = box('surface', { left: 0, top: 0, width: 400, height: 400 });
  const deck = box('card pile', DECK_BOX);
  deck.dataset.id = 'deck:p0';
  surface.append(deck);
  app.append(surface);
  document.body.append(app);
  return app;
}

/** The dock's bar, its hand button showing seat's hand, its minis those of minis. */
function dockBar(app: HTMLElement, seat: number, minis: string[]): HTMLElement {
  const bar = box('dock', { left: 0, top: 700, width: 390, height: 60 });
  const button = box('handbtn', { left: 14, top: 706, width: 300, height: 48 });
  button.dataset.seat = String(seat);
  button.append(box('avatar', { left: 20, top: 710, width: 40, height: 40 }));
  const row = document.createElement('span');
  row.className = 'minis';
  for (const [i, id] of minis.entries()) {
    const mini = box('mini', { left: 70 + 13 * i, top: 714, width: 22, height: 31 });
    mini.dataset.id = id;
    row.append(mini);
  }
  button.append(row);
  bar.append(button);
  app.append(bar);
  return button;
}

/** The dock's rail (a phone on its side), its hand button the avatar alone. */
function dockRail(app: HTMLElement, seat: number): HTMLElement {
  const rail = box('dock rail', { left: 0, top: 0, width: 64, height: 390 });
  const button = box('handbtn', { left: 8, top: 8, width: 48, height: 48 });
  button.dataset.seat = String(seat);
  button.append(box('avatar', { left: 12, top: 12, width: 40, height: 40 }));
  rail.append(button);
  app.append(rail);
  return button;
}

/** A hero selector, one entry per seat, each with its avatar (.swatch), inside parent. */
function heroSelector(parent: HTMLElement, seats: number[]): void {
  const picker = document.createElement('div');
  picker.className = 'picker';
  for (const [i, seat] of seats.entries()) {
    const item = document.createElement('button');
    item.className = 'item';
    item.dataset.seat = String(seat);
    item.append(box('swatch', { left: 10 + 40 * i, top: 600, width: 30, height: 30 }));
    picker.append(item);
  }
  parent.append(picker);
}

/** The hand sheet open on seat 0's hand, its carousel listing cards, its header a hero selector. */
function handSheet(app: HTMLElement, cards: string[], seats: number[] = []): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'sheet dock';
  heroSelector(sheet, seats);
  const hand = document.createElement('ul');
  hand.className = 'hand';
  hand.dataset.seat = '0';
  for (const [i, id] of cards.entries()) {
    const item = box('hcard', { left: 70 + 260 * i, top: 200, width: 250, height: 350 });
    item.dataset.id = id;
    hand.append(item);
  }
  sheet.append(hand);
  app.append(sheet);
  return sheet;
}

/** A portrait card's box as high as a box of that size, centred on it. */
function portraitOn(at: { left: number; top: number; width: number; height: number }) {
  return {
    cx: at.left + at.width / 2,
    cy: at.top + at.height / 2,
    w: (at.height * PORTRAIT_CARD.w) / PORTRAIT_CARD.h,
    h: at.height,
  };
}

function fakeRect(this: HTMLElement): DOMRect {
  const left = Number.parseFloat(this.style.left) || 0;
  const top = Number.parseFloat(this.style.top) || 0;
  const width = Number.parseFloat(this.style.width) || 0;
  const height = Number.parseFloat(this.style.height) || 0;
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

/** A Web Animation as the stub starts it: it ends when a test finishes it, or once cancelled. */
interface FakeAnimation {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
}

let started: FakeAnimation[] = [];

const animate = vi.fn(function (
  this: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  let finish = () => {};
  let abort = () => {};
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    abort = () => reject(new DOMException('The animation was cancelled', 'AbortError'));
  });
  started.push({ element: this, keyframes, options, finish });
  return { finished, cancel: abort, effect: { setKeyframes: vi.fn() } };
});

/** The animations started on the elements matching selector. */
function animationsOf(selector: string): FakeAnimation[] {
  return started.filter((animation) => animation.element.matches(selector));
}

let originals: {
  animate: typeof Element.prototype.animate;
  rect: typeof HTMLElement.prototype.getBoundingClientRect;
};

beforeEach(() => {
  originals = {
    animate: Element.prototype.animate,
    rect: HTMLElement.prototype.getBoundingClientRect,
  };
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  HTMLElement.prototype.getBoundingClientRect = fakeRect;
});

afterEach(() => {
  Element.prototype.animate = originals.animate;
  HTMLElement.prototype.getBoundingClientRect = originals.rect;
  animate.mockClear();
  started = [];
  motion.stop();
  motion.flights = [];
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** Draws the cards with the dock drawn as the new view draws it (dock, a callback on the page). */
async function draw(app: HTMLElement, ids: string[], held: string[] = []): Promise<void> {
  const { anims, tables } = drawOf(ids, held);
  await motion.animate(app, anims, tables, ZOOM);
}

/** Renders the copies of the flights as the table does, in dock mode or not. */
function renderFlights(app: HTMLElement, dock = true): void {
  render(Flights, {
    target: app,
    props: { faceOf: () => null, captionOf: () => undefined },
    context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
  });
}

describe('a card drawn into the hand in dock mode, the hand sheet shut', () => {
  it('flies from its pile to its own mini card on the bar, face down turning up, hidden till it lands', async () => {
    const app = page();
    const button = dockBar(app, 0, ['h1', 'd']);

    await draw(app, ['d'], ['h1']);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        card: { id: 'd' },
        faceUp: false,
        from: DECK_FROM,
        to: { cx: 70 + 13 + 11, cy: 714 + 15.5, w: 22, h: 31 },
        angle: 0,
        delay: 0,
        overSheet: false,
        dock: { fades: false, pulse: button.querySelector('.avatar') },
      },
    ]);
    expect(motion.drawing.has('d')).toBe(true);
    // Its deck's count hides until it has landed.
    expect(motion.isHushed('deck:p0')).toBe(true);
  });

  it('lands on the last mini card when it is past the fourth card of the hand', async () => {
    const app = page();
    dockBar(app, 0, HELD);

    await draw(app, ['d'], HELD);

    expect(motion.flights).toMatchObject([
      { kind: 'draw', to: { cx: 70 + 39 + 11, cy: 714 + 15.5, w: 22, h: 31 } },
    ]);
  });

  it('flies to the avatar on the rail, a card as high as the avatar, fading out', async () => {
    const app = page();
    const button = dockRail(app, 0);

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        to: portraitOn({ left: 12, top: 12, width: 40, height: 40 }),
        dock: { fades: true, pulse: button.querySelector('.avatar') },
      },
    ]);
  });

  it("flies to another own deck's hero selector entry, fading out, when the dock shows another hand", async () => {
    const app = page();
    dockBar(app, 1, ['a1']);
    heroSelector(app, [0, 1]);

    await draw(app, ['d']);

    const swatch = app.querySelector('.item[data-seat="0"] .swatch');
    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        to: portraitOn({ left: 10, top: 600, width: 30, height: 30 }),
        dock: { fades: true, pulse: swatch },
        overSheet: false,
      },
    ]);
    expect(motion.drawing.has('d')).toBe(true);
  });

  it('leaves its pile out of sight when nothing on the screen shows its hand', async () => {
    const app = page();
    dockBar(app, 1, ['a1']);

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([{ kind: 'drawAway', pile: 'deck:p0' }]);
    expect(motion.drawing.size).toBe(0);
  });

  it('leaves one after the other, 70 ms apart', async () => {
    const app = page();
    dockBar(app, 0, ['d', 'e', 'f']);

    await draw(app, ['d', 'e', 'f']);

    expect(motion.flights.map((flight) => [flight.kind, flight.delay])).toEqual([
      ['draw', 0],
      ['draw', 70],
      ['draw', 140],
    ]);
  });

  it('shows in the hand at once under reduced motion: no copy, nothing hidden', async () => {
    const app = page();
    dockBar(app, 0, ['d']);
    reducedMotion.on = true;
    try {
      await draw(app, ['d']);
    } finally {
      reducedMotion.on = false;
    }

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.size).toBe(0);
    expect(animate).not.toHaveBeenCalled();
  });

  it('leaves its pile out of sight out of dock mode, as before', async () => {
    const app = page(false);
    dockBar(app, 0, ['d']);

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([{ kind: 'drawAway', pile: 'deck:p0' }]);
    expect(motion.drawing.size).toBe(0);
  });
});

describe('a view that fails to be drawn in dock mode', () => {
  it('shows at once the cards it hid for copies that never took off', async () => {
    const app = page();
    const button = dockBar(app, 0, ['d']);
    // A table card discarded in the same view, flying to its pile: hidden there from the start.
    const discard: PileView = { id: 'disc:p0', kind: 'discard', owner: 0, x: 0, y: 0, count: 0 };
    const pileBox = box('card pile', { left: 200, top: 20, width: 67, height: 94 });
    pileBox.dataset.id = 'disc:p0';
    const placed = box('card', { left: 40, top: 40, width: 67, height: 94 });
    placed.dataset.id = 'x';
    app.querySelector('.surface')!.append(pileBox, placed);
    const before = table([card('x')], { p0: [] });
    before.piles.push(discard);
    const after = table(
      [card('x', { zone: 'pile' }), card('d', { zone: 'hand' })],
      { p0: ['d'] },
      29,
    );
    after.piles.push({ ...discard, count: 1, cards: ['x'] });
    const anims: Anim[] = [
      { kind: 'fly', id: 'x', toPile: 'disc:p0' },
      { kind: 'draw', id: 'd', fromPile: 'deck:p0', faceUp: false },
    ];
    // Measuring the dock fails once the view is drawn.
    vi.spyOn(
      button.querySelector<HTMLElement>('.mini')!,
      'getBoundingClientRect',
    ).mockImplementation(() => {
      throw new Error('gone');
    });

    const animating = motion.animate(app, anims, { before, after }, ZOOM);
    expect(motion.drawing.has('d')).toBe(true);
    expect(motion.flying.has('x')).toBe(true);
    await expect(animating).rejects.toThrow('gone');

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.size).toBe(0);
    expect(motion.flying.size).toBe(0);
  });
});

describe("a drawn card's copy flying to the dock", () => {
  it('turns face up on its way, held up, landing at full opacity on a mini card', async () => {
    const app = page();
    dockBar(app, 0, ['d']);
    renderFlights(app);

    await draw(app, ['d']);
    await tick();

    const copy = app.querySelector<HTMLElement>('.fly')!;
    expect(copy.querySelector('[data-side="back"]')).not.toBeNull();
    const [way, lift] = animationsOf('.fly');
    expect(way?.keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
    expect(way?.options).toMatchObject({ duration: 380, delay: 0 });
    expect(lift?.keyframes.map((frame) => frame.scale)).toEqual(['1', '1.06', '1']);
    expect(animationsOf('.fly [data-side="back"]')).toHaveLength(1);
    expect(animationsOf('.fly').filter(({ keyframes }) => 'opacity' in keyframes[0]!)).toEqual([]);
    // Under the hand sheet, as any flight but a rise.
    expect(copy.classList).not.toContain('over');
  });

  it('fades out evenly over the last part of its way into an avatar', async () => {
    const app = page();
    dockRail(app, 0);
    renderFlights(app);

    await draw(app, ['d']);
    await tick();

    const fades = animationsOf('.fly').filter(({ keyframes }) => 'opacity' in keyframes[0]!);
    expect(fades).toHaveLength(1);
    expect(fades[0]?.keyframes).toEqual([
      { opacity: 1 },
      { opacity: 1, offset: 0.55 },
      { opacity: 0 },
    ]);
    expect(fades[0]?.options).toMatchObject({ duration: 380, delay: 0, easing: 'linear' });
  });

  it('pulses the avatar as it lands, the card then showing in the hand', async () => {
    const app = page();
    const button = dockBar(app, 0, ['d']);
    renderFlights(app);
    await draw(app, ['d']);
    await tick();
    expect(animationsOf('.avatar')).toEqual([]);

    animationsOf('.fly')[0]?.finish();
    await tick();
    await tick();

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.has('d')).toBe(false);
    const pulses = animationsOf('.avatar');
    expect(pulses).toHaveLength(1);
    expect(pulses[0]?.element).toBe(button.querySelector('.avatar'));
    expect(pulses[0]?.keyframes.map((frame) => frame.scale)).toEqual(['1', '1.12', '1']);
    expect(pulses[0]?.options).toMatchObject({ duration: 200 });
    // Only its scale: nothing that would paint the avatar again on each frame.
    expect(pulses[0]?.keyframes.flatMap((frame) => Object.keys(frame))).not.toContain('filter');
  });

  it("pulses the hero selector entry's avatar as it lands there", async () => {
    const app = page();
    dockBar(app, 1, ['a1']);
    heroSelector(app, [0, 1]);
    renderFlights(app);
    await draw(app, ['d']);
    await tick();

    animationsOf('.fly')[0]?.finish();
    await tick();
    await tick();

    expect(animationsOf('.swatch').map(({ element }) => element)).toEqual([
      app.querySelector('.item[data-seat="0"] .swatch'),
    ]);
  });

  it('pulses nothing when stopped before it lands', async () => {
    const app = page();
    dockBar(app, 0, ['d']);
    renderFlights(app);
    await draw(app, ['d']);
    await tick();

    motion.stop();
    await tick();
    await tick();

    expect(animationsOf('.avatar')).toEqual([]);
    expect(motion.drawing.size).toBe(0);
  });
});

describe('a card drawn into the hand in dock mode, the hand sheet open', () => {
  it('flies into its carousel slot, over the sheet', async () => {
    const app = page();
    dockBar(app, 0, ['h1', 'd']);
    handSheet(app, ['h1', 'd']);
    renderFlights(app);

    await draw(app, ['d'], ['h1']);
    await tick();

    expect(motion.flights).toMatchObject([
      { kind: 'draw', to: { cx: 330 + 125, cy: 375, w: 250, h: 350 }, dock: null, overSheet: true },
    ]);
    expect(motion.drawing.has('d')).toBe(true);
    expect(app.querySelector('.fly')?.classList).toContain('over');
    const zIndex = (source: string, selector: string) =>
      Number(new RegExp(`\\n {2}${selector} \\{[^}]*z-index: (\\d+);`).exec(source)?.[1]);
    expect(zIndex(flightsSource, '\\.fly\\.over')).toBeGreaterThan(zIndex(sheetSource, '\\.sheet'));
  });

  it("flies to the sheet's own hero selector entry, over the sheet, for another own deck", async () => {
    const app = page();
    dockBar(app, 1, ['a1']);
    heroSelector(app, [0, 1]);
    const sheet = handSheet(app, ['a1'], [0, 1]);

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        dock: { fades: true, pulse: sheet.querySelector('.item[data-seat="0"] .swatch') },
        overSheet: true,
      },
    ]);
  });
});

describe('a card drawn into the hand in dock mode, the hand sheet sliding away', () => {
  // A leaving sheet stays on the page until it is gone, inert (Sheet.svelte): it shows nothing more.
  it('flies to its mini card on the dock, not into the leaving carousel', async () => {
    const app = page();
    const button = dockBar(app, 0, ['d']);
    handSheet(app, ['d']).setAttribute('inert', '');

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        to: { cx: 81, w: 22 },
        dock: { pulse: button.querySelector('.avatar') },
        overSheet: false,
      },
    ]);
  });

  it("flies to the floating hero selector's entry, not the leaving sheet's", async () => {
    const app = page();
    dockBar(app, 1, ['a1']);
    heroSelector(app, [0, 1]);
    handSheet(app, ['a1'], [0, 1]).setAttribute('inert', '');

    await draw(app, ['d']);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        dock: { pulse: app.querySelector(':scope > .picker .item[data-seat="0"] .swatch') },
        overSheet: false,
      },
    ]);
  });
});

describe('a table card taken back into the hand in dock mode', () => {
  /** The table before and after table card t went back to seat 0's hand. */
  const BEFORE = table([card('t', { x: 10, y: 10 })], { p0: [] });
  const AFTER = table([card('t', { zone: 'hand' })], { p0: ['t'] });
  const TAKEN: Anim[] = [
    {
      kind: 'move',
      id: 't',
      from: { zone: 'table', x: 10, y: 10 },
      to: { zone: 'hand', x: 0, y: 0 },
    },
  ];

  /** The page with card t on the surface, at a table card's box. */
  function withCard(dock = true): HTMLElement {
    const app = page(dock);
    const placed = box('card', { left: 40, top: 40, width: 67, height: 94 });
    placed.dataset.id = 't';
    app.querySelector('.surface')!.append(placed);
    return app;
  }

  /** Plays the view: the card leaves the surface as the new view is drawn. */
  async function takeBack(app: HTMLElement, anims: Anim[] = TAKEN): Promise<void> {
    const animating = motion.animate(app, anims, { before: BEFORE, after: AFTER }, ZOOM);
    app.querySelector('.surface [data-id="t"]')?.remove();
    await animating;
  }

  it('flies face up from its spot on the table to the dock, hidden from the counts till it lands', async () => {
    const app = withCard();
    const button = dockBar(app, 0, ['t']);

    await takeBack(app);

    expect(motion.flights).toMatchObject([
      {
        kind: 'draw',
        card: { id: 't', zone: 'hand' },
        faceUp: true,
        from: { cx: 73.5, cy: 87, w: 67, h: 94 },
        to: { cx: 81, cy: 729.5, w: 22, h: 31 },
        dock: { fades: false, pulse: button.querySelector('.avatar') },
      },
    ]);
    expect(motion.drawing.has('t')).toBe(true);
  });

  it('leaves on its back when it lay face down, turning face up on its way', async () => {
    // Face down on the table, it has an id of its own there: it gets a new one in the hand.
    const before = table([card('old', { code: undefined, faceDown: true, x: 10, y: 10 })], {
      p0: [],
    });
    const after = table([card('t', { zone: 'hand' })], { p0: ['t'] });
    const anims = diffViews(playingView({ table: before }), playingView({ table: after }));
    expect(anims).toContainEqual(expect.objectContaining({ kind: 'move', id: 't', was: 'old' }));
    const app = page();
    const placed = box('card', { left: 40, top: 40, width: 67, height: 94 });
    placed.dataset.id = 'old';
    app.querySelector('.surface')!.append(placed);
    dockBar(app, 0, ['t']);

    const animating = motion.animate(app, anims, { before, after }, ZOOM);
    placed.remove();
    await animating;

    expect(motion.flights).toMatchObject([
      { kind: 'draw', card: { id: 't' }, faceUp: false, from: { cx: 73.5, cy: 87 } },
    ]);
  });

  it('slides into its carousel slot as before when the open hand sheet shows its hand', async () => {
    const app = withCard();
    dockBar(app, 0, ['t']);
    const animating = motion.animate(app, TAKEN, { before: BEFORE, after: AFTER }, ZOOM);
    app.querySelector('.surface [data-id="t"]')?.remove();
    handSheet(app, ['t']);
    await animating;

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.size).toBe(0);
    expect(animationsOf('.hcard[data-id="t"]')).not.toEqual([]);
  });

  it('flies to the dock when the hand sheet showing its hand is sliding away', async () => {
    const app = withCard();
    dockBar(app, 0, ['t']);
    const animating = motion.animate(app, TAKEN, { before: BEFORE, after: AFTER }, ZOOM);
    app.querySelector('.surface [data-id="t"]')?.remove();
    handSheet(app, ['t']).setAttribute('inert', '');
    await animating;

    expect(motion.flights).toMatchObject([{ kind: 'draw', card: { id: 't' }, overSheet: false }]);
    expect(motion.drawing.has('t')).toBe(true);
  });

  it("does not fly for the viewer's own drop on the dock", async () => {
    const app = withCard();
    dockBar(app, 0, ['t']);

    await takeBack(app, [{ ...TAKEN[0], dropped: true } as Anim]);

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.size).toBe(0);
  });

  it('plays nothing out of dock mode, with no hand card to slide to', async () => {
    const app = withCard(false);
    dockBar(app, 0, ['t']);

    await takeBack(app);

    expect(motion.flights).toEqual([]);
    expect(motion.drawing.size).toBe(0);
  });
});
