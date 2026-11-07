// A card discarded or played from the viewer's hand in dock mode (spec 5.5): the hand is not
// drawn on the table, so the card does not fly across it. Where the viewer saw it (the hand sheet's
// carousel, or else the dock's hand button), a copy rises and fades out; the pile
// shows a discarded card at once.
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Flights from './Flights.svelte';
import flightsSource from './Flights.svelte?raw';
import sheetSource from '../components/Sheet.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { DOCK_SCALE } from './dockPiles';
import { PORTRAIT_CARD } from './layout';
import { LIFT_SCALE, LIFT_SHADE, motion } from './motion.svelte';
import type { Anim } from './animate';
import { unknownTopId } from './drag';
import type { CardView, PileView, TableView } from '../lib/types';
import { card } from './fixtures.testing';

const reducedMotion = vi.hoisted(() => ({ on: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return reducedMotion.on;
    },
  },
}));

const DISCARD: PileView = {
  id: 'disc:p0',
  kind: 'discard',
  owner: 0,
  x: 0,
  y: 0,
  count: 0,
  cards: [],
};
const DECK: PileView = { id: 'deck:p0', kind: 'deck', owner: 0, x: 0, y: 0, count: 30 };
const ZOOM = 0.8;

function table(cards: CardView[], piles: PileView[]): TableView {
  return { cards, piles, stages: [] } as unknown as TableView;
}

/** The table before and after the viewer discarded hand card a. */
const BEFORE = table([card('a', { zone: 'hand' })], [DECK, DISCARD]);
const AFTER = table([card('a', { zone: 'pile' })], [DECK, { ...DISCARD, count: 1, cards: ['a'] }]);
const DISCARDED: Anim[] = [{ kind: 'fly', id: 'a', toPile: 'disc:p0' }];

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

/** The table screen: its surface with the discard pile, the dock and its hand button. */
function page(dock: boolean): HTMLElement {
  const app = document.createElement('div');
  app.className = dock ? 'app dock-mode' : 'app';
  const surface = box('surface', { left: 0, top: 0, width: 400, height: 400 });
  const pile = box('card pile', { left: 300, top: 20, width: 67, height: 94 });
  pile.dataset.id = 'disc:p0';
  surface.append(pile);
  const dockBar = box('dock', { left: 0, top: 700, width: 390, height: 80 });
  dockBar.append(box('handbtn', { left: 20, top: 710, width: 120, height: 60 }));
  app.append(surface, dockBar);
  document.body.append(app);
  return app;
}

/** The hand sheet open, its carousel showing card a. */
function handSheet(app: HTMLElement): void {
  const hand = document.createElement('ul');
  hand.className = 'hand';
  hand.dataset.seat = '0';
  const item = box('hcard', { left: 70, top: 200, width: 250, height: 350 });
  item.dataset.id = 'a';
  hand.append(item);
  app.append(hand);
}

/** The inspector open on a table card, which never shows a hand card. */
function inspector(app: HTMLElement): void {
  const content = document.createElement('div');
  content.className = 'inspector dock';
  content.append(box('face', { left: 100, top: 60, width: 190, height: 266 }));
  app.append(content);
}

function fakeRect(this: HTMLElement): DOMRect {
  const left = Number.parseFloat(this.style.left) || 0;
  const top = Number.parseFloat(this.style.top) || 0;
  const width = Number.parseFloat(this.style.width) || 0;
  const height = Number.parseFloat(this.style.height) || 0;
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

/** A Web Animation that never ends unless cancelled. */
const animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn() }));

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
  motion.stop();
  motion.flights = [];
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function discard(app: HTMLElement): Promise<void> {
  await motion.animate(app, DISCARDED, { before: BEFORE, after: AFTER }, ZOOM);
}

