import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import Table from './Table.svelte';
import { DECK_TOP_ID } from './drag';
import { interaction, LINGER_MS } from './interaction.svelte';
import { LIFT_SCALE, motion } from './motion.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Area,
  CardView as TableCard,
  LogView,
  PileView,
  Point,
  PresenceState,
  Size,
  Stage,
  View,
} from '../lib/types';
import { card, fakeSession, infoFrom, playingView, seated } from './fixtures.testing';

// Whether the viewer prefers reduced motion: withReducedMotion turns it on.
const reducedMotion = vi.hoisted(() => ({ on: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return reducedMotion.on;
    },
  },
}));

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

/** A side scheme: a landscape card. */
const SIDE_SCHEME = '01107';

function infoOf(code: string): CardInfo {
  const size: Size = code === SIDE_SCHEME ? 'land' : 'std';
  const face = { name: 'Spider-Man', type: 'hero', size, images: [`${code}.png`] };
  return { card: { code, faces: [face], back: 'player', quantity: 1 }, face: 0 };
}

const PILES: PileView[] = [
  { id: 'deck:p1', kind: 'deck', owner: 1, x: 600, y: 0, count: 30 },
  { id: 'disc:p0', kind: 'discard', owner: 0, x: 720, y: 0, count: 0, cards: [] },
];

const START: LogView = {
  who: 'Alex',
  color: 0,
  text: 'started the game',
  at: '2026-10-19T14:00:00Z',
};

function line(text: string, extra: Partial<LogView> = {}): LogView {
  return { who: 'Alex', color: 0, text, at: '2026-10-19T14:05:00Z', ...extra };
}

/** Alex (colour 0, seat 0) and the viewer Sam (colour 1, seat 1). */
function makeView(
  cards: TableCard[],
  extra: {
    piles?: PileView[];
    log?: LogView[];
    stages?: Stage[];
    firstPlayer?: Point;
    active?: Point;
    hands?: Partial<Record<Area, string[]>>;
    /** How many cards Alex and Sam hold. */
    handCounts?: [number, number];
  } = {},
): View {
  const [alexHand, samHand] = extra.handCounts ?? [5, 5];
  return playingView({
    you: { role: 'player', name: 'Sam', color: 1, host: false, areas: ['p1'] },
    players: [
      seated('Alex', 0, [{ area: 'p0', handCount: alexHand }], true),
      seated('Sam', 1, [{ area: 'p1', handCount: samHand }]),
    ],
    table: {
      cards,
      piles: extra.piles ?? PILES,
      stages: extra.stages ?? [],
      firstPlayer: extra.firstPlayer ?? { x: 860, y: 40 },
      ...(extra.active && { active: extra.active }),
      ...(extra.hands && { hands: extra.hands }),
    },
    log: extra.log ?? [START],
  });
}

/**
 * A Web Animation as the stub below starts it: it never ends unless cancelled, or finished by a test.
 * Cancelled, its finished promise rejects, as the browser's does.
 */
interface FakeAnimation {
  element: Element;
  keyframes: Keyframe[];
  cancel: ReturnType<typeof vi.fn>;
  cancelled: boolean;
  finish: () => void;
  finished: Promise<void>;
  /** Its keyframes changed while it plays. */
  effect: { setKeyframes: ReturnType<typeof vi.fn> };
}

let started: FakeAnimation[] = [];

const animate = vi.fn(function (this: Element, keyframes: Keyframe[]) {
  let finish = () => {};
  let abort = () => {};
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    abort = () => reject(new DOMException('The animation was cancelled', 'AbortError'));
  });
  const animation: FakeAnimation = {
    element: this,
    keyframes,
    cancelled: false,
    cancel: vi.fn(() => {
      animation.cancelled = true;
      abort();
    }),
    finish,
    finished,
    effect: {
      setKeyframes: vi.fn((frames: Keyframe[]) => {
        animation.keyframes = frames;
      }),
    },
  };
  started.push(animation);
  return animation;
});

/** The animations still running on an element. */
function runningOn(element: Element): FakeAnimation[] {
  return started.filter((animation) => animation.element === element && !animation.cancelled);
}

/**
 * jsdom lays nothing out: elements are placed from their own left and top, then their translate,
 * as a drag ghost is (CardView). A card moving (FLIP) shows half-way.
 */
function fakeRect(this: HTMLElement): DOMRect {
  const [placedX = 0, placedY = 0] = this.style.translate
    .split(' ')
    .map((v) => Number.parseFloat(v) || 0);
  const offset = { x: placedX, y: placedY };
  for (const animation of runningOn(this)) {
    const translate = animation.keyframes[0]?.translate;
    if (typeof translate === 'string') {
      const [x = 0, y = 0] = translate.split(' ').map((v) => Number.parseFloat(v));
      offset.x += x / 2;
      offset.y += y / 2;
    }
  }
  const left = (Number.parseFloat(this.style.left) || 0) + offset.x;
  const top = (Number.parseFloat(this.style.top) || 0) + offset.y;
  const width = Number.parseFloat(this.style.width) || 0;
  const height = Number.parseFloat(this.style.height) || 0;
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  } as DOMRect;
}

let originals: {
  animate: typeof Element.prototype.animate;
  rect: typeof HTMLElement.prototype.getBoundingClientRect;
};

beforeEach(() => {
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  originals = {
    animate: Element.prototype.animate,
    rect: HTMLElement.prototype.getBoundingClientRect,
  };
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  HTMLElement.prototype.getBoundingClientRect = fakeRect;
  document.documentElement.style.setProperty('--p1', '#4f9dff');
});

afterEach(() => {
  Element.prototype.animate = originals.animate;
  HTMLElement.prototype.getBoundingClientRect = originals.rect;
  document.documentElement.style.removeProperty('--p1');
  animate.mockClear();
  started = [];
  motion.stop();
  interaction.reset();
});

/** The animations started on the elements matching selector, as [keyframes, options]. */
function animationsOf(selector: string): [Keyframe[], KeyframeAnimationOptions][] {
  return animate.mock.calls.flatMap((call, i) => {
    const element = animate.mock.contexts[i] as Element;
    return element.matches(selector)
      ? [call as unknown as [Keyframe[], KeyframeAnimationOptions]]
      : [];
  });
}

/** The recorded animations of the elements matching selector that play on their opacity. */
function fadesOf(selector: string): [Keyframe[], KeyframeAnimationOptions][] {
  return animationsOf(selector).filter(([keyframes]) =>
    keyframes.some((keyframe) => keyframe.opacity !== undefined),
  );
}

/** A copy flying to an out-of-play pile's chip fades out into it on the last part of its way. */
function expectFadesIntoChip(): void {
  const [[, way]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
  const fades = fadesOf('.fly');
  expect(fades).toHaveLength(1);
  const [[fade, fadeOptions]] = fades as [[Keyframe[], KeyframeAnimationOptions]];
  expect(fade).toEqual([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }]);
  expect(fadeOptions).toMatchObject({
    duration: way.duration,
    delay: way.delay,
    fill: way.fill,
    easing: 'linear',
  });
}

/** The delays of a pile's bounces: its own animations that scale it, not its lift over its neighbours. */
function bounceDelays(id: string): (number | undefined)[] {
  return animationsOf(`.surface .pile[data-id="${id}"]`)
    .filter(([keyframes]) => keyframes[0]?.transform !== undefined)
    .map(([, options]) => options.delay);
}

async function settle(): Promise<void> {
  await tick();
  await tick();
}

/** Runs a test as with the system setting to reduce motion. */
async function withReducedMotion(run: () => Promise<void>): Promise<void> {
  reducedMotion.on = true;
  try {
    await run();
  } finally {
    reducedMotion.on = false;
  }
}