describe('a card discarded from the hand in dock mode', () => {
  it('rises and fades out from the hand sheet card showing it, not flying to the pile', async () => {
    const app = page(true);
    handSheet(app);

    await discard(app);

    expect(motion.flights).toMatchObject([
      {
        kind: 'rise',
        card: { id: 'a' },
        from: { cx: 195, cy: 375, w: 250, h: 350 },
        zoomed: false,
        delay: 0,
      },
    ]);
    // The pile shows the card and its new count at once: nothing lands on it.
    expect(motion.flying.has('a')).toBe(false);
    expect(motion.isHushed('disc:p0')).toBe(false);
  });

  it("rises from the dock's hand button, not from a table card's inspector left open", async () => {
    const app = page(true);
    inspector(app);

    await discard(app);

    expect(motion.flights).toMatchObject([{ kind: 'rise', zoomed: true }]);
  });

  it("rises from the dock's hand button, as a card the table draws, with no hand sheet open", async () => {
    const app = page(true);

    await discard(app);

    expect(motion.flights).toMatchObject([
      {
        kind: 'rise',
        from: {
          cx: 80,
          cy: 740,
          w: PORTRAIT_CARD.w * DOCK_SCALE * ZOOM,
          h: PORTRAIT_CARD.h * DOCK_SCALE * ZOOM,
        },
        zoomed: true,
      },
    ]);
  });

  it("rises from the hand sheet when it goes to its side deck's discard pile", async () => {
    // Invocation's side deck has a discard pile of its own: Discard sends its cards there.
    const app = page(true);
    handSheet(app);
    const sideDiscard: PileView = { ...DISCARD, id: 'sided:p0:0', kind: 'sideDiscard' };
    const before = table([card('a', { zone: 'hand' })], [DECK, DISCARD, sideDiscard]);
    const after = table(
      [card('a', { zone: 'pile' })],
      [DECK, DISCARD, { ...sideDiscard, count: 1, cards: ['a'] }],
    );

    await motion.animate(
      app,
      [{ kind: 'fly', id: 'a', toPile: 'sided:p0:0' }],
      { before, after },
      ZOOM,
    );

    expect(motion.flights).toMatchObject([{ kind: 'rise', card: { id: 'a' }, zoomed: false }]);
    expect(motion.flying.has('a')).toBe(false);
  });

  it('several cards discarded together rise one after the other', async () => {
    const app = page(true);
    const before = table([card('a', { zone: 'hand' }), card('b', { zone: 'hand' })], [DISCARD]);
    const after = table(
      [card('a', { zone: 'pile' }), card('b', { zone: 'pile' })],
      [{ ...DISCARD, count: 2, cards: ['a', 'b'] }],
    );
    const anims: Anim[] = [
      { kind: 'fly', id: 'a', toPile: 'disc:p0' },
      { kind: 'fly', id: 'b', toPile: 'disc:p0' },
    ];

    await motion.animate(app, anims, { before, after }, ZOOM);

    expect(motion.flights.map((flight) => [flight.kind, flight.delay])).toEqual([
      ['rise', 0],
      ['rise', 70],
    ]);
  });

  it('a hand card put on a deck flies there as before', async () => {
    const app = page(true);
    const deck = box('card pile', { left: 200, top: 20, width: 67, height: 94 });
    deck.dataset.id = 'deck:p0';
    app.querySelector('.surface')!.append(deck);
    handSheet(app);
    const after = table([card('a', { zone: 'pile', faceDown: true })], [DECK, DISCARD]);

    await motion.animate(
      app,
      [{ kind: 'fly', id: 'a', toPile: 'deck:p0', turns: 'down' }],
      { before: BEFORE, after },
      ZOOM,
    );

    expect(motion.flights).toMatchObject([{ kind: 'toPile', pile: 'deck:p0' }]);
  });

  it("the viewer's own drop on the discard pile flies from where it was let go", async () => {
    const app = page(true);
    const layer = document.createElement('div');
    layer.className = 'draglayer';
    const ghost = box('card ghost landed', { left: 280, top: 40, width: 67, height: 94 });
    ghost.dataset.id = 'a';
    layer.append(ghost);
    app.append(layer);

    await motion.animate(
      app,
      [{ kind: 'fly', id: 'a', toPile: 'disc:p0', dropped: true }],
      { before: BEFORE, after: AFTER },
      ZOOM,
    );

    expect(motion.flights).toMatchObject([{ kind: 'toPile', pile: 'disc:p0' }]);
  });

  it('plays nothing under reduced motion', async () => {
    const app = page(true);
    handSheet(app);
    reducedMotion.on = true;
    try {
      await discard(app);
    } finally {
      reducedMotion.on = false;
    }

    expect(motion.flights).toEqual([]);
  });
});

describe('a card discarded from the hand out of dock mode', () => {
  it('flies from its place in the hand to the pile', async () => {
    const app = page(false);
    handSheet(app);

    await discard(app);

    expect(motion.flights).toMatchObject([{ kind: 'toPile', pile: 'disc:p0' }]);
    expect(motion.flying.has('a')).toBe(true);
  });
});

// A card played from the viewer's hand in dock mode rises and fades out where the viewer saw it, as
// a discarded one does; the table plays its own part where the card lands, as it did before.
describe('a card played from the hand in dock mode', () => {
  /** The table after the viewer played hand card a onto the table. */
  const PLAYED = table([card('a', { zone: 'table', x: 10, y: 10 })], [DECK, DISCARD]);
  const PLAYS: Anim[] = [
    {
      kind: 'move',
      id: 'a',
      from: { zone: 'hand', x: 0, y: 0 },
      to: { zone: 'table', x: 10, y: 10 },
    },
  ];

  /**
   * Plays the view in which the viewer played hand card a: the card is drawn at its spot on the
   * surface once measured where it showed before, as the new view draws it. Returns that card.
   */
  async function play(app: HTMLElement, anims: Anim[] = PLAYS): Promise<HTMLElement> {
    const animating = motion.animate(app, anims, { before: BEFORE, after: PLAYED }, ZOOM);
    const placed = box('card', { left: 20, top: 20, width: 67, height: 94 });
    placed.dataset.id = 'a';
    app.querySelector('.surface')!.append(placed);
    await animating;
    return placed;
  }

  it('rises and fades out from the hand sheet card showing it', async () => {
    const app = page(true);
    handSheet(app);

    const placed = await play(app);

    expect(motion.flights).toMatchObject([
      {
        kind: 'rise',
        card: { id: 'a', zone: 'hand' },
        from: { cx: 195, cy: 375, w: 250, h: 350 },
        zoomed: false,
        delay: 0,
      },
    ]);
    // The table still slides the card to its spot from where it showed, under the sheet.
    expect(animate.mock.contexts).toContain(placed);
  });

  it("rises from the dock's hand button, as a card the table draws, with no hand sheet open", async () => {
    const app = page(true);

    await play(app);

    expect(motion.flights).toMatchObject([
      {
        kind: 'rise',
        from: {
          cx: 80,
          cy: 740,
          w: PORTRAIT_CARD.w * DOCK_SCALE * ZOOM,
          h: PORTRAIT_CARD.h * DOCK_SCALE * ZOOM,
        },
        zoomed: true,
      },
    ]);
  });

  it("the viewer's own drop on the table slides from where it was let go, with no rising copy", async () => {
    const app = page(true);
    const layer = document.createElement('div');
    layer.className = 'draglayer';
    const ghost = box('card ghost landed', { left: 150, top: 300, width: 67, height: 94 });
    ghost.dataset.id = 'a';
    layer.append(ghost);
    app.append(layer);

    const placed = await play(app, [{ ...PLAYS[0], dropped: true } as Anim]);

    expect(motion.flights).toEqual([]);
    expect(animate.mock.contexts).toContain(placed);
  });

  it('a card moved on the table does not rise', async () => {
    const app = page(true);
    const before = table([card('a', { zone: 'table' })], [DECK, DISCARD]);

    await motion.animate(
      app,
      [
        {
          kind: 'move',
          id: 'a',
          from: { zone: 'table', x: 0, y: 0 },
          to: { zone: 'table', x: 10, y: 10 },
        },
      ],
      { before, after: PLAYED },
      ZOOM,
    );

    expect(motion.flights).toEqual([]);
  });

  it('plays nothing under reduced motion', async () => {
    const app = page(true);
    handSheet(app);
    reducedMotion.on = true;
    try {
      await play(app);
    } finally {
      reducedMotion.on = false;
    }

    expect(motion.flights).toEqual([]);
    expect(animate).not.toHaveBeenCalled();
  });

  it('out of dock mode, only slides from its place in the hand', async () => {
    const app = page(false);
    handSheet(app);

    const placed = await play(app);

    expect(motion.flights).toEqual([]);
    expect(animate.mock.contexts).toContain(placed);
  });
});