describe('Table animations', () => {
  it("another player's move slides the card from where it was", async () => {
    const session = fakeSession();
    const { rerender } = render(Table, {
      session,
      view: makeView([card('a', { x: 0 })]),
    });
    await settle();

    await rerender({ session, view: makeView([card('a', { x: 200, y: 20 })]) });
    await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).toHaveLength(1));
    const [[keyframes, options]] = animationsOf('.surface .card[data-id="a"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes[0]).toMatchObject({ translate: '-200px -20px' });
    expect(keyframes[1]).toMatchObject({ translate: '0px 0px' });
    expect(options.duration).toBe(250);
  });

  it("another player's drop slides the card from where they let it go, never from its old place", async () => {
    const session = { ...fakeSession(), presence: new SvelteMap<number, PresenceState>() };
    const { rerender } = render(Table, { session, view: makeView([card('a', { x: 0 })]) });
    await settle();
    const ghost = () => document.querySelector<HTMLElement>('.presence .card.ghost[data-id="a"]');
    const placedA = () => document.querySelector<HTMLElement>('.surface .card[data-id="a"]')!;

    // Alex drags it to 150, 20, then lets go: its ghost stays there, the card hidden in its place.
    session.presence.set(0, {
      color: 0,
      name: 'Alex',
      at: Date.now(),
      drag: { cards: ['a'], x: 150, y: 20 },
    });
    await waitFor(() => expect(ghost()).not.toBeNull());
    session.presence.set(0, { color: 0, name: 'Alex', at: Date.now(), drag: null });
    await settle();
    expect(ghost()).not.toBeNull();
    expect(placedA().classList).toContain('lifted');

    // The view puts it on the grid at 200, 20: it slides there from the ghost, and shows.
    await rerender({ session, view: makeView([card('a', { x: 200, y: 20 })]) });
    await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).toHaveLength(1));
    const [[keyframes]] = animationsOf('.surface .card[data-id="a"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes[0]).toMatchObject({ translate: '-50px 0px' });
    expect(ghost()).toBeNull();
    expect(placedA().classList).not.toContain('lifted');
  });

  it("another player's move of the first player token slides it from where it was", async () => {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();

    await rerender({ session, view: makeView([], { firstPlayer: { x: 160, y: 200 } }) });
    await waitFor(() => expect(animationsOf('.surface .marker')).toHaveLength(1));
    const [[keyframes, options]] = animationsOf('.surface .marker') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes[0]).toMatchObject({ translate: '700px -160px' });
    expect(keyframes[1]).toMatchObject({ translate: '0px 0px' });
    expect(options.duration).toBe(250);
  });

  it('another viewer sees the active counter slide', async () => {
    const session = fakeSession();
    const { rerender } = render(Table, {
      session,
      view: makeView([], { active: { x: 860, y: 240 } }),
    });
    await settle();
    const counter = '.surface .marker[data-marker="active"]';

    await rerender({ session, view: makeView([], { active: { x: 160, y: 240 } }) });
    await waitFor(() => expect(animationsOf(counter)).toHaveLength(1));
    const [[keyframes]] = animationsOf(counter) as [[Keyframe[], KeyframeAnimationOptions]];
    expect(keyframes[0]).toMatchObject({ translate: '700px 0px' });
    // The first player token stayed.
    expect(animationsOf('.surface .marker[data-marker="firstPlayer"]')).toEqual([]);
  });

  it("the viewer's own drop of the first player token does not move again", async () => {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();
    interaction.land({
      action: 1,
      element: { kind: 'marker', name: 'firstPlayer' },
      card: null,
      lifted: [],
      handOrder: null,
    });

    await rerender({ session, view: makeView([], { firstPlayer: { x: 160, y: 240 } }) });
    await settle();
    expect(animationsOf('.surface .marker')).toEqual([]);
  });

  it("another player's drag of the first player token shows it under their pointer", async () => {
    const session = { ...fakeSession(), presence: new SvelteMap<number, PresenceState>() };
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();
    const ghost = () => document.querySelector<HTMLElement>('.presence .marker.ghost');
    const placedToken = () => document.querySelector<HTMLElement>('.surface .marker')!;
    const dragTo = (x: number) => ({ cards: [], token: 'firstPlayer' as const, x, y: 40 });

    session.presence.set(0, { color: 0, name: 'Alex', at: Date.now(), drag: dragTo(400) });
    await waitFor(() => expect(ghost()?.style.left).toBe('400px'));
    expect(placedToken().classList).toContain('lifted');
    session.presence.set(0, { color: 0, name: 'Alex', at: Date.now(), drag: dragTo(150) });
    await waitFor(() => expect(ghost()?.style.left).toBe('150px'));

    // Let go: the ghost stays where it was dropped until the view moves the token.
    session.presence.set(0, { color: 0, name: 'Alex', at: Date.now(), drag: null });
    await settle();
    expect(ghost()).not.toBeNull();

    // It slides the last few pixels onto the grid, never again from its old place.
    await rerender({ session, view: makeView([], { firstPlayer: { x: 160, y: 40 } }) });
    await waitFor(() => expect(animationsOf('.surface .marker')).toHaveLength(1));
    const [[keyframes]] = animationsOf('.surface .marker') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes[0]).toMatchObject({ translate: '-10px 0px' });
    expect(ghost()).toBeNull();
    expect(placedToken().classList).not.toContain('lifted');
  });

  it('a lost player takes their drag of the first player token along', async () => {
    const session = { ...fakeSession(), presence: new SvelteMap<number, PresenceState>() };
    render(Table, { session, view: makeView([]) });
    await settle();
    const ghost = () => document.querySelector<HTMLElement>('.presence .marker.ghost');

    session.presence.set(0, {
      color: 0,
      name: 'Alex',
      at: Date.now(),
      drag: { cards: [], token: 'firstPlayer', x: 400, y: 40 },
    });
    await waitFor(() => expect(ghost()).not.toBeNull());
    session.presence.delete(0);
    await waitFor(() => expect(ghost()).toBeNull());
    expect(document.querySelector('.surface .marker')?.classList).not.toContain('lifted');
  });

  describe('the frame counter', () => {
    /** Cards a and b, a at that x, with an arrow from a to b when asked. */
    function arrowView(x: number, arrow: boolean): View {
      const view = makeView([card('a', { x }), card('b', { x: 400 })]);
      view.table!.arrows = arrow ? [{ from: 'a', to: 'b', seat: 0 }] : [];
      return view;
    }

    /** Lets the browser draw a few frames. */
    async function frames(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    it('counts frames while a card moves, for the arrows to follow it', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: arrowView(0, true) });
      await settle();
      const before = motion.frame;

      await rerender({ session, view: arrowView(200, true) });
      await waitFor(() => expect(motion.frame).toBeGreaterThan(before + 1));
    });

    it('counts none while a card moves with no arrow to follow it', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: arrowView(0, false) });
      await settle();
      const before = motion.frame;

      await rerender({ session, view: arrowView(200, false) });
      await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).not.toHaveLength(0));
      await frames(3);
      expect(motion.frame).toBe(before);
    });

    it('starts counting once an arrow shows while a card moves', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: arrowView(0, false) });
      await settle();
      await rerender({ session, view: arrowView(200, false) });
      await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).not.toHaveLength(0));
      const before = motion.frame;

      // The same places: the card goes on moving.
      await rerender({ session, view: arrowView(200, true) });
      await waitFor(() => expect(motion.frame).toBeGreaterThan(before + 1));
    });

    it('stops counting once the last arrow goes while a card moves', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: arrowView(0, true) });
      await settle();
      const start = motion.frame;
      await rerender({ session, view: arrowView(200, true) });
      await waitFor(() => expect(motion.frame).toBeGreaterThan(start + 1));

      await rerender({ session, view: arrowView(200, false) });
      await frames(2);
      const before = motion.frame;
      await frames(3);
      expect(motion.frame).toBe(before);
    });

    it('counts frames while the viewer picks an arrow', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: arrowView(0, false) });
      await settle();
      await rerender({ session, view: arrowView(200, false) });
      await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).not.toHaveLength(0));
      const before = motion.frame;

      interaction.startArrow('b');
      await waitFor(() => expect(motion.frame).toBeGreaterThan(before + 1));
    });
  });

  it('with reduced motion, cards jump to their place and only the glow plays', async () => {
    await withReducedMotion(async () => {
      const session = fakeSession();
      const { rerender } = render(Table, {
        session,
        view: makeView([card('a', { x: 0 })]),
      });
      await settle();

      const next = makeView([card('a', { x: 200, exhausted: true })], {
        log: [START, line('exhausted Spider-Man')],
      });
      await rerender({ session, view: next });
      await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).toHaveLength(1));
      const [[, options]] = animationsOf('.surface .card[data-id="a"]') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(options.pseudoElement).toBe('::after');
    });
  });

  it("the viewer's own drop does not move again: it only settles where it lies", async () => {
    const session = fakeSession();
    const { rerender } = render(Table, {
      session,
      view: makeView([card('b', { owner: 1, x: 0 })]),
    });
    await settle();
    interaction.land({
      action: 1,
      element: { kind: 'card', id: 'b' },
      card: 'b',
      lifted: ['b'],
      handOrder: null,
    });

    await rerender({ session, view: makeView([card('b', { owner: 1, x: 300 })]) });
    await settle();
    const frames = animationsOf('.surface .card[data-id="b"]').map(([keyframes]) => keyframes);
    expect(frames.map((keyframes) => keyframes.map((frame) => frame.scale))).toEqual([
      ['1.06', '0.98', '1'],
    ]);
    expect(frames.flat().some((frame) => frame.translate !== undefined)).toBe(false);
  });

  it('a token change glows in the colour of the player who made it', async () => {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([card('a', {})]) });
    await settle();

    const next = makeView([card('a', { tokens: { dmg: 1 } })], {
      log: [START, line('added 1 damage to Spider-Man')],
    });
    await rerender({ session, view: next });
    await waitFor(() => expect(animationsOf('.surface .card[data-id="a"]')).toHaveLength(1));
    const [[keyframes, options]] = animationsOf('.surface .card[data-id="a"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(String(keyframes[0]?.boxShadow)).toContain('#4f9dff');
    expect(options).toMatchObject({ duration: 1100, pseudoElement: '::after' });
  });

  it('a shuffle riffles the pile', async () => {
    const session = fakeSession();
    const { rerender, container } = render(Table, { session, view: makeView([]) });
    await settle();

    // As "Shuffle & close" leaves it: the shuffle's line, by the viewer.
    const next = makeView([], {
      log: [START, line('shuffled their deck', { who: 'Sam', color: 1 })],
    });
    await rerender({ session, view: next });
    // Its bounce, and its lift over its neighbours.
    await waitFor(() => expect(animationsOf('.surface .pile[data-id="deck:p1"]')).toHaveLength(2));
    const pile = container.querySelector('.surface .pile[data-id="deck:p1"]');
    // Six copies of its back riffle back into it.
    expect(
      animate.mock.contexts.filter((element) => (element as Element).parentElement === pile),
    ).toHaveLength(6);
  });

  describe('when a shuffle riffles the pile', () => {
    /** The delays of the riffle on a pile: its copies', in order, and its bounce's. */
    function riffleDelays(container: HTMLElement, id: string) {
      const pile = container.querySelector(`.surface .pile[data-id="${id}"]`);
      const copies = animate.mock.calls.flatMap((call, i) => {
        const element = animate.mock.contexts[i] as Element;
        const [, options] = call as unknown as [Keyframe[], KeyframeAnimationOptions];
        return element.parentElement === pile ? [options.delay] : [];
      });
      return { copies, bounce: bounceDelays(id) };
    }

    it('a card shuffled into its deck: the deck riffles once the card has landed', async () => {
      const session = fakeSession();
      const deck = (count: number): PileView => ({ ...PILES[0]!, count });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('b', { owner: 1, x: 40 })], { piles: [deck(30), PILES[1]!] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], {
          piles: [deck(31), PILES[1]!],
          log: [START, line('shuffled Spider-Man into their deck', { who: 'Sam', color: 1 })],
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      // The card flies for 420 ms; the copies then riffle one after the other, 40 ms apart.
      expect(riffleDelays(container, 'deck:p1')).toEqual({
        copies: [420, 460, 500, 540, 580, 620],
        bounce: [420],
      });
    });

    it('the pile rises over its neighbours for the whole riffle', async () => {
      const session = fakeSession();
      const deck = (count: number): PileView => ({ ...PILES[0]!, count });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('b', { owner: 1, x: 40 })], { piles: [deck(30), PILES[1]!] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], {
          piles: [deck(31), PILES[1]!],
          log: [START, line('shuffled Spider-Man into their deck', { who: 'Sam', color: 1 })],
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const lifts = animationsOf('.surface .pile[data-id="deck:p1"]').filter(
        ([keyframes]) => keyframes[0]?.zIndex !== undefined,
      );
      expect(lifts).toHaveLength(1);
      const [[keyframes, options]] = lifts as [[Keyframe[], KeyframeAnimationOptions]];
      expect(keyframes.map((frame) => frame.zIndex)).toEqual([1, 1]);
      // From the first copy leaving, once the card has landed, to the last one back: 5 × 40 + 620 ms.
      expect(options).toMatchObject({ delay: 420, duration: 820 });
      // Back to its own level once the riffle is over.
      expect(options.fill).toBeUndefined();
    });

    it('a discard pile shuffled back: the deck riffles once the last card has landed', async () => {
      const session = fakeSession();
      const ids = ['d1', 'd2', 'd3'];
      const deck = (count: number): PileView => ({ ...PILES[0]!, id: 'deck:p0', owner: 0, count });
      const discard = (cards: string[]): PileView => ({ ...PILES[1]!, count: cards.length, cards });
      const onPile = ids.map((id) => card(id, { zone: 'pile' }));
      const { rerender, container } = render(Table, {
        session,
        view: makeView(onPile, { piles: [deck(10), discard(ids)] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], {
          piles: [deck(13), discard([])],
          log: [START, line('shuffled their discard pile into their deck')],
        }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(3));
      // Three cards leave 70 ms apart: the last one lands at 140 + 420 ms.
      const { copies, bounce } = riffleDelays(container, 'deck:p0');
      expect(copies[0]).toBe(560);
      expect(bounce).toEqual([560]);
    });

    it('a shuffle with no card flying in riffles at once', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: makeView([]) });
      await settle();

      await rerender({
        session,
        view: makeView([], { log: [START, line('shuffled their deck', { who: 'Sam', color: 1 })] }),
      });
      await waitFor(() =>
        expect(animationsOf('.surface .pile[data-id="deck:p1"]')).toHaveLength(2),
      );
      const { copies, bounce } = riffleDelays(container, 'deck:p1');
      expect(copies[0]).toBe(0);
      expect(bounce).toEqual([0]);
    });
  });

  it('a discarded card flies to its pile, which shows it once it lands', async () => {
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { x: 40 })]),
    });
    await settle();

    const discard = { ...PILES[1]!, count: 1, cards: ['a'] };
    const next = makeView([card('a', { zone: 'pile' })], {
      piles: [PILES[0]!, discard],
      log: [START, line('discarded Spider-Man')],
    });
    await rerender({ session, view: next });
    await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
    const pile = container.querySelector<HTMLElement>('.surface .pile[data-id="disc:p0"]');
    // Until it lands, the pile looks as it did: empty.
    expect(pile?.classList).toContain('empty');
    // It is held up on its way, on the scale property, apart from the transform of its way.
    const [[, way], [lift, liftOptions]] = animationsOf('.fly') as [
      [Keyframe[], KeyframeAnimationOptions],
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(lift).toEqual([{ scale: '1' }, { scale: '1.06', offset: 0.45 }, { scale: '1' }]);
    expect(liftOptions).toMatchObject({
      duration: way.duration,
      delay: way.delay,
      fill: way.fill,
      easing: 'ease-in-out',
    });
    expect(animationsOf('.fly')).toHaveLength(2);
    // Drawn on the table, the pile shows the card land: the copy does not fade.
    expect(motion.flights).toMatchObject([{ kind: 'toPile', pile: 'disc:p0', fades: false }]);
    expect(fadesOf('.fly')).toEqual([]);
  });
  it('a card put at the bottom of a deck flies below it, then slips under it', async () => {
    const session = fakeSession();
    const deck = (count: number): PileView => ({ ...PILES[0]!, count });
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('b', { owner: 1, x: 40 })], { piles: [deck(30), PILES[1]!] }),
    });
    await settle();

    await rerender({
      session,
      view: makeView([], {
        piles: [deck(31), PILES[1]!],
        log: [START, line('put Spider-Man at the bottom of their deck', { who: 'Sam', color: 1 })],
      }),
    });
    await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
    const [[keyframes]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
    // Hidden at the end: under the deck, which lies over it.
    expect(keyframes.at(-1)?.clipPath).toBe('inset(100% 0 0 0)');
    expect(keyframes.at(1)?.clipPath).toBe('inset(0% 0 0 0)');
    // Slipping under it, it is not held up.
    expect(animationsOf('.fly')).toHaveLength(1);
  });

  describe('draws', () => {
    // Sam, the viewer, draws from their deck: it holds 29 cards from now on.
    const drawnDeck = PILES.map((pile) => (pile.id === 'deck:p1' ? { ...pile, count: 29 } : pile));
    const drew = [START, line('drew 1 card', { who: 'Sam', color: 1 })];
    const drawn = (extra: Partial<TableCard> = {}) =>
      card('d', { owner: 1, zone: 'hand', ...extra });
    const handCard = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('.hand .hcard[data-id="d"]');

    async function drawOne(): Promise<HTMLElement> {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { hands: { p1: [] } }),
      });
      await settle();
      await rerender({
        session,
        view: makeView([drawn()], { piles: drawnDeck, hands: { p1: ['d'] }, log: drew }),
      });
      return container;
    }

    it('a card drawn from the deck flies in on its back, hidden in the hand until it lands', async () => {
      const container = await drawOne();
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(handCard(container)?.classList).toContain('arriving');

      // It turns over in the last part of the way: edge-on, its back gives way to its face.
      const [[keyframes, options]] = animationsOf('.fly') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
      expect(String(keyframes[2]?.transform)).toContain('rotateY(90deg)');
      expect(options.duration).toBe(380);
      expect(animationsOf('.fly [data-side="back"]')).toHaveLength(1);
      // Held up on its way, on the scale property, which the slot's following leaves alone.
      const lift = animationsOf('.fly').find(([frames]) => frames[0]?.scale !== undefined);
      expect(lift?.[0].map((frame) => frame.scale)).toEqual(['1', '1.06', '1']);
      expect(lift?.[1]).toMatchObject({ duration: 380, delay: 0, fill: 'both' });

      const fly = container.querySelector('.fly');
      started.find((animation) => animation.element === fly)?.finish();
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
      expect(handCard(container)?.classList).not.toContain('arriving');
    });

    it('a copy heads for where its slot is now, as the hand moves under it', async () => {
      const container = await drawOne();
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      const flight = started.find((animation) => animation.element === fly)!;
      const endOf = () => {
        const [, x = '', y = ''] =
          /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
            String(flight.keyframes.at(-1)?.transform),
          ) ?? [];
        return { x: Number(x), y: Number(y) };
      };
      const before = endOf();

      // The hand rises, or its fan is laid out again: the slot is now 200 px right, 100 px up.
      const slot = handCard(container)!.querySelector<HTMLElement>('.hit')!;
      slot.style.left = '200px';
      slot.style.top = '-100px';
      await waitFor(() => expect(endOf()).toEqual({ x: before.x + 200, y: before.y - 100 }));
      // Its lift keeps its own keyframes.
      const lift = started.find((animation) => animation.element === fly && animation !== flight);
      expect(lift?.effect.setKeyframes).not.toHaveBeenCalled();
      expect(lift?.keyframes.map((frame) => frame.scale)).toEqual(['1', '1.06', '1']);
    });

    it('a discard flying meanwhile does not hold up the end of the other animations', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('a', { x: 40 })]),
      });
      await settle();
      const discard = { ...PILES[1]!, count: 1, cards: ['a'] };
      await rerender({
        session,
        view: makeView([card('a', { zone: 'pile' })], { piles: [PILES[0]!, discard] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());

      const timeout = new Promise((resolve) => setTimeout(() => resolve('waiting'), 50));
      expect(await Promise.race([motion.settled().then(() => 'settled'), timeout])).toBe('settled');
    });

    it('a card taken from a discard pile shows its face all the way', async () => {
      const session = fakeSession();
      const discard = (cards: string[]) => ({ ...PILES[1]!, count: cards.length, cards });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('d', { zone: 'pile' })], {
          piles: [PILES[0]!, discard(['d'])],
          hands: { p1: [] },
        }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([drawn()], { piles: [PILES[0]!, discard([])], hands: { p1: ['d'] } }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(container.querySelector('.fly [data-side="back"]')).toBeNull();
      const [[keyframes]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
      expect(keyframes).toHaveLength(2);
      expect(String(keyframes[1]?.transform)).toContain('rotateY(0deg)');
    });

    it('a stop shows the drawn card at once', async () => {
      const container = await drawOne();
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());

      motion.stop();
      await settle();
      expect(container.querySelector('.fly')).toBeNull();
      expect(handCard(container)?.classList).not.toContain('arriving');
    });

    it('a flight ends when its card leaves the hand', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { hands: { p1: [] } }),
      });
      await settle();
      await rerender({
        session,
        view: makeView([drawn()], { piles: drawnDeck, hands: { p1: ['d'] }, log: drew }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());

      // Played at once, before its copy lands.
      await rerender({
        session,
        view: makeView([card('d', { owner: 1, x: 300 })], { piles: drawnDeck, hands: { p1: [] } }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
    });

    it("another player's draw leaves their deck, out of sight", async () => {
      const session = fakeSession();
      const alexDeck = (count: number): PileView => ({
        id: 'deck:p0',
        kind: 'deck',
        owner: 0,
        x: 480,
        y: 0,
        count,
      });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const [[keyframes, options]] = animationsOf('.fly') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes.at(-1)).toMatchObject({ opacity: 0 });
      expect(String(keyframes.at(-1)?.transform)).toContain('40px');
      expect(options.duration).toBe(380);
      expect(container.querySelector('.fly')?.getAttribute('style')).toContain('left: 480px');
    });

    it('a card drawn from a side deck flies in from it on the captioned back', async () => {
      const session = fakeSession();
      const labor = (count: number): PileView => ({
        id: 'side:p1:0',
        kind: 'sideDeck',
        owner: 1,
        x: 480,
        y: 0,
        count,
        label: 'Labor',
        back: 'player',
      });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, labor(3)], hands: { p1: [] } }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([drawn({ home: 'side:p1:0' })], {
          piles: [...PILES, labor(2)],
          hands: { p1: ['d'] },
          log: [START, line('drew 1 card from their Labor deck', { who: 'Sam', color: 1 })],
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 480px');
      expect(
        fly?.querySelector('[data-side="back"] [aria-label="Labor card back"]'),
      ).not.toBeNull();
    });

    it("another player's draw from a side deck leaves it on the captioned back", async () => {
      const session = fakeSession();
      const gift = (count: number): PileView => ({
        id: 'side:p0:0',
        kind: 'sideDeck',
        owner: 0,
        x: 480,
        y: 0,
        count,
        label: 'Gift',
        back: 'encounter',
      });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, gift(3)] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], { piles: [...PILES, gift(2)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 480px');
      expect(fly?.querySelector('[aria-label="Gift card back"]')).not.toBeNull();
    });

    it("another player's two quick draws both leave their deck", async () => {
      const session = fakeSession();
      const alexDeck = (count: number): PileView => ({
        id: 'deck:p0',
        kind: 'deck',
        owner: 0,
        x: 480,
        y: 0,
        count,
      });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(1));
      // The second comes before the first copy is gone: both play on.
      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(28)], handCounts: [7, 5] }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(2));
      expect(started.filter((animation) => animation.element.matches('.fly'))).toHaveLength(2);
      expect(
        started.filter((animation) => animation.element.matches('.fly') && animation.cancelled),
      ).toEqual([]);
    });

    it("another player's draw right after their shuffle lets the riffle play on", async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: makeView([]) });
      await settle();
      const shuffled = [START, line('shuffled their deck')];
      const deck = PILES[0]!;
      const alexPiles = (count: number): PileView[] => [
        { ...deck, id: 'deck:p0', owner: 0, x: 480, count },
        PILES[1]!,
      ];
      await rerender({ session, view: makeView([], { piles: alexPiles(30), log: shuffled }) });
      const pile = () => container.querySelector('.surface .pile[data-id="deck:p0"]')!;
      // Its bounce, and its lift over its neighbours.
      await waitFor(() => expect(runningOn(pile())).toHaveLength(2));
      const riffle = started.filter((animation) => animation.element.parentElement === pile());
      expect(riffle).toHaveLength(6);

      await rerender({
        session,
        view: makeView([], { piles: alexPiles(29), log: shuffled, handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(runningOn(pile())).toHaveLength(2);
      expect(riffle.filter((animation) => animation.cancelled)).toEqual([]);
    });

    it("a card drawn into the viewer's other deck, whose hand is not shown, leaves its pile", async () => {
      // Sam plays three decks, so that one hand shows: p1's, while p2 draws.
      const threeDecks = (cards: TableCard[], hand: string[], count: number): View => {
        const base = makeView(cards, {
          piles: [...PILES, { id: 'deck:p2', kind: 'deck', owner: 2, x: 480, y: 0, count }],
          hands: { p1: [], p2: hand, p3: [] },
        });
        base.you = { ...base.you, areas: ['p1', 'p2', 'p3'] };
        base.players[1]!.decks.push(
          { area: 'p2', ready: true, handCount: hand.length },
          { area: 'p3', ready: true, handCount: 0 },
        );
        return base;
      };
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: threeDecks([], [], 30) });
      await settle();

      await rerender({
        session,
        view: threeDecks([card('d', { owner: 2, zone: 'hand' })], ['d'], 29),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const [[keyframes]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
      expect(keyframes.at(-1)).toMatchObject({ opacity: 0 });
      expect(motion.drawing.size).toBe(0);
    });

    it('with reduced motion, a drawn card shows in the hand at once', async () => {
      await withReducedMotion(async () => {
        const container = await drawOne();
        await settle();
        expect(container.querySelector('.fly')).toBeNull();
        expect(handCard(container)?.classList).not.toContain('arriving');
      });
    });
  });

  describe('cards changing place', () => {
    const discard = (cards: string[], id = 'disc:p0', owner = 0, x = 720): PileView => ({
      id,
      kind: 'discard',
      owner,
      x,
      y: 0,
      count: cards.length,
      cards,
    });
    const samDeck = (count: number): PileView => ({ ...PILES[0]!, count });
    /** Whether a copy shows a card's back anywhere, its own or a caption's. */
    const showsBack = (element: Element | null) =>
      element?.querySelector('[aria-label$="card back"], [alt$="card back"]') != null;

    async function renderTable(view: View) {
      const session = { ...fakeSession(), presence: new SvelteMap<number, PresenceState>() };
      const rendered = render(Table, { session, view });
      await settle();
      return { ...rendered, session, next: (view: View) => rendered.rerender({ session, view }) };
    }

    /**
     * Lays the ghost the viewer's drop leaves where it was let go, until the
     * view shows it (DragLayer.svelte), under the id DragLayer gives it.
     */
    function landGhost(
      container: Element,
      id: string,
      at: Point,
      size: { w: number; h: number } = { w: 63, h: 88 },
    ): void {
      const ghost = document.createElement('div');
      ghost.className = 'card ghost landed';
      ghost.dataset.id = id;
      Object.assign(ghost.style, {
        left: `${at.x}px`,
        top: `${at.y}px`,
        width: `${size.w}px`,
        height: `${size.h}px`,
      });
      container.querySelector('.draglayer')?.append(ghost);
    }

    /**
     * Expects a copy to leave the viewer's own ghost laid at `at`, of `size`: held up there
     * (LIFT_SCALE), it is that much larger about the same middle.
     */
    function expectFromLifted(
      copy: Element | null,
      at: Point,
      size: { w: number; h: number } = { w: 63, h: 88 },
    ): void {
      const style = (copy as HTMLElement | null)?.style;
      const box = [style?.left, style?.top, style?.width, style?.height].map((side) =>
        Number.parseFloat(side ?? ''),
      );
      const w = size.w * LIFT_SCALE;
      const h = size.h * LIFT_SCALE;
      const expected = [at.x - (w - size.w) / 2, at.y - (h - size.h) / 2, w, h];
      box.forEach((side, i) => expect(side).toBeCloseTo(expected[i] ?? NaN));
    }

    it('a card played from the discard slides from the pile to its spot', async () => {
      const { next } = await renderTable(
        makeView([card('c9', { zone: 'pile' })], { piles: [PILES[0]!, discard(['c9'])] }),
      );

      await next(
        makeView([card('c9', { x: 300, y: 100 })], {
          piles: [PILES[0]!, discard([])],
          log: [START, line('played Spider-Man')],
        }),
      );
      const placed = '.surface .card[data-id="c9"]';
      await waitFor(() => expect(animationsOf(placed)).toHaveLength(1));
      const [[keyframes, options]] = animationsOf(placed) as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes[0]).toMatchObject({ translate: expect.stringMatching(/^\d+px -100px$/) });
      expect(keyframes[1]).toMatchObject({ translate: '0px 0px', scale: '1' });
      expect(options.duration).toBe(250);
    });

    it("another player's drop of a discard card slides from their ghost", async () => {
      const { next, session } = await renderTable(
        makeView([card('c9', { zone: 'pile' })], { piles: [PILES[0]!, discard(['c9'])] }),
      );
      // Alex drags it out of the discard to 250, 100, then lets go: its ghost stays there.
      session.presence.set(0, {
        color: 0,
        name: 'Alex',
        at: Date.now(),
        drag: { cards: ['c9'], x: 250, y: 100 },
      });
      const ghost = () => document.querySelector('.presence .card.ghost[data-id="c9"]');
      await waitFor(() => expect(ghost()).not.toBeNull());
      session.presence.set(0, { color: 0, name: 'Alex', at: Date.now(), drag: null });
      await settle();

      await next(makeView([card('c9', { x: 300, y: 100 })], { piles: [PILES[0]!, discard([])] }));
      const placed = '.surface .card[data-id="c9"]';
      await waitFor(() => expect(animationsOf(placed)).toHaveLength(1));
      const [[keyframes]] = animationsOf(placed) as [[Keyframe[], KeyframeAnimationOptions]];
      expect(keyframes[0]).toMatchObject({ translate: '-50px 0px' });
    });

    describe("the viewer's own drop on the table", () => {
      const drop = (lifted: string[]) =>
        interaction.land({
          action: 1,
          element: { kind: 'card', id: lifted[0]! },
          card: lifted[0]!,
          lifted,
          handOrder: null,
        });
      const placed = (id: string) => `.surface .card[data-id="${id}"]`;
      const scalesOf = (id: string) =>
        animationsOf(placed(id)).filter(([frames]) => frames[0]?.scale !== undefined);
      const rotatesOf = (id: string) =>
        animationsOf(placed(id)).filter(([frames]) => frames[0]?.rotate !== undefined);

      /** Stubs the angle the viewer's landed ghosts sway to: jsdom computes no style. */
      function stubSway(rotate: string) {
        const computed = window.getComputedStyle;
        return vi
          .spyOn(window, 'getComputedStyle')
          .mockImplementation((element, pseudo) =>
            element.matches('.draglayer .card.ghost.landed')
              ? ({ rotate } as CSSStyleDeclaration)
              : computed(element, pseudo),
          );
      }

      it('settles where it lies: down from its lift, dipping, its shadow back under it', async () => {
        const { next, container } = await renderTable(makeView([card('b', { owner: 1, x: 0 })]));
        drop(['b']);
        landGhost(container, 'b', { x: 300, y: 0 });

        await next(makeView([card('b', { owner: 1, x: 300 })]));
        await waitFor(() => expect(scalesOf('b')).toHaveLength(1));
        expect(scalesOf('b')).toEqual([
          [
            [
              { scale: '1.06', easing: 'ease-in' },
              { scale: '0.98', offset: 0.55, easing: 'ease-out' },
              { scale: '1' },
            ],
            { duration: 220 },
          ],
        ]);
        expect(animationsOf(`${placed('b')} > .shade`)).toEqual([
          [
            [
              { translate: '5px 5px', easing: 'ease-in' },
              { translate: '0px 0px', offset: 0.55 },
              { translate: '0px 0px' },
            ],
            { duration: 220 },
          ],
          // The lifted shadow until the shade is back under it, soft over the card below, then its
          // resting one.
          [
            [
              { boxShadow: 'var(--lifted-card-shadow)' },
              { boxShadow: 'var(--lifted-card-shadow)' },
            ],
            { duration: 0.55 * 220 },
          ],
        ]);
        // Upright as its ghost was: it does not turn.
        expect(rotatesOf('b')).toEqual([]);
      });

      it('comes upright from the angle its ghost swayed to', async () => {
        const spy = stubSway('4.5deg');
        try {
          const { next, container } = await renderTable(makeView([card('b', { owner: 1 })]));
          drop(['b']);
          landGhost(container, 'b', { x: 300, y: 0 });

          await next(makeView([card('b', { owner: 1, x: 300 })]));
          await waitFor(() => expect(rotatesOf('b')).toHaveLength(1));
          expect(rotatesOf('b')).toEqual([
            [[{ rotate: '4.5deg' }, { rotate: '0deg' }], { duration: 220, easing: 'ease-out' }],
          ]);
        } finally {
          spy.mockRestore();
        }
      });

      it('settles every card of a group, each from its own ghost', async () => {
        const spy = stubSway('-3deg');
        try {
          const cards = [card('a', { owner: 1 }), card('b', { owner: 1, x: 100 })];
          const { next, container } = await renderTable(makeView(cards));
          drop(['a', 'b']);
          landGhost(container, 'a', { x: 300, y: 0 });
          landGhost(container, 'b', { x: 400, y: 0 });

          await next(makeView([card('a', { owner: 1, x: 300 }), card('b', { owner: 1, x: 400 })]));
          await waitFor(() => expect(scalesOf('b')).toHaveLength(1));
          for (const id of ['a', 'b']) {
            expect(scalesOf(id), id).toHaveLength(1);
            expect(
              rotatesOf(id).map(([frames]) => frames[0]?.rotate),
              id,
            ).toEqual(['-3deg']);
          }
        } finally {
          spy.mockRestore();
        }
      });

      it('exhausted meanwhile, it tilts, and the tilt alone plays on its rotate property', async () => {
        const spy = stubSway('4.5deg');
        try {
          const { next, container } = await renderTable(makeView([card('b', { owner: 1 })]));
          drop(['b']);
          landGhost(container, 'b', { x: 300, y: 0 });

          await next(
            makeView([card('b', { owner: 1, x: 300, exhausted: true })], {
              log: [START, line('exhausted Spider-Man')],
            }),
          );
          await waitFor(() => expect(scalesOf('b')).toHaveLength(1));
          expect(rotatesOf('b').map(([frames]) => frames[0]?.rotate)).toEqual(['-15deg']);
        } finally {
          spy.mockRestore();
        }
      });

      it("played off the viewer's deck, it settles from the unknown top it landed as, turning face up", async () => {
        const spy = stubSway('3deg');
        try {
          const { next, container } = await renderTable(makeView([], { piles: [samDeck(30)] }));
          interaction.land({
            action: 1,
            element: { kind: 'pile', id: 'deck:p1' },
            card: null,
            lifted: [],
            handOrder: null,
          });
          // The deck's top is not known: it landed as an unknown card.
          landGhost(container, DECK_TOP_ID, { x: 300, y: 0 });

          await next(makeView([card('c7', { owner: 1, x: 300 })], { piles: [samDeck(29)] }));
          await waitFor(() => expect(scalesOf('c7')).toHaveLength(1));
          // The settle alone plays on its scale: the turn does not lift it as well.
          expect(scalesOf('c7')[0]?.[0].map((frame) => frame.scale)).toEqual(['1.06', '0.98', '1']);
          expect(rotatesOf('c7').map(([frames]) => frames[0]?.rotate)).toEqual(['3deg']);
          const turns = animationsOf(placed('c7')).filter(([frames]) => frames[0]?.transform);
          expect(turns.map(([frames]) => frames.map((frame) => frame.transform))).toEqual([
            ['perspective(700px) rotateY(90deg)', 'perspective(700px) rotateY(0deg)'],
          ]);
          const shadeMoves = animationsOf(`${placed('c7')} > .shade`).filter(
            ([frames]) => frames[0]?.translate,
          );
          expect(shadeMoves).toHaveLength(1);
        } finally {
          spy.mockRestore();
        }
      });

      it('with reduced motion, it shows at rest at once', async () => {
        await withReducedMotion(async () => {
          const { next, container } = await renderTable(makeView([card('b', { owner: 1 })]));
          drop(['b']);
          landGhost(container, 'b', { x: 300, y: 0 });

          await next(makeView([card('b', { owner: 1, x: 300 })]));
          await settle();
          expect(animate).not.toHaveBeenCalled();
        });
      });
    });

    describe("the viewer's own drop tucked into a stack", () => {
      // Sam's "host" with h1 tucked under it; the server lays the chain out.
      const host = card('host', { owner: 1, x: 400, y: 100, z: 3 });
      const h1 = card('h1', { owner: 1, x: 410, y: 120, z: 2, parent: 'host' });
      const placed = (id: string) => `.surface .card[data-id="${id}"]`;
      /** The size a table card is drawn at, which its ghost has too. */
      const sizeOf = (id: string) => {
        const element = document.querySelector<HTMLElement>(placed(id))!;
        return { w: parseFloat(element.style.width), h: parseFloat(element.style.height) };
      };

      /** The keyframes and options of the animations started on a table card, in order. */
      const startedOn = (id: string) =>
        animationsOf(placed(id)) as [Keyframe[], KeyframeAnimationOptions][];

      /**
       * Expects a card to slide in under its stack in two steps: from `from` at that size, drawn at
       * z above the stack, out to half its own size down and to the right of its slot, then up into
       * it at its own z-index.
       */
      function expectTuck(id: string, from: string, z: number, size = 1): void {
        const { w, h } = sizeOf(id);
        const [[frames, options], [zFrames, zOptions]] = startedOn(id) as [
          [Keyframe[], KeyframeAnimationOptions],
          [Keyframe[], KeyframeAnimationOptions],
        ];
        expect(Number(frames[0]?.scale)).toBeCloseTo(size);
        expect(frames).toEqual([
          {
            translate: from,
            scale: expect.any(String) as string,
            easing: 'cubic-bezier(.2, .8, .2, 1)',
          },
          { translate: `${w / 2}px ${h / 2}px`, scale: '1', offset: 0.5, easing: 'ease-in-out' },
          { translate: '0px 0px', scale: '1' },
        ]);
        expect(options.duration).toBe(400);
        // Above the stack only while it shifts out: its own z-index then puts it beneath.
        expect(zFrames).toEqual([{ zIndex: z }, { zIndex: z }]);
        expect(zOptions.duration).toBe(200);
      }

      it('shifts out above the stack, then slides in under it, with the chain it carries', async () => {
        const mine = card('mine', { owner: 1, x: 0, y: 0 });
        const m1 = card('m1', { owner: 1, x: 10, y: 20, parent: 'mine' });
        const { next, container } = await renderTable(makeView([host, h1, mine, m1]));
        interaction.land({
          action: 1,
          element: { kind: 'card', id: 'mine' },
          card: 'mine',
          lifted: ['mine', 'm1'],
          tucks: true,
          handOrder: null,
        });
        // Let go over host, off the grid, the card it carries at its offset.
        landGhost(container, 'mine', { x: 380, y: 90 }, sizeOf('mine'));
        landGhost(container, 'm1', { x: 390, y: 110 }, sizeOf('m1'));

        // The server lays the chain out, the cards tucked beneath host, each beneath the one before.
        await next(
          makeView([
            { ...host, z: 9 },
            { ...h1, z: 8 },
            { ...mine, x: 420, y: 140, z: 7, parent: 'h1' },
            { ...m1, x: 430, y: 160, z: 6 },
          ]),
        );
        await waitFor(() => expect(startedOn('m1')).toHaveLength(2));
        // One block from where it was let go, held up there, mine above m1 above host while they
        // shift out.
        expectTuck('mine', '-40px -50px', 11, LIFT_SCALE);
        expectTuck('m1', '-40px -50px', 10, LIFT_SCALE);
        // The card it tucks under does not move.
        expect(startedOn('h1')).toEqual([]);
        // The view keeps the z-index the server gave: beneath the stack.
        expect(document.querySelector<HTMLElement>(placed('mine'))!.style.zIndex).toBe('7');
      });

      it("another player's card tucked into it does the same from their ghost", async () => {
        const mine = card('mine', { owner: 1, x: 0, y: 0 });
        const { next, session } = await renderTable(makeView([host, h1, mine]));
        // Sam drags it over host, then lets go: its ghost stays there.
        session.presence.set(1, {
          color: 1,
          name: 'Sam',
          at: Date.now(),
          drag: { cards: ['mine'], x: 380, y: 90 },
        });
        const ghost = () => document.querySelector('.presence .card.ghost[data-id="mine"]');
        await waitFor(() => expect(ghost()).not.toBeNull());
        session.presence.set(1, { color: 1, name: 'Sam', at: Date.now(), drag: null });
        await settle();

        await next(makeView([host, h1, { ...mine, x: 420, y: 140, parent: 'h1' }]));
        await waitFor(() => expect(startedOn('mine')).toHaveLength(2));
        // host lies at z 3: drawn at 4 while it shifts out.
        expectTuck('mine', '-40px -50px', 4);
      });

      it('a card played under it from a pile shifts out of the pile above it, then slides in', async () => {
        const { next } = await renderTable(
          makeView([host, h1, card('c9', { zone: 'pile' })], {
            piles: [PILES[0]!, discard(['c9'])],
          }),
        );

        await next(
          makeView([host, h1, card('c9', { x: 420, y: 140, parent: 'h1' })], {
            piles: [PILES[0]!, discard([])],
            log: [START, line('played Spider-Man')],
          }),
        );
        await waitFor(() => expect(startedOn('c9')).toHaveLength(2));
        const [[frames], [zFrames]] = startedOn('c9') as [
          [Keyframe[], KeyframeAnimationOptions],
          [Keyframe[], KeyframeAnimationOptions],
        ];
        expect(frames).toHaveLength(3);
        expect(frames[1]).toMatchObject({ offset: 0.5 });
        expect(zFrames).toEqual([{ zIndex: 4 }, { zIndex: 4 }]);
      });

      it('undone, it slides out of the stack as any move', async () => {
        const mine = card('mine', { owner: 1, x: 420, y: 140, parent: 'h1' });
        const { next } = await renderTable(makeView([host, h1, mine]));

        await next(
          makeView([host, h1, { ...mine, x: 0, y: 0, parent: undefined }], {
            log: [START, line('undid “moved Spider-Man”')],
          }),
        );
        await waitFor(() => expect(startedOn('mine')).toHaveLength(1));
        const [[frames, options]] = startedOn('mine') as [[Keyframe[], KeyframeAnimationOptions]];
        expect(frames).toHaveLength(2);
        expect(options.duration).toBe(250);
      });

      it('slides the cards after a tucked card dragged out of it up to their new spots', async () => {
        const h2 = card('h2', { owner: 1, x: 420, y: 140, z: 1, parent: 'h1' });
        const { next, container } = await renderTable(makeView([host, h1, h2]));
        interaction.land({
          action: 1,
          element: { kind: 'card', id: 'h1' },
          card: 'h1',
          lifted: ['h1'],
          handOrder: null,
        });
        landGhost(container, 'h1', { x: 100, y: 100 }, sizeOf('h1'));

        await next(
          makeView([
            { ...host, z: 6 },
            { ...h1, x: 100, y: 100, z: 4, parent: undefined },
            { ...h2, x: 410, y: 120, z: 5, parent: 'host' },
          ]),
        );
        await waitFor(() => expect(animationsOf(placed('h2'))).toHaveLength(1));
        const [[keyframes]] = animationsOf(placed('h2')) as [
          [Keyframe[], KeyframeAnimationOptions],
        ];
        expect(keyframes[0]).toMatchObject({ translate: '10px 20px' });
        // The card dragged out already lies where it went: it only settles there.
        const settling = animationsOf(placed('h1')).map(([frames]) => frames);
        expect(settling.flat().some((frame) => frame.translate !== undefined)).toBe(false);
        expect(settling.map((frames) => frames[0]?.scale)).toEqual(['1.06']);
      });

      it('with reduced motion, it shows at its spot in the chain at once', async () => {
        await withReducedMotion(async () => {
          const mine = card('mine', { owner: 1, x: 0, y: 0 });
          const { next, container } = await renderTable(makeView([host, h1, mine]));
          interaction.land({
            action: 1,
            element: { kind: 'card', id: 'mine' },
            card: 'mine',
            lifted: ['mine'],
            tucks: true,
            handOrder: null,
          });
          landGhost(container, 'mine', { x: 380, y: 90 }, sizeOf('mine'));

          await next(makeView([host, h1, { ...mine, x: 420, y: 140, parent: 'h1' }]));
          await settle();
          expect(animationsOf(placed('mine'))).toEqual([]);
        });
      });
    });

    it('a face-up card put on top of a deck flies there, turning face down', async () => {
      const { next, container } = await renderTable(
        makeView([card('c4', { owner: 1, x: 40 })], { piles: [samDeck(30), PILES[1]!] }),
      );

      await next(makeView([], { piles: [samDeck(31), PILES[1]!] }));
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 40px');
      // It leaves on its face: its back is drawn over it, but hidden until it turns.
      const back = fly?.querySelector<HTMLElement>('[data-side="back"]');
      expect(back?.style.opacity).toBe('0');
      const [[keyframes, options]] = animationsOf('.fly') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
      expect(String(keyframes[2]?.transform)).toContain('rotateY(90deg)');
      expect(String(keyframes.at(-1)?.transform)).toContain('translate(');
      expect(options.duration).toBe(420);
      // A portrait card turns no quarter, and its back lies as the copy does.
      expect(String(keyframes.at(-1)?.transform)).toContain(' rotate(0deg) ');
      expect(options.easing).toBe('cubic-bezier(.3, .7, .2, 1)');
      expect(back?.classList).not.toContain('upright');
      // Drawn on the table, the deck shows it land: it turns on its way, held up, and does not fade.
      const lifts = animationsOf('.fly').filter(([frames]) => frames[0]?.scale !== undefined);
      expect(
        lifts.map(([frames, lift]) => [frames.map((frame) => frame.offset), lift.easing]),
      ).toEqual([[[undefined, 0.45, undefined], 'ease-in-out']]);
      expect(fadesOf('.fly')).toEqual([]);

      // The deck lists none of its cards: an unrelated view does not cut the flight.
      await next(makeView([card('z', { x: 500 })], { piles: [samDeck(31), PILES[1]!] }));
      await settle();
      expect(container.querySelector('.fly')).not.toBeNull();
      // Its pile gone, it ends.
      await next(makeView([card('z', { x: 500 })], { piles: [PILES[1]!] }));
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
    });

    it('a card revealed on a deck that goes back into it turns to its back there', async () => {
      const deck = samDeck(30);
      const { next, container } = await renderTable(
        makeView([card('c4', { owner: 1, x: deck.x, y: deck.y, onPile: deck.id })], {
          piles: [deck, PILES[1]!],
        }),
      );

      await next(makeView([], { piles: [samDeck(31), PILES[1]!] }));
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      // Its face shows first, its back drawn over it, hidden until the copy is edge-on.
      expect(container.querySelector('.fly [data-side="back"]')).not.toBeNull();
      const [[keyframes]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
      expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
      expect(String(keyframes[2]?.transform)).toContain('rotateY(90deg)');
      const [[backFrames]] = animationsOf('.fly [data-side="back"]') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(backFrames.map((frame) => frame.opacity)).toEqual([0, 0, 1, 1]);
    });

    it('cards discarded from a deck fly to the discard on their back, then turn', async () => {
      const samDiscard = (cards: string[]) => discard(cards, 'disc:p1', 1, 840);
      const discarded = (id: string) => card(id, { owner: 1, zone: 'pile' });
      const { next, container } = await renderTable(
        makeView([], { piles: [samDeck(30), PILES[1]!, samDiscard([])] }),
      );

      await next(
        makeView([discarded('c7'), discarded('c8')], {
          piles: [samDeck(28), PILES[1]!, samDiscard(['c7', 'c8'])],
        }),
      );
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(2));
      const flies = [...container.querySelectorAll('.fly')];
      // They leave the deck, on their back over their face.
      for (const fly of flies) {
        expect(fly.getAttribute('style')).toContain('left: 600px');
        expect(fly.querySelector('[data-side="back"]')).not.toBeNull();
      }
      // Their ways, apart from their lifts.
      const flights = animationsOf('.fly').filter(([frames]) => frames[0]?.transform !== undefined);
      expect(flights.map(([frames]) => frames.map((frame) => frame.offset))).toEqual([
        [0, 0.6, 0.8, 1],
        [0, 0.6, 0.8, 1],
      ]);
      expect(String(flights[0]?.[0][2]?.transform)).toContain('rotateY(90deg)');
      expect(flights.map(([, options]) => [options.duration, options.delay])).toEqual([
        [420, 0],
        [420, 70],
      ]);
      // The back gives way once edge-on.
      expect(animationsOf('.fly [data-side="back"]')).toHaveLength(2);
      // The discard is drawn as it was until they land.
      const pile = container.querySelector('.surface .pile[data-id="disc:p1"]');
      expect(pile?.classList).toContain('empty');
      for (const animation of started.filter((a) => a.element.matches('.fly'))) {
        animation.finish();
      }
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
      expect(pile?.classList).not.toContain('empty');
    });

    describe('a landscape card going to a portrait pile', () => {
      const encounter = (count: number): PileView => ({
        id: 'enc',
        kind: 'encounter',
        owner: -1,
        x: 0,
        y: 300,
        count,
      });
      const encd = (cards: string[]): PileView => ({
        id: 'encd',
        kind: 'encounterDiscard',
        owner: -1,
        x: 160,
        y: 300,
        count: cards.length,
        cards,
      });
      const scheme = (extra: Partial<TableCard> = {}) =>
        card('ss', { code: SIDE_SCHEME, owner: -1, back: 'encounter', x: 400, y: 100, ...extra });
      const piles = (count: number, discarded: string[] = []) => [
        ...PILES,
        encounter(count),
        encd(discarded),
      ];
      const QUARTER_MS = 420 + 360;

      /** The copy's keyframes and options, and its back layer's. */
      function flightOf(container: HTMLElement) {
        const [[keyframes, options]] = animationsOf('.fly') as [
          [Keyframe[], KeyframeAnimationOptions],
        ];
        const back = container.querySelector<HTMLElement>('.fly [data-side="back"]');
        return { keyframes, options, back, backs: animationsOf('.fly [data-side="back"]') };
      }

      /** Checks a copy turning a quarter on its way to the encounter deck, then face down there. */
      function expectQuarterThenFlip(container: HTMLElement) {
        const { keyframes, options, back, backs } = flightOf(container);
        expect(options.duration).toBe(QUARTER_MS);
        expect(options.easing).toBe('linear');
        expect(keyframes.map((frame) => frame.offset)).toEqual([
          0,
          420 / QUARTER_MS,
          (420 + 180) / QUARTER_MS,
          1,
        ]);
        // On the pile, turned a quarter counter-clockwise; edge-on about the screen's vertical axis.
        expect(String(keyframes[1]?.transform)).toContain('rotateY(0deg) rotate(-90deg)');
        expect(String(keyframes[2]?.transform)).toContain('rotateY(90deg) rotate(-90deg)');
        expect(String(keyframes[3]?.transform)).toContain('rotateY(0deg) rotate(-90deg)');
        // Its long side ends as tall as the pile.
        const card = container.querySelector<HTMLElement>('.fly')!;
        const pile = container.querySelector<HTMLElement>('.surface .pile[data-id="enc"]')!;
        const scale = Number.parseFloat(pile.style.height) / Number.parseFloat(card.style.width);
        expect(String(keyframes[1]?.transform)).toContain(`scale(${scale})`);
        // Its back is a portrait card turned the other way, shown from the flip's edge-on point.
        expect(back?.classList).toContain('upright');
        expect(back?.style.width).toBe(card.style.height);
        expect(back?.style.height).toBe(card.style.width);
        expect(
          backs.map(([frames]) => frames.map((frame) => [frame.offset, frame.opacity])),
        ).toEqual([
          [
            [0, 0],
            [(420 + 180) / QUARTER_MS, 0],
            [(420 + 180) / QUARTER_MS, 1],
            [1, 1],
          ],
        ]);
        expect(backs[0]?.[1]).toMatchObject({ duration: QUARTER_MS, easing: 'linear' });
      }

      it('put on top of the encounter deck turns a quarter on its way, then face down there', async () => {
        const { next, container } = await renderTable(makeView([scheme()], { piles: piles(20) }));

        await next(makeView([], { piles: piles(21) }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(container.querySelector('.fly')?.getAttribute('style')).toContain('left: 400px');
        expectQuarterThenFlip(container);
      });

      it("as the viewer's own drop, from where it was let go", async () => {
        const { next, container } = await renderTable(makeView([scheme()], { piles: piles(20) }));
        interaction.land({
          action: 1,
          element: { kind: 'card', id: 'ss' },
          card: 'ss',
          lifted: ['ss'],
          handOrder: null,
        });
        landGhost(container, 'ss', { x: 250, y: 150 }, { w: 98, h: 70 });

        await next(makeView([], { piles: piles(21) }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expectFromLifted(container.querySelector('.fly'), { x: 250, y: 150 }, { w: 98, h: 70 });
        expectQuarterThenFlip(container);
      });

      it("revealed on its deck, the viewer's own drop back on it flies from its landscape ghost", async () => {
        const revealed = scheme({ onPile: 'enc', x: 0, y: 300 });
        const { next, container } = await renderTable(makeView([revealed], { piles: piles(20) }));
        interaction.land({
          action: 1,
          element: { kind: 'card', id: 'ss' },
          card: 'ss',
          lifted: ['ss'],
          handOrder: null,
        });
        // Picked up, it lies landscape (DragLayer.svelte).
        landGhost(container, 'ss', { x: 250, y: 150 }, { w: 98, h: 70 });

        await next(makeView([], { piles: piles(21) }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expectFromLifted(container.querySelector('.fly'), { x: 250, y: 150 }, { w: 98, h: 70 });
        // It shows as its ghost does, landscape, not as the deck's slot draws it.
        expect(container.querySelector('.fly img.land')).not.toBeNull();
        expect(container.querySelector('.fly .land-in-portrait')).toBeNull();
        expectQuarterThenFlip(container);
      });

      it('revealed on its deck, going back into it from its slot turns no quarter', async () => {
        const revealed = scheme({ onPile: 'enc', x: 0, y: 300 });
        const { next, container } = await renderTable(makeView([revealed], { piles: piles(20) }));

        await next(makeView([], { piles: piles(21) }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        // It leaves the slot as the slot draws it, already turned a quarter.
        expect(container.querySelector('.fly .land-in-portrait')).not.toBeNull();
        const { keyframes, options } = flightOf(container);
        expect(options.duration).toBe(420);
        expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
        expect(String(keyframes.at(-1)?.transform)).toContain(' rotate(0deg) ');
      });

      it('discarded face up only turns a quarter, as the pile shows it', async () => {
        const { next, container } = await renderTable(makeView([scheme()], { piles: piles(20) }));

        await next(makeView([scheme({ zone: 'pile' })], { piles: piles(20, ['ss']) }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        const { keyframes, options, back } = flightOf(container);
        expect(options.duration).toBe(420);
        expect(keyframes.map((frame) => frame.offset)).toEqual([0, 1]);
        expect(String(keyframes[1]?.transform)).toContain('rotateY(0deg) rotate(-90deg)');
        expect(back).toBeNull();
      });

      it('shuffled into the encounter deck: the deck riffles once it has turned over there', async () => {
        const { next, container } = await renderTable(makeView([scheme()], { piles: piles(20) }));

        await next(
          makeView([], {
            piles: piles(21),
            log: [
              START,
              line('shuffled Spider-Man into the encounter deck', { who: 'Sam', color: 1 }),
            ],
          }),
        );
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(bounceDelays('enc')).toEqual([QUARTER_MS]);
      });
    });

    it('a copy turning face down shows its back once edge-on, as one turning face up loses it', async () => {
      const samDiscard = (cards: string[]) => discard(cards, 'disc:p1', 1, 840);
      const alexDeck = (count: number): PileView => ({
        ...PILES[0]!,
        id: 'deck:p0',
        owner: 0,
        x: 480,
        count,
      });
      const { next, container } = await renderTable(
        makeView([card('c4', { x: 40 })], {
          piles: [samDeck(30), alexDeck(20), samDiscard([])],
        }),
      );

      // c4 put on top of Alex's deck, c7 discarded from Sam's.
      await next(
        makeView([card('c7', { owner: 1, zone: 'pile' })], {
          piles: [samDeck(29), alexDeck(21), samDiscard(['c7'])],
        }),
      );
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(2));
      const opacities = animationsOf('.fly [data-side="back"]').map(([frames]) =>
        frames.map((frame) => [frame.offset, frame.opacity]),
      );
      expect(opacities).toEqual([
        // c4, face down from edge-on.
        [
          [0, 0],
          [0.8, 0],
          [0.8, 1],
          [1, 1],
        ],
        // c7, face up from edge-on.
        [
          [0, 1],
          [0.8, 1],
          [0.8, 0],
          [1, 0],
        ],
      ]);
    });

    it("the viewer's own drop on a discard pile flies there from where it was let go", async () => {
      const { next, container } = await renderTable(makeView([card('b', { owner: 1, x: 40 })]));
      interaction.land({
        action: 1,
        element: { kind: 'card', id: 'b' },
        card: 'b',
        lifted: ['b'],
        handOrder: null,
      });
      landGhost(container, 'b', { x: 300, y: 200 });

      await next(
        makeView([card('b', { owner: 1, zone: 'pile' })], {
          piles: [PILES[0]!, discard(['b'])],
        }),
      );
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expectFromLifted(fly, { x: 300, y: 200 });
      // Face up all along.
      expect(showsBack(fly)).toBe(false);
      expect(animationsOf('.fly [data-side="back"]')).toEqual([]);
    });

    describe('to the victory display', () => {
      const villain: PileView[] = [
        ...PILES,
        { id: 'enc', kind: 'encounter', owner: -1, x: 0, y: 300, count: 20 },
        { id: 'vic', kind: 'victory', owner: -1, x: 0, y: 0, count: 0, cards: [] },
      ];
      const withVictory = (cards: string[]) =>
        villain.map((pile) => (pile.id === 'vic' ? { ...pile, count: cards.length, cards } : pile));

      /** Places the victory display's chip, wider than tall, as jsdom lays nothing out. */
      function placeChip(container: Element): void {
        const chip = container.querySelector<HTMLElement>('.surface .chip[data-pile="vic"]')!;
        chip.style.left = '900px';
        chip.style.top = '280px';
        chip.style.width = '40px';
        chip.style.height = '20px';
      }

      it('a card sent there flies to its chip, fading into it', async () => {
        const { next, container } = await renderTable(
          makeView([card('v', { owner: -1, x: 400 })], { piles: withVictory([]) }),
        );
        placeChip(container);

        await next(
          makeView([card('v', { owner: -1, zone: 'pile' })], { piles: withVictory(['v']) }),
        );
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(motion.flights).toMatchObject([
          { kind: 'toPile', pile: 'vic', to: { cx: 920, cy: 290 }, fades: true },
        ]);
        expectFadesIntoChip();
      });

      it('a face-down card sent there turns face up where it lies, then flies to the chip', async () => {
        const { next, container } = await renderTable(
          makeView([card('v', { owner: -1, x: 400, faceDown: true, code: undefined })], {
            piles: withVictory([]),
          }),
        );
        placeChip(container);

        await next(
          makeView([card('v', { owner: -1, zone: 'pile' })], { piles: withVictory(['v']) }),
        );
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(motion.flights).toMatchObject([
          { kind: 'toPile', pile: 'vic', turns: 'up', fades: true },
        ]);
        // A turn as a card turned over on the table (360 ms), then the flight (420 ms).
        const edgeOn = 180 / 780;
        const turned = 360 / 780;
        const [[way, options]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
        expect(options).toMatchObject({ duration: 780, easing: 'linear' });
        // From the card's middle (456, 78.5) to the chip's (920, 290), at the chip's width.
        const pose = (translate: string, scale: number, turn: number) =>
          `perspective(700px) translate(${translate}) scale(${scale}) rotateY(${turn}deg)`;
        expect(way).toEqual([
          { transform: pose('0px, 0px', 1, 0), offset: 0, easing: 'ease-in' },
          { transform: pose('0px, 0px', 1, 90), offset: edgeOn, easing: 'ease-out' },
          {
            transform: pose('0px, 0px', 1, 0),
            offset: turned,
            easing: 'cubic-bezier(.3, .7, .2, 1)',
          },
          // Scaled from 1 down to the chip's width, as the way computes it.
          { transform: pose('464px, 211.5px', 1 + (40 / 112 - 1), 0), offset: 1 },
        ]);
        // Its back gives way to its face once edge-on, in place.
        const [[back, backOptions]] = animationsOf('.fly [data-side="back"]') as [
          [Keyframe[], KeyframeAnimationOptions],
        ];
        expect(back.map((frame) => [frame.offset, frame.opacity])).toEqual([
          [0, 1],
          [edgeOn, 1],
          [edgeOn, 0],
          [1, 0],
        ]);
        expect(backOptions).toMatchObject({ duration: 780, easing: 'linear' });
        // Held up from edge-on until it leaves, then put down on its way.
        const lifts = animationsOf('.fly').filter(([frames]) => frames[0]?.scale !== undefined);
        expect(lifts).toHaveLength(1);
        const [[lift, liftOptions]] = lifts as [[Keyframe[], KeyframeAnimationOptions]];
        expect(lift.map((frame) => [frame.offset, frame.scale])).toEqual([
          [0, '1'],
          [edgeOn, `${LIFT_SCALE}`],
          [turned, `${LIFT_SCALE}`],
          [1, '1'],
        ]);
        expect(liftOptions).toMatchObject({ duration: 780, easing: 'linear' });
        // It fades out over the last 45 % of its flight, once turned.
        const fades = fadesOf('.fly');
        expect(fades).toHaveLength(1);
        const [[fade, fadeOptions]] = fades as [[Keyframe[], KeyframeAnimationOptions]];
        expect(fade).toEqual([
          { opacity: 1 },
          { opacity: 1, offset: turned + 0.55 * (1 - turned) },
          { opacity: 0 },
        ]);
        expect(fadeOptions).toMatchObject({ duration: 780, easing: 'linear' });
      });
    });

    describe('out of a set-aside pile', () => {
      const aside = (cards: string[]): PileView => ({
        id: 'aside:p1',
        kind: 'aside',
        owner: 1,
        x: 0,
        y: 0,
        count: cards.length,
        cards,
      });

      /** Places the chip of Sam's set-aside cards, wider than tall, as jsdom lays nothing out. */
      function placeChip(container: Element): void {
        const chip = container.querySelector<HTMLElement>('.surface .chip[data-pile="aside:p1"]')!;
        chip.style.left = '900px';
        chip.style.top = '280px';
        chip.style.width = '40px';
        chip.style.height = '20px';
      }

      it('a card set aside from the table flies to the chip, fading into it', async () => {
        const { next, container } = await renderTable(
          makeView([card('s', { owner: 1, x: 400 })], { piles: [samDeck(30), aside([])] }),
        );
        placeChip(container);

        await next(
          makeView([card('s', { owner: 1, zone: 'pile' })], { piles: [samDeck(30), aside(['s'])] }),
        );
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(motion.flights).toMatchObject([
          { kind: 'toPile', pile: 'aside:p1', to: { cx: 920, cy: 290 }, fades: true },
        ]);
        expectFadesIntoChip();
      });

      it('a card leaving the chip for its deck does not fade', async () => {
        const { next, container } = await renderTable(
          makeView([card('s', { owner: 1, zone: 'pile' })], { piles: [samDeck(30), aside(['s'])] }),
        );
        placeChip(container);

        await next(makeView([], { piles: [samDeck(31), aside([])] }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(motion.flights).toMatchObject([{ kind: 'toPile', pile: 'deck:p1', fades: false }]);
        expect(fadesOf('.fly')).toEqual([]);
      });

      it('a card put on its deck flies from the chip as a portrait card', async () => {
        const { next, container } = await renderTable(
          makeView([card('s', { owner: 1, zone: 'pile' })], { piles: [samDeck(30), aside(['s'])] }),
        );
        placeChip(container);

        await next(makeView([], { piles: [samDeck(31), aside([])] }));
        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        expect(motion.flights).toMatchObject([
          {
            kind: 'toPile',
            pile: 'deck:p1',
            from: { cx: 920, cy: 290, w: 112, h: 157 },
            quarter: false,
          },
        ]);
      });

      it('a card played onto the table slides from the chip at its own size', async () => {
        const { next, container } = await renderTable(
          makeView([card('s', { owner: 1, zone: 'pile' })], { piles: [samDeck(30), aside(['s'])] }),
        );
        placeChip(container);

        await next(
          makeView([card('s', { owner: 1, x: 400 })], { piles: [samDeck(30), aside([])] }),
        );
        const selector = '.surface .card[data-id="s"]';
        await waitFor(() => expect(animationsOf(selector)).toHaveLength(1));
        const [[keyframes]] = animationsOf(selector) as [[Keyframe[], KeyframeAnimationOptions]];
        // From the chip's middle (920, 290) to the card's, 112 × 157 at 400, 0: unscaled.
        expect(keyframes[0]).toEqual({ translate: '464px 211.5px', scale: '1' });
      });
    });

    it("a card taken into another player's hand slides down and fades where it was", async () => {
      const { next, container } = await renderTable(makeView([card('c2', { x: 100 })]));

      await next(makeView([], { handCounts: [6, 5] }));
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 100px');
      // Seen on the table, it shows its face.
      expect(showsBack(fly)).toBe(false);
      const [[keyframes, options]] = animationsOf('.fly') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes.at(-1)).toMatchObject({ opacity: 0 });
      expect(String(keyframes.at(-1)?.transform)).toContain('40px');
      expect(options.duration).toBe(380);
    });

    it('a face-down card taken into another hand shows its back', async () => {
      const { next, container } = await renderTable(
        makeView([card('c2', { x: 100, faceDown: true, code: undefined })]),
      );

      await next(makeView([], { handCounts: [6, 5] }));
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(showsBack(container.querySelector('.fly'))).toBe(true);
    });

    it('a card another player discards from their hand rises into the discard', async () => {
      const { next, container } = await renderTable(makeView([]));

      await next(
        makeView([card('c5', { zone: 'pile' })], {
          piles: [PILES[0]!, discard(['c5'])],
          handCounts: [4, 5],
        }),
      );
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 720px');
      expect(showsBack(fly)).toBe(false);
      const [[keyframes, options]] = animationsOf('.fly') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes[0]).toMatchObject({ opacity: 0 });
      expect(keyframes.at(-1)).toMatchObject({ transform: 'translate(0, 0) scale(1)', opacity: 1 });
      expect(options.duration).toBe(380);
      // The discard shows the card once it is in.
      const pile = container.querySelector('.surface .pile[data-id="disc:p0"]');
      expect(pile?.classList).toContain('empty');
      started.find((animation) => animation.element === fly)?.finish();
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
      expect(pile?.classList).not.toContain('empty');
    });

    it("a card put on another player's deck out of their hand rises into it on its back", async () => {
      const alexDeck = (count: number): PileView => ({
        ...PILES[0]!,
        id: 'deck:p0',
        owner: 0,
        x: 480,
        count,
      });
      const { next, container } = await renderTable(
        makeView([], { piles: [...PILES, alexDeck(30)] }),
      );

      await next(makeView([], { piles: [...PILES, alexDeck(31)], handCounts: [4, 5] }));
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const fly = container.querySelector('.fly');
      expect(fly?.getAttribute('style')).toContain('left: 480px');
      expect(showsBack(fly)).toBe(true);
    });

    describe("the viewer's own drop of their deck's top on its discard pile", () => {
      const samDiscard = (cards: string[]) => discard(cards, 'disc:p1', 1, 840);
      const art = '.surface .pile[data-id="disc:p1"] .art';

      async function dropOnDiscard() {
        const table = await renderTable(
          makeView([], { piles: [samDeck(30), PILES[1]!, samDiscard([])] }),
        );
        interaction.land({
          action: 1,
          element: { kind: 'pile', id: 'deck:p1' },
          card: null,
          lifted: [],
          handOrder: null,
        });
        // The deck's top is not known: it landed as an unknown card.
        landGhost(table.container, DECK_TOP_ID, { x: 500, y: 200 });
        await table.next(
          makeView([card('c7', { owner: 1, zone: 'pile' })], {
            piles: [samDeck(29), PILES[1]!, samDiscard(['c7'])],
          }),
        );
        return table;
      }

      it('flies there from where it was let go, turning face up on the way', async () => {
        const { container } = await dropOnDiscard();

        await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
        const fly = container.querySelector('.fly');
        expectFromLifted(fly, { x: 500, y: 200 });
        // It leaves on its back, which gives way once edge-on.
        const back = fly?.querySelector<HTMLElement>('[data-side="back"]');
        expect(back).not.toBeNull();
        expect(back?.style.opacity).toBe('');
        const [[keyframes]] = animationsOf('.fly') as [[Keyframe[], KeyframeAnimationOptions]];
        expect(keyframes.map((frame) => frame.offset)).toEqual([0, 0.6, 0.8, 1]);
        expect(animationsOf('.fly [data-side="back"]')).toHaveLength(1);
        // The pile does not turn its top over again.
        expect(animationsOf(art)).toEqual([]);
      });

      it('does not turn with reduced motion', async () => {
        await withReducedMotion(async () => {
          await dropOnDiscard();
          await settle();
          expect(animationsOf(art)).toEqual([]);
          expect(animate).not.toHaveBeenCalled();
        });
      });
    });

    it('with reduced motion none of these play', async () => {
      await withReducedMotion(async () => {
        const samDiscard = (cards: string[]) => discard(cards, 'disc:p1', 1, 840);
        const { next, container } = await renderTable(
          makeView([card('c9', { zone: 'pile' }), card('c2', { x: 100 })], {
            piles: [samDeck(30), discard(['c9']), samDiscard([])],
          }),
        );

        // c9 played from the discard, c2 taken into Alex's hand, c7 discarded from Sam's deck.
        await next(
          makeView([card('c9', { x: 300 }), card('c7', { owner: 1, zone: 'pile' })], {
            piles: [samDeck(29), discard([]), samDiscard(['c7'])],
            handCounts: [6, 5],
          }),
        );
        await settle();
        expect(container.querySelector('.fly')).toBeNull();
        expect(motion.flights).toEqual([]);
        expect(animate).not.toHaveBeenCalled();
      });
    });
  });

  it('an animation waiting for the redraw does not play after a stop', async () => {
    const view = makeView([card('a', { x: 0 })]);
    const { container } = render(Table, { session: fakeSession(), view });
    await settle();

    // As an unmount or a long gap stops everything while a view is being drawn.
    const playing = motion.animate(
      container,
      [{ kind: 'glow', id: 'a', color: 0 }],
      { before: view.table, after: view.table },
      1,
    );
    motion.stop();
    await playing;
    await settle();
    expect(animate).not.toHaveBeenCalled();
  });

  it('nothing animates across a reconnection gap over 2 s', async () => {
    const session = { ...fakeSession(), viewGap: 2500 };
    const { rerender } = render(Table, {
      session,
      view: makeView([card('a', { x: 0 })]),
    });
    await settle();

    await rerender({ session, view: makeView([card('a', { x: 200 })]) });
    await settle();
    expect(animate).not.toHaveBeenCalled();
  });

  it('a chosen stage card turns in', async () => {
    const session = fakeSession();
    const stage = (current: string): Stage[] => [
      { key: 'villain', label: 'Villain', current, cards: ['v1', 'v2'] },
    ];
    const { rerender } = render(Table, {
      session,
      view: makeView(
        [card('v1', { owner: -1, x: 200 }), card('v2', { owner: -1, zone: 'stage' })],
        { stages: stage('v1') },
      ),
    });
    await settle();

    const next = makeView(
      [card('v1', { owner: -1, zone: 'stage' }), card('v2', { owner: -1, x: 200 })],
      { stages: stage('v2'), log: [START, line('replaced the villain Rhino with Rhino')] },
    );
    await rerender({ session, view: next });
    // The turn, its lift, and the glow.
    await waitFor(() => expect(animationsOf('.surface .card[data-id="v2"]')).toHaveLength(3));
    const [[keyframes, options]] = animationsOf('.surface .card[data-id="v2"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes).toEqual([
      { transform: 'perspective(700px) rotateY(90deg) scale(1.05)' },
      { transform: 'none' },
    ]);
    expect(options.duration).toBe(420);
    // Put down: held up as it turns in, it settles flat, on the scale property and its shade's offset.
    const [, [lift, liftOptions]] = animationsOf('.surface .card[data-id="v2"]') as [
      unknown,
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(lift).toEqual([{ scale: '1.06', easing: 'ease-in' }, { scale: '1' }]);
    expect(liftOptions.duration).toBe(420);
    const [[shade]] = animationsOf('.surface .card[data-id="v2"] > .shade') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(shade).toEqual([{ translate: '5px 5px', easing: 'ease-in' }, { translate: '0px 0px' }]);
  });

  it('an exhausted stage card turns in and keeps its tilt', async () => {
    const tilt = 'matrix(0.97, 0.26, -0.26, 0.97, 0, 0)';
    const computed = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) =>
        element.matches('.card.exhausted')
          ? ({ transform: tilt } as CSSStyleDeclaration)
          : computed(element, pseudo),
      );
    try {
      const session = fakeSession();
      const stages: Stage[] = [{ key: 'villain', label: 'Villain', current: 'v1', cards: ['v1'] }];
      const { rerender } = render(Table, {
        session,
        view: makeView([card('v1', { owner: -1, exhausted: true })], { stages }),
      });
      await settle();

      const next = makeView([card('v1', { owner: -1, exhausted: true, face: 1 })], {
        stages,
        log: [START, line('turned the villain to Rhino (stage II)')],
      });
      await rerender({ session, view: next });
      await waitFor(() => expect(animationsOf('.surface .card[data-id="v1"]')).toHaveLength(3));
      const [[keyframes]] = animationsOf('.surface .card[data-id="v1"]') as [
        [Keyframe[], KeyframeAnimationOptions],
      ];
      expect(keyframes).toEqual([
        { transform: `perspective(700px) rotateY(90deg) scale(1.05) ${tilt}` },
        { transform: tilt },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('a card turned over turns away on its old side, then back on its new one', async () => {
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { x: 40 })]),
    });
    await settle();

    const next = makeView([card('a', { x: 40, faceDown: true, code: undefined })], {
      log: [START, line('flipped Spider-Man face down')],
    });
    await rerender({ session, view: next });

    const flat = 'perspective(700px) rotateY(0deg)';
    const edgeOn = 'perspective(700px) rotateY(90deg)';
    await waitFor(() =>
      expect(animationsOf('.surface .card[data-id="a"]').map(([frames]) => frames)).toContainEqual([
        { transform: edgeOn, offset: 0 },
        { transform: edgeOn, offset: 0.5, easing: 'ease-out' },
        { transform: flat, offset: 1 },
      ]),
    );
    // The old side is a copy that answers to nothing, turning away to edge-on.
    const copy = container.querySelector<HTMLElement>('.surface .card[aria-hidden="true"]');
    expect(copy).not.toBeNull();
    expect(copy?.hasAttribute('data-id')).toBe(false);
    expect(copy?.style.pointerEvents).toBe('none');
    const [[away]] = animationsOf('.surface .card[aria-hidden="true"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(away).toEqual([{ transform: flat }, { transform: edgeOn }]);

    // Lifted as it turns, highest edge-on, on the scale property and its shade's offset: the old
    // side rising to edge-on, the card coming back down flat from there.
    const scales = (selector: string) =>
      animationsOf(selector).filter(([frames]) => frames[0]?.scale !== undefined);
    expect(scales('.surface .card[data-id="a"]')).toEqual([
      [
        [
          { scale: '1', easing: 'ease-out' },
          { scale: '1.06', offset: 0.5, easing: 'ease-in' },
          { scale: '1' },
        ],
        { duration: 360 },
      ],
    ]);
    expect(animationsOf('.surface .card[data-id="a"] > .shade')).toEqual([
      [
        [
          { translate: '0px 0px', easing: 'ease-out' },
          { translate: '5px 5px', offset: 0.5, easing: 'ease-in' },
          { translate: '0px 0px' },
        ],
        { duration: 360 },
      ],
    ]);
    expect(scales('.surface .card[aria-hidden="true"]')).toEqual([
      [
        [{ scale: '1', easing: 'ease-out' }, { scale: '1.06' }],
        { duration: 180, fill: 'forwards' },
      ],
    ]);
    expect(animationsOf('.surface .card[aria-hidden="true"] > .shade')).toHaveLength(1);

    // A stop takes the copy away.
    motion.stop();
    expect(container.querySelector('.surface .card[aria-hidden="true"]')).toBeNull();
  });

  /** Stubs the computed transform of the elements that match selector: jsdom computes none. */
  function stubTransform(selector: string, transform: string) {
    const computed = window.getComputedStyle;
    return vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) =>
        element.matches(selector)
          ? ({ transform } as CSSStyleDeclaration)
          : computed(element, pseudo),
      );
  }

  it('a card taken face down into the hand turns face up about its middle, with no old side', async () => {
    // The hand card's place on its fan (translateX), as computed: about the card's own middle
    // (its transform-origin, Hand.svelte), it comes after the turn, as a table card's tilt does.
    const shift = 'matrix(1, 0, 0, 1, -70, 0)';
    const spy = stubTransform('.hand .hcard', shift);
    try {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('d', { owner: 1, x: 300, faceDown: true, code: undefined })], {
          hands: { p1: [] },
        }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([card('d', { owner: 1, zone: 'hand' })], {
          hands: { p1: ['d'] },
          log: [START, line('took a card into hand', { who: 'Sam', color: 1 })],
        }),
      });
      const frames = () =>
        animationsOf('.hand .hcard[data-id="d"]').map(([keyframes]) => keyframes);
      await waitFor(() =>
        expect(frames()).toContainEqual([
          { transform: `perspective(700px) rotateY(90deg) ${shift}` },
          { transform: `perspective(700px) rotateY(0deg) ${shift}` },
        ]),
      );
      // The table card's old side is not copied into the hand.
      expect(container.querySelector('[aria-hidden="true"].card')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('a card taken face down into the hand under a new id slides there from the table and turns', async () => {
    const session = fakeSession();
    const { rerender } = render(Table, {
      session,
      view: makeView([card('d', { owner: 1, x: 300, faceDown: true, code: undefined })], {
        hands: { p1: [] },
      }),
    });
    await settle();

    // The server gave the card a new id on its way (renamedOnTheWay in internal/game/ids.go).
    await rerender({
      session,
      view: makeView([card('n', { owner: 1, zone: 'hand' })], {
        hands: { p1: ['n'] },
        log: [START, line('took a card into hand', { who: 'Sam', color: 1 })],
      }),
    });
    const frames = () => animationsOf('.hand .hcard[data-id="n"]').map(([keyframes]) => keyframes);
    await waitFor(() =>
      expect(frames()).toContainEqual([
        expect.objectContaining({ translate: expect.stringMatching(/px/) }),
        expect.objectContaining({ translate: '0px 0px' }),
      ]),
    );
    expect(frames()).toContainEqual([
      { transform: expect.stringContaining('rotateY(90deg)') },
      { transform: expect.stringContaining('rotateY(0deg)') },
    ]);
  });

  it('an exhausted card turned over on the table keeps its tilt after the turn', async () => {
    const tilt = 'matrix(0.97, 0.26, -0.26, 0.97, 0, 0)';
    const spy = stubTransform('.card.exhausted', tilt);
    try {
      const session = fakeSession();
      const { rerender } = render(Table, {
        session,
        view: makeView([card('a', { x: 40, exhausted: true })]),
      });
      await settle();

      await rerender({
        session,
        view: makeView([card('a', { x: 40, exhausted: true, faceDown: true, code: undefined })], {
          log: [START, line('turned Spider-Man face down')],
        }),
      });
      await waitFor(() =>
        expect(
          animationsOf('.surface .card[data-id="a"]').map(([frames]) => frames),
        ).toContainEqual([
          { transform: `perspective(700px) rotateY(90deg) ${tilt}`, offset: 0 },
          {
            transform: `perspective(700px) rotateY(90deg) ${tilt}`,
            offset: 0.5,
            easing: 'ease-out',
          },
          { transform: `perspective(700px) rotateY(0deg) ${tilt}`, offset: 1 },
        ]),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('a card come face up from a deck onto the table slides out of it and turns in', async () => {
    // The server never lists a deck's cards: the card shows up on the table as the deck shrinks.
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();

    const deck = PILES.map((pile) => (pile.id === 'deck:p1' ? { ...pile, count: 29 } : pile));
    await rerender({
      session,
      view: makeView([card('a', { owner: 1, x: 300 })], {
        piles: deck,
        log: [START, line('played Spider-Man')],
      }),
    });
    const frames = () =>
      animationsOf('.surface .card[data-id="a"]').map(([keyframes]) => keyframes);
    await waitFor(() =>
      expect(frames()).toContainEqual([
        { transform: 'perspective(700px) rotateY(90deg)' },
        { transform: 'perspective(700px) rotateY(0deg)' },
      ]),
    );
    // Its slide out of the deck, at x 600, plays with the turn: translate and scale, not transform.
    expect(frames()).toContainEqual([
      { translate: expect.stringMatching(/^3\d\dpx /), scale: expect.any(String) },
      { translate: '0px 0px', scale: '1' },
    ]);
    // Its slide plays on the scale property: the turn lifts it not.
    expect(
      frames()
        .flat()
        .some((frame) => frame.scale === '1.06'),
    ).toBe(false);
    expect(animationsOf('.surface .card[data-id="a"] > .shade')).toEqual([]);
  });

  it('a glow plays on through an unrelated view', async () => {
    const session = fakeSession();
    const cards = (tokens: number, bX: number) => [
      card('a', { tokens: { dmg: tokens } }),
      card('b', { x: bX, y: 160 }),
    ];
    const { rerender, container } = render(Table, { session, view: makeView(cards(0, 300)) });
    await settle();
    const damaged = [START, line('added 1 damage to Spider-Man')];
    await rerender({ session, view: makeView(cards(1, 300), { log: damaged }) });
    const cardA = container.querySelector('.surface .card[data-id="a"]')!;
    await waitFor(() => expect(runningOn(cardA)).toHaveLength(1));

    // Another player moves another card.
    await rerender({ session, view: makeView(cards(1, 500), { log: damaged }) });
    await waitFor(() => expect(animationsOf('.surface .card[data-id="b"]')).toHaveLength(1));
    expect(runningOn(cardA)).toHaveLength(1);
  });

  it('a flight goes on through a second view', async () => {
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { x: 40 })]),
    });
    await settle();
    const discard = { ...PILES[1]!, count: 1, cards: ['a'] };
    const discarded = [START, line('discarded Spider-Man')];
    const after = [card('a', { zone: 'pile' })];
    await rerender({
      session,
      view: makeView(after, { piles: [PILES[0]!, discard], log: discarded }),
    });
    await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());

    // Sam draws a card meanwhile.
    const drew = [...discarded, line('drew 1 card', { who: 'Sam', color: 1 })];
    await rerender({
      session,
      view: makeView(after, { piles: [{ ...PILES[0]!, count: 29 }, discard], log: drew }),
    });
    await settle();
    expect(container.querySelector('.fly')).not.toBeNull();
    expect(container.querySelector('.surface .pile[data-id="disc:p0"]')?.classList).toContain(
      'empty',
    );
  });

  it('a card moved again mid-move starts again from where it shows', async () => {
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { x: 0 })]),
    });
    await settle();
    await rerender({ session, view: makeView([card('a', { x: 200 })]) });
    const cardA = container.querySelector('.surface .card[data-id="a"]')!;
    await waitFor(() => expect(runningOn(cardA)).toHaveLength(1));
    const first = runningOn(cardA)[0]!;

    // Half-way, it shows at x 100: from there to 300.
    await rerender({ session, view: makeView([card('a', { x: 300 })]) });
    await waitFor(() => expect(first.cancelled).toBe(true));
    await waitFor(() => expect(runningOn(cardA)).toHaveLength(1));
    expect(runningOn(cardA)[0]?.keyframes[0]).toMatchObject({ translate: '-200px 0px' });
  });

  describe('an exhausted or readied card', () => {
    const cardA = '.surface .card[data-id="a"]';

    /** The tilts started on the card, as [keyframes, options]: they play its rotate property. */
    function tiltsOfA(): [Keyframe[], KeyframeAnimationOptions][] {
      return animationsOf(cardA).filter(([keyframes]) => keyframes[0]?.rotate !== undefined);
    }

    it('tilts from upright to its new angle as it is exhausted', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, { session, view: makeView([card('a', { x: 40 })]) });
      await settle();

      await rerender({
        session,
        view: makeView([card('a', { x: 40, exhausted: true })], {
          log: [START, line('exhausted Spider-Man')],
        }),
      });
      await waitFor(() => expect(tiltsOfA()).toHaveLength(1));
      const [[keyframes, options]] = tiltsOfA() as [[Keyframe[], KeyframeAnimationOptions]];
      // The card is drawn tilted already: the offset turns it back upright, then plays down to nothing.
      expect(keyframes).toEqual([{ rotate: '-15deg' }, { rotate: '0deg' }]);
      expect(options).toMatchObject({ duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    });

    it('tilts from its old angle back upright as it is readied', async () => {
      const session = fakeSession();
      const { rerender } = render(Table, {
        session,
        view: makeView([card('a', { x: 40, exhausted: true })]),
      });
      await settle();

      await rerender({
        session,
        view: makeView([card('a', { x: 40 })], { log: [START, line('readied Spider-Man')] }),
      });
      await waitFor(() => expect(tiltsOfA()).toHaveLength(1));
      expect(tiltsOfA()[0]?.[0]).toEqual([{ rotate: '15deg' }, { rotate: '0deg' }]);
    });

    it('caught mid-tilt, tilts back from the angle it shows', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('a', { x: 40 })]),
      });
      await settle();
      await rerender({
        session,
        view: makeView([card('a', { x: 40, exhausted: true })], {
          log: [START, line('exhausted Spider-Man')],
        }),
      });
      await waitFor(() => expect(tiltsOfA()).toHaveLength(1));
      const first = started.find((animation) => animation.keyframes[0]?.rotate !== undefined)!;

      // Half-way, it shows at 7.5°: from there back upright.
      const element = container.querySelector(cardA)!;
      const computed = window.getComputedStyle;
      const spy = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation((target, pseudo) =>
          target === element
            ? ({ rotate: '-7.5deg' } as CSSStyleDeclaration)
            : computed(target, pseudo),
        );
      try {
        await rerender({
          session,
          view: makeView([card('a', { x: 40 })], {
            log: [START, line('exhausted Spider-Man'), line('readied Spider-Man')],
          }),
        });
        await waitFor(() => expect(tiltsOfA()).toHaveLength(2));
      } finally {
        spy.mockRestore();
      }
      expect(first.cancelled).toBe(true);
      expect(tiltsOfA()[1]?.[0]).toEqual([{ rotate: '7.5deg' }, { rotate: '0deg' }]);
    });

    it('does not tilt with reduced motion, it only glows', async () => {
      await withReducedMotion(async () => {
        const session = fakeSession();
        const { rerender } = render(Table, { session, view: makeView([card('a', { x: 40 })]) });
        await settle();

        await rerender({
          session,
          view: makeView([card('a', { x: 40, exhausted: true })], {
            log: [START, line('exhausted Spider-Man')],
          }),
        });
        await waitFor(() => expect(animationsOf(cardA)).toHaveLength(1));
        expect(tiltsOfA()).toEqual([]);
      });
    });
  });

  describe("a pile's count", () => {
    const alexDeck = (count: number): PileView => ({
      id: 'deck:p0',
      kind: 'deck',
      owner: 0,
      x: 480,
      y: 0,
      count,
    });
    const countOf = (container: HTMLElement, id: string) =>
      container.querySelector<HTMLElement>(`.surface .pile[data-id="${CSS.escape(id)}"] .count`);
    /** Lands every copy flying now. */
    const landFlights = () => {
      for (const animation of started.filter((a) => a.element.matches('.fly'))) {
        animation.finish();
      }
    };

    it("hides while another player's draw leaves the deck, still showing the count it had", async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();
      expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed');

      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      const count = countOf(container, 'deck:p0');
      expect(count?.classList).toContain('hushed');
      expect(count?.textContent).toBe('30');
      // A pile the draw does not touch keeps its count in sight.
      expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed');

      // Back with the new count once the copy has left.
      landFlights();
      await waitFor(() => expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p0')?.textContent).toBe('29');
    });

    it("hides while the viewer's own draw flies into the hand", async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { hands: { p1: [] } }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([card('d', { owner: 1, zone: 'hand' })], {
          piles: [{ ...PILES[0]!, count: 29 }, PILES[1]!],
          hands: { p1: ['d'] },
          log: [START, line('drew 1 card', { who: 'Sam', color: 1 })],
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(countOf(container, 'deck:p1')?.classList).toContain('hushed');
      expect(countOf(container, 'deck:p1')?.textContent).toBe('30');

      landFlights();
      await waitFor(() => expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p1')?.textContent).toBe('29');
    });

    it('stays hidden through two quick draws, until the later one has left', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();

      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(1));
      const [first] = started.filter((a) => a.element.matches('.fly'));
      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(28)], handCounts: [7, 5] }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(2));

      first?.finish();
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(1));
      await settle();
      expect(countOf(container, 'deck:p0')?.classList).toContain('hushed');
      expect(countOf(container, 'deck:p0')?.textContent).toBe('30');

      landFlights();
      await waitFor(() => expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p0')?.textContent).toBe('28');
    });

    it('hides on both piles of a card flying from one to the other', async () => {
      const session = fakeSession();
      const samDiscard = (cards: string[]): PileView => ({
        id: 'disc:p1',
        kind: 'discard',
        owner: 1,
        x: 840,
        y: 0,
        count: cards.length,
        cards,
      });
      const deck = (count: number): PileView => ({ ...PILES[0]!, count });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('c6', { owner: 1, zone: 'pile' })], {
          piles: [deck(30), PILES[1]!, samDiscard(['c6'])],
        }),
      });
      await settle();

      await rerender({
        session,
        view: makeView(
          [card('c6', { owner: 1, zone: 'pile' }), card('c7', { owner: 1, zone: 'pile' })],
          {
            piles: [deck(29), PILES[1]!, samDiscard(['c6', 'c7'])],
          },
        ),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(countOf(container, 'deck:p1')?.classList).toContain('hushed');
      expect(countOf(container, 'deck:p1')?.textContent).toBe('30');
      // The discard is drawn as it was, its count with it.
      expect(countOf(container, 'disc:p1')?.classList).toContain('hushed');
      expect(countOf(container, 'disc:p1')?.textContent).toBe('1');

      landFlights();
      await waitFor(() => expect(countOf(container, 'disc:p1')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'disc:p1')?.textContent).toBe('2');
      expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed');
      expect(countOf(container, 'deck:p1')?.textContent).toBe('29');
    });

    it('hides while the pile riffles', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: makeView([]) });
      await settle();

      await rerender({
        session,
        view: makeView([], { log: [START, line('shuffled their deck', { who: 'Sam', color: 1 })] }),
      });
      await waitFor(() =>
        expect(animationsOf('.surface .pile[data-id="deck:p1"]')).toHaveLength(2),
      );
      expect(countOf(container, 'deck:p1')?.classList).toContain('hushed');

      for (const animation of started) {
        animation.finish();
      }
      await waitFor(() => expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed'));
    });

    it('shows again when a newer view stops the flight', async () => {
      const session = fakeSession();
      const deck = { ...PILES[0]!, count: 29 };
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { hands: { p1: [] } }),
      });
      await settle();
      await rerender({
        session,
        view: makeView([card('d', { owner: 1, zone: 'hand' })], {
          piles: [deck, PILES[1]!],
          hands: { p1: ['d'] },
          log: [START, line('drew 1 card', { who: 'Sam', color: 1 })],
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(countOf(container, 'deck:p1')?.classList).toContain('hushed');

      // Played at once, before its copy lands.
      await rerender({
        session,
        view: makeView([card('d', { owner: 1, x: 300 })], {
          piles: [deck, PILES[1]!],
          hands: { p1: [] },
        }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).toBeNull());
      await waitFor(() => expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p1')?.textContent).toBe('29');
    });

    it('shows again after a stop', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();
      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await waitFor(() => expect(countOf(container, 'deck:p0')?.classList).toContain('hushed'));

      motion.stop();
      await waitFor(() => expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p0')?.textContent).toBe('29');
    });

    it('shows the latest count when a newer view comes before the first one is drawn', async () => {
      const session = fakeSession();
      const { rerender, container } = render(Table, {
        session,
        view: makeView([], { piles: [...PILES, alexDeck(30)] }),
      });
      await settle();

      // Two draws in one go: the first view gives way to the second before it is drawn.
      void rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(29)], handCounts: [6, 5] }),
      });
      await rerender({
        session,
        view: makeView([], { piles: [...PILES, alexDeck(28)], handCounts: [7, 5] }),
      });
      await waitFor(() => expect(container.querySelectorAll('.fly')).toHaveLength(1));
      expect(countOf(container, 'deck:p0')?.classList).toContain('hushed');

      landFlights();
      await waitFor(() => expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'deck:p0')?.textContent).toBe('28');
    });

    describe('of a pile a card is played from onto the table', () => {
      const host = card('host', { owner: 1, x: 400, y: 100, z: 3 });
      const discard = (cards: string[]): PileView => ({ ...PILES[1]!, count: cards.length, cards });
      const cards = [host, card('c8', { zone: 'pile' }), card('c9', { zone: 'pile' })];
      const placed = '.surface .card[data-id="c9"]';

      it('hides while the card slides out of it', async () => {
        const session = fakeSession();
        const { rerender, container } = render(Table, {
          session,
          view: makeView(cards, { piles: [PILES[0]!, discard(['c8', 'c9'])] }),
        });
        await settle();

        await rerender({
          session,
          view: makeView([host, card('c8', { zone: 'pile' }), card('c9', { x: 300, y: 100 })], {
            piles: [PILES[0]!, discard(['c8'])],
            log: [START, line('played Spider-Man')],
          }),
        });
        await waitFor(() => expect(animationsOf(placed)).toHaveLength(1));
        expect(countOf(container, 'disc:p0')?.classList).toContain('hushed');
        expect(countOf(container, 'disc:p0')?.getAttribute('aria-hidden')).toBe('true');
        expect(countOf(container, 'disc:p0')?.textContent).toBe('2');

        for (const animation of started) {
          animation.finish();
        }
        await waitFor(() =>
          expect(countOf(container, 'disc:p0')?.classList).not.toContain('hushed'),
        );
        expect(countOf(container, 'disc:p0')?.hasAttribute('aria-hidden')).toBe(false);
        expect(countOf(container, 'disc:p0')?.textContent).toBe('1');
      });

      it("stays in sight for the viewer's own drop tucked into a stack, which slides from its ghost", async () => {
        const session = fakeSession();
        const { rerender, container } = render(Table, {
          session,
          view: makeView(cards, { piles: [PILES[0]!, discard(['c8', 'c9'])] }),
        });
        await settle();
        interaction.land({
          action: 1,
          element: { kind: 'pile', id: 'disc:p0' },
          card: 'c9',
          lifted: [],
          tucks: true,
          handOrder: null,
        });

        await rerender({
          session,
          view: makeView(
            [
              { ...host, z: 9 },
              card('c8', { zone: 'pile' }),
              card('c9', { x: 410, y: 120, z: 8, parent: 'host' }),
            ],
            { piles: [PILES[0]!, discard(['c8'])] },
          ),
        });
        // As DragLayer does once the view shows the drop.
        interaction.endLanding();
        await waitFor(() => expect(animationsOf(placed)).not.toHaveLength(0));
        expect(countOf(container, 'disc:p0')?.classList).not.toContain('hushed');
        expect(countOf(container, 'disc:p0')?.textContent).toBe('1');
      });
    });

    it("hides only on the pile the viewer's own drop of a pile's top flies to", async () => {
      const session = fakeSession();
      const samDeck = (count: number): PileView => ({ ...PILES[0]!, count });
      const samDiscard = (cards: string[]): PileView => ({
        id: 'disc:p1',
        kind: 'discard',
        owner: 1,
        x: 840,
        y: 0,
        count: cards.length,
        cards,
      });
      const { rerender, container } = render(Table, {
        session,
        view: makeView([card('c6', { owner: 1, zone: 'pile' })], {
          piles: [samDeck(30), PILES[1]!, samDiscard(['c6'])],
        }),
      });
      await settle();
      interaction.land({
        action: 1,
        element: { kind: 'pile', id: 'deck:p1' },
        card: null,
        lifted: [],
        handOrder: null,
      });

      await rerender({
        session,
        view: makeView(
          [card('c6', { owner: 1, zone: 'pile' }), card('c7', { owner: 1, zone: 'pile' })],
          { piles: [samDeck(29), PILES[1]!, samDiscard(['c6', 'c7'])] },
        ),
      });
      // As DragLayer does once the view shows the drop.
      interaction.endLanding();
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(countOf(container, 'disc:p1')?.classList).toContain('hushed');
      expect(countOf(container, 'disc:p1')?.textContent).toBe('1');
      // The deck counted the card out as it was dragged off it: it shows its new count at once.
      expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed');
      expect(countOf(container, 'deck:p1')?.textContent).toBe('29');

      landFlights();
      await waitFor(() => expect(countOf(container, 'disc:p1')?.classList).not.toContain('hushed'));
      expect(countOf(container, 'disc:p1')?.textContent).toBe('2');
    });

    it('shows at once without Web Animations, where nothing plays', async () => {
      Element.prototype.animate = undefined as unknown as typeof Element.prototype.animate;
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: makeView([]) });
      await settle();

      await rerender({
        session,
        view: makeView([], { log: [START, line('shuffled their deck', { who: 'Sam', color: 1 })] }),
      });
      // Not even for a moment, as the view is drawn.
      expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed');
      await settle();
      expect(countOf(container, 'deck:p1')?.classList).not.toContain('hushed');
    });

    it('stays in sight with reduced motion', async () => {
      await withReducedMotion(async () => {
        const session = fakeSession();
        const { rerender, container } = render(Table, {
          session,
          view: makeView([], { piles: [...PILES, alexDeck(30)] }),
        });
        await settle();

        await rerender({
          session,
          view: makeView([], {
            piles: [...PILES, alexDeck(29)],
            handCounts: [6, 5],
            log: [START, line('shuffled their deck')],
          }),
        });
        expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed');
        await settle();
        expect(countOf(container, 'deck:p0')?.classList).not.toContain('hushed');
        expect(countOf(container, 'deck:p0')?.textContent).toBe('29');
      });
    });
  });
});