// The viewer's own drop in dock mode (settles): its ghost stays where it was let go, the flow draws
// the card in its slot, and the card slides there from its ghost and settles, as one motion.
describe("the viewer's own drop slid into its slot in dock mode", () => {
  /** The table before and after the viewer dropped table card a: the flow draws it elsewhere. */
  const LAY = table([card('a', { zone: 'table', x: 0, y: 0 })], [DECK, DISCARD]);
  const LAID = table([card('a', { zone: 'table', x: 10, y: 10 })], [DECK, DISCARD]);
  const LANDS: Anim = {
    kind: 'move',
    id: 'a',
    from: { zone: 'table', x: 0, y: 0 },
    to: { zone: 'table', x: 10, y: 10 },
    dropped: true,
    settles: true,
  };
  // The slide (250 ms) and the settle (220 ms), which starts half way through the slide: 345 ms.
  const DURATION = 345;
  const SLID = 250 / DURATION;
  const SETTLES = 125 / DURATION;
  const DIPS = (125 + 0.55 * 220) / DURATION;

  /** The viewer's ghost of a card, landed where it was let go, swayed to that angle. */
  function landedGhost(app: HTMLElement, id: string, at: { left: number; top: number }, lean = 0) {
    const layer = document.createElement('div');
    layer.className = 'draglayer';
    const ghost = box('card ghost landed', { ...at, width: 67, height: 94 });
    ghost.dataset.id = id;
    if (lean !== 0) {
      ghost.style.rotate = `${lean}deg`;
    }
    layer.append(ghost);
    app.append(layer);
  }

  /**
   * Plays the view that lays card a in its slot: on the table before, it lies at (0, 200), and the
   * new view draws it, with its shade, at (20, 20) once measured where it showed before. Returns
   * that card.
   */
  async function lay(
    app: HTMLElement,
    anims: Anim[] = [LANDS],
    tables = { before: LAY, after: LAID },
  ): Promise<HTMLElement> {
    const placed = box('card', { left: 0, top: 200, width: 67, height: 94 });
    placed.dataset.id = 'a';
    const shade = document.createElement('div');
    shade.className = 'shade';
    placed.append(shade);
    const surface = app.querySelector('.surface')!;
    const onTable = tables.before.cards.some((c) => c.id === 'a' && c.zone === 'table');
    if (onTable) {
      surface.append(placed);
    }
    const animating = motion.animate(app, anims, tables, ZOOM);
    placed.style.left = '20px';
    placed.style.top = '20px';
    surface.append(placed);
    await animating;
    return placed;
  }

  /** The keyframes and options of each animation played on an element, in the order they started. */
  function playedOn(element: Element): [Keyframe[], KeyframeAnimationOptions][] {
    const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
    return calls.filter((_, i) => animate.mock.contexts[i] === element);
  }

  /** The animation played on an element on that property, if any. */
  function onProperty(element: Element, property: string) {
    return playedOn(element).find(([keyframes]) => property in keyframes[0]!);
  }

  // The ghost's middle (183.5, 347) from the slot's (53.5, 67), in table units at 80 %.
  it('slides from its ghost to its slot over the first 250 ms', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 });

    const placed = await lay(app);

    expect(onProperty(placed, 'translate')).toEqual([
      [
        { translate: '162.5px 350px', easing: 'cubic-bezier(.2, .8, .2, 1)' },
        { translate: '0px 0px', offset: expect.closeTo(SLID, 6) },
        { translate: '0px 0px' },
      ],
      { duration: DURATION },
    ]);
  });

  it('comes down from its lift half way through the slide, dipping before it rests', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 });

    const placed = await lay(app);

    expect(onProperty(placed, 'scale')).toEqual([
      [
        { scale: `${LIFT_SCALE}` },
        { scale: `${LIFT_SCALE}`, offset: expect.closeTo(SETTLES, 6), easing: 'ease-in' },
        { scale: '0.98', offset: expect.closeTo(DIPS, 6), easing: 'ease-out' },
        { scale: '1' },
      ],
      { duration: DURATION },
    ]);
  });

  it('brings its shadow back under it as it comes down', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 });

    const placed = await lay(app);

    expect(playedOn(placed.querySelector('.shade')!)).toEqual([
      [
        [
          { translate: LIFT_SHADE },
          { translate: LIFT_SHADE, offset: expect.closeTo(SETTLES, 6), easing: 'ease-in' },
          { translate: '0px 0px', offset: expect.closeTo(DIPS, 6) },
          { translate: '0px 0px' },
        ],
        { duration: DURATION },
      ],
    ]);
  });

  it('comes upright from the angle its ghost swayed to as it slides', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 }, 4);

    const placed = await lay(app);

    expect(onProperty(placed, 'rotate')).toEqual([
      [
        { rotate: '4deg', easing: 'ease-out' },
        { rotate: '0deg', offset: expect.closeTo(SLID, 6) },
        { rotate: '0deg' },
      ],
      { duration: DURATION },
    ]);
  });

  it('turns nothing for a ghost held upright', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 });

    const placed = await lay(app);

    expect(onProperty(placed, 'rotate')).toBeUndefined();
  });

  it('leans from nothing when it tilts in the same view, the tilt alone turning it', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 }, 4);

    const placed = await lay(app, [LANDS, { kind: 'tilt', id: 'a', exhausted: true }]);

    const turns = playedOn(placed).filter(([keyframes]) => 'rotate' in keyframes[0]!);
    expect(turns).toHaveLength(1);
    expect(turns[0]![1]).toMatchObject({ duration: 180 });
  });

  it('still settles when its slot lies under its ghost', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 20, top: 20 });

    const placed = await lay(app);

    expect(onProperty(placed, 'translate')?.[0][0]).toMatchObject({ translate: '0px 0px' });
    expect(onProperty(placed, 'scale')?.[0][0]).toEqual({ scale: `${LIFT_SCALE}` });
  });

  it("enters out of a deck from its unknown top card's ghost, the same way", async () => {
    const app = page(true);
    landedGhost(app, unknownTopId(DECK), { left: 150, top: 300 }, -3);
    const before = table([], [DECK, DISCARD]);
    const enters: Anim = {
      kind: 'enter',
      id: 'a',
      fromPile: 'deck:p0',
      dropped: true,
      settles: true,
    };

    const placed = await lay(app, [enters], { before, after: LAID });

    expect(onProperty(placed, 'translate')?.[0][0]).toEqual({
      translate: '162.5px 350px',
      easing: 'cubic-bezier(.2, .8, .2, 1)',
    });
    expect(onProperty(placed, 'scale')?.[1]).toEqual({ duration: DURATION });
    expect(onProperty(placed, 'rotate')?.[0][0]).toEqual({ rotate: '-3deg', easing: 'ease-out' });
  });

  it('plays nothing under reduced motion', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 }, 4);
    reducedMotion.on = true;
    try {
      await lay(app);
    } finally {
      reducedMotion.on = false;
    }

    expect(animate).not.toHaveBeenCalled();
  });

  it('slides an own drop that does not settle plainly, from its ghost', async () => {
    const app = page(true);
    landedGhost(app, 'a', { left: 150, top: 300 }, 4);

    const placed = await lay(app, [{ ...LANDS, settles: undefined }]);

    expect(playedOn(placed)).toEqual([
      [
        [
          { translate: '162.5px 350px', scale: `${LIFT_SCALE}` },
          { translate: '0px 0px', scale: '1' },
        ],
        { duration: 250, easing: 'cubic-bezier(.2, .8, .2, 1)' },
      ],
    ]);
  });
});