describe('the hover under a pointer at rest', () => {
  it('goes to the hand card that slid under the pointer, once its slide has ended', async () => {
    const session = fakeSession();
    const inHand = (id: string) => card(id, { owner: 1, zone: 'hand' });
    const { rerender, container } = render(Table, {
      session,
      view: makeView([inHand('a'), inHand('b')], { hands: { p1: ['a', 'b'] } }),
    });
    await settle();
    const hcard = (id: string) =>
      container.querySelector<HTMLElement>(`.hand .hcard[data-id="${id}"]`)!;
    await fireEvent.pointerMove(window, { clientX: 40, clientY: 500 });
    await fireEvent.pointerEnter(hcard('a'), { clientX: 40, clientY: 500 });
    expect(interaction.hovered).toEqual({ kind: 'hand', id: 'a' });

    // B slides into A's slot with a CSS transition, which motion does not play: it is under the
    // pointer only once there.
    let slid = false;
    let endSlide = () => {};
    const slide = {
      finished: new Promise<void>((resolve) => {
        endSlide = () => {
          slid = true;
          resolve();
        };
      }),
    };
    const hand = container.querySelector<HTMLElement>('.hand')!;
    hand.getAnimations = (() => (slid ? [] : [slide])) as unknown as typeof hand.getAnimations;
    const underPointer = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => (slid ? hcard('b').querySelector('.hit') : null));

    try {
      // Sam plays A.
      await rerender({
        session,
        view: makeView([card('a', { owner: 1, x: 300 }), inHand('b')], { hands: { p1: ['b'] } }),
      });
      await settle();
      for (const animation of started) {
        animation.finish();
      }
      await settle();
      expect(interaction.hovered).toBeNull();

      endSlide();
      await waitFor(() => expect(interaction.hovered).toEqual({ kind: 'hand', id: 'b' }));
    } finally {
      underPointer.mockRestore();
    }
  });

  /** Two-faced cards: a hero, and a main scheme. */
  const twoFaced = infoFrom({
    '01002': [{ name: 'Peter Parker' }, { name: 'Spider-Man' }],
    '01097': [
      { name: 'Scheme 1A', size: 'land' },
      { name: 'Scheme 1B', size: 'land' },
    ],
  });

  /** The pointer comes to rest on a table card, entering it. */
  async function restOn(element: HTMLElement): Promise<void> {
    await fireEvent.pointerMove(window, { clientX: 50, clientY: 50 });
    await fireEvent.pointerEnter(element, { clientX: 50, clientY: 50 });
    expect(interaction.hovered).toEqual({ kind: 'card', id: element.dataset.id });
    expect(interaction.previewed).toEqual({ kind: 'card', id: element.dataset.id });
  }

  /** The hit-test under the pointer: nothing while the card turns edge-on, the card once flat. */
  function hitTest(placed: () => HTMLElement) {
    const state = { flat: false };
    const spy = vi
      .spyOn(document, 'elementFromPoint')
      .mockImplementation(() => (state.flat ? placed() : null));
    return { state, restore: () => spy.mockRestore() };
  }

  it('stays on the card turned over under it, out of reach while edge-on', async () => {
    vi.mocked(knownCard).mockImplementation(twoFaced);
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { code: '01002', x: 40 })]),
    });
    await settle();
    const placed = () => container.querySelector<HTMLElement>('.surface .card[data-id="a"]')!;
    await restOn(placed());
    const underPointer = hitTest(placed);

    try {
      await rerender({
        session,
        view: makeView([card('a', { code: '01002', x: 40, face: 1 })], {
          log: [START, line('flipped Peter Parker')],
        }),
      });
      await waitFor(() => expect(runningOn(placed())).not.toHaveLength(0));
      await settle();
      expect(interaction.hovered).toEqual({ kind: 'card', id: 'a' });
      expect(interaction.previewed).toEqual({ kind: 'card', id: 'a' });
      const preview = screen.getByLabelText('Card preview');
      expect(within(preview).getByRole('img', { name: 'Spider-Man' })).toBeTruthy();

      underPointer.state.flat = true;
      for (const animation of started) {
        animation.finish();
      }
      await settle();
      expect(interaction.hovered).toEqual({ kind: 'card', id: 'a' });
      expect(interaction.previewed).toEqual({ kind: 'card', id: 'a' });
    } finally {
      underPointer.restore();
    }
  });

  it('stays on the stage card turned in under it, out of reach while edge-on', async () => {
    vi.mocked(knownCard).mockImplementation(twoFaced);
    const session = fakeSession();
    const stages: Stage[] = [{ key: 'main', label: 'Main scheme', current: 'm', cards: ['m'] }];
    const scheme = (face: number) => card('m', { code: '01097', owner: -1, back: 'villain', face });
    const { rerender, container } = render(Table, {
      session,
      view: makeView([scheme(0)], { stages }),
    });
    await settle();
    const placed = () => container.querySelector<HTMLElement>('.surface .card[data-id="m"]')!;
    await restOn(placed());
    const underPointer = hitTest(placed);

    try {
      await rerender({
        session,
        view: makeView([scheme(1)], { stages, log: [START, line('turned the main scheme')] }),
      });
      await waitFor(() => expect(runningOn(placed())).not.toHaveLength(0));
      await settle();
      expect(interaction.hovered).toEqual({ kind: 'card', id: 'm' });
      expect(interaction.previewed).toEqual({ kind: 'card', id: 'm' });
      const preview = screen.getByLabelText('Card preview');
      expect(within(preview).getByRole('img', { name: 'Scheme 1B' })).toBeTruthy();

      underPointer.state.flat = true;
      for (const animation of started) {
        animation.finish();
      }
      await settle();
      expect(interaction.hovered).toEqual({ kind: 'card', id: 'm' });
    } finally {
      underPointer.restore();
    }
  });

  // The browser leaves the card as it goes edge-on under the resting pointer. A card that does
  // not turn still leaves once the hover has lingered (Table.hover.test.ts).
  it('stays on the card turned over under it as it goes edge-on and the pointer leaves it', async () => {
    vi.mocked(knownCard).mockImplementation(twoFaced);
    const session = fakeSession();
    const { rerender, container } = render(Table, {
      session,
      view: makeView([card('a', { code: '01002', x: 40 })]),
    });
    await settle();
    const placed = () => container.querySelector<HTMLElement>('.surface .card[data-id="a"]')!;
    await restOn(placed());
    const underPointer = hitTest(placed);

    try {
      await rerender({
        session,
        view: makeView([card('a', { code: '01002', x: 40, face: 1 })], {
          log: [START, line('flipped Peter Parker')],
        }),
      });
      await waitFor(() => expect(runningOn(placed())).not.toHaveLength(0));
      vi.useFakeTimers();
      await fireEvent.pointerLeave(placed(), { clientX: 50, clientY: 50 });
      await vi.advanceTimersByTimeAsync(LINGER_MS * 2);
      expect(interaction.hovered).toEqual({ kind: 'card', id: 'a' });
      expect(interaction.previewed).toEqual({ kind: 'card', id: 'a' });
    } finally {
      vi.useRealTimers();
      underPointer.restore();
    }
  });
});