describe("a rising copy's animation", () => {
  it('rises 120 px and fades out over 300 ms, easing out, held up', async () => {
    const app = page(true);
    handSheet(app);
    render(Flights, {
      target: app,
      props: { faceOf: () => null, captionOf: () => undefined },
      context: new Map([[DOCK_MODE_KEY, { current: true }]]),
    });

    await discard(app);
    await tick();

    const copy = app.querySelector<HTMLElement>('.fly')!;
    // Its box is the hand sheet card's, drawn at that size: what it shows is not zoomed.
    expect(copy.style.width).toBe('250px');
    expect(copy.classList).not.toContain('scaled');
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: 'translateY(0)', scale: `${LIFT_SCALE}`, opacity: 1 },
        { transform: 'translateY(-120px)', scale: `${LIFT_SCALE}`, opacity: 0 },
      ],
      expect.objectContaining({ duration: 300, easing: 'ease-out', delay: 0, fill: 'both' }),
    );
  });

  it("is zoomed as the table draws it when it starts on the dock's hand button", async () => {
    const app = page(true);
    render(Flights, {
      target: app,
      props: { faceOf: () => null, captionOf: () => undefined },
      context: new Map([[DOCK_MODE_KEY, { current: true }]]),
    });

    await discard(app);
    await tick();

    expect(app.querySelector('.fly')?.classList).toContain('scaled');
  });

  it('shows over the sheet it rises out of', async () => {
    const app = page(true);
    handSheet(app);
    render(Flights, {
      target: app,
      props: { faceOf: () => null, captionOf: () => undefined },
      context: new Map([[DOCK_MODE_KEY, { current: true }]]),
    });

    await discard(app);
    await tick();

    expect(app.querySelector('.fly')?.classList).toContain('rise');
    const zIndex = (source: string, selector: string) =>
      Number(new RegExp(`\\n {2}${selector} \\{[^}]*z-index: (\\d+);`).exec(source)?.[1]);
    const rule = '\\.fly\\.rise,\\s*\\.fly\\.over';
    expect(zIndex(flightsSource, rule)).toBeGreaterThan(zIndex(sheetSource, '\\.sheet'));
  });
});
