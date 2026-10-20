import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { motion } from './motion.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Area,
  CardView as TableCard,
  LogView,
  PileView,
  Point,
  PresenceState,
  Stage,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

function infoOf(code: string): CardInfo {
  const face = { name: 'Spider-Man', type: 'hero', size: 'std' as const, images: [`${code}.png`] };
  return { card: { code, faces: [face], back: 'player', quantity: 1 }, face: 0 };
}

function card(id: string, extra: Partial<TableCard>): TableCard {
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
    hands?: Partial<Record<Area, string[]>>;
    /** How many cards Alex and Sam hold. */
    handCounts?: [number, number];
  } = {},
): View {
  const [alexHand, samHand] = extra.handCounts ?? [5, 5];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 1, host: false, areas: ['p1'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        decks: [{ area: 'p0', ready: true, handCount: alexHand }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p1', ready: true, handCount: samHand }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: extra.piles ?? PILES,
      stages: extra.stages ?? [],
      firstPlayer: extra.firstPlayer ?? { x: 860, y: 40 },
      ...(extra.hands && { hands: extra.hands }),
    },
    log: extra.log ?? [START],
  };
}

function fakeSession(viewGap = 0) {
  return {
    act: vi.fn(() => 1),
    lobby: vi.fn(() => true),
    lastError: null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
    viewGap,
  };
}

/** A Web Animation as the stub below starts it: it never ends unless cancelled, or finished by a test. */
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
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const animation: FakeAnimation = {
    element: this,
    keyframes,
    cancelled: false,
    cancel: vi.fn(() => {
      animation.cancelled = true;
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
 * jsdom lays nothing out: elements are placed from their own left and top.
 * A card moving (FLIP) shows half-way.
 */
function fakeRect(this: HTMLElement): DOMRect {
  const offset = { x: 0, y: 0 };
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
  localStorage.clear();
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

async function settle(): Promise<void> {
  await tick();
  await tick();
}

/** Runs a test as with the system setting to reduce motion. */
async function withReducedMotion(run: () => Promise<void>): Promise<void> {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      media: query,
      matches: query.includes('reduced-motion'),
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    });
  try {
    await run();
  } finally {
    window.matchMedia = matchMedia;
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

    await rerender({ session, view: makeView([], { firstPlayer: { x: 160, y: 240 } }) });
    await waitFor(() => expect(animationsOf('.surface .fptoken')).toHaveLength(1));
    const [[keyframes, options]] = animationsOf('.surface .fptoken') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes[0]).toMatchObject({ translate: '700px -200px' });
    expect(keyframes[1]).toMatchObject({ translate: '0px 0px' });
    expect(options.duration).toBe(250);
  });

  it("the viewer's own drop of the first player token does not move again", async () => {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();
    interaction.land({
      action: 1,
      element: { kind: 'firstPlayer' },
      card: null,
      lifted: [],
      handOrder: null,
    });

    await rerender({ session, view: makeView([], { firstPlayer: { x: 160, y: 240 } }) });
    await settle();
    expect(animationsOf('.surface .fptoken')).toEqual([]);
  });

  it("another player's drag of the first player token shows it under their pointer", async () => {
    const session = { ...fakeSession(), presence: new SvelteMap<number, PresenceState>() };
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();
    const ghost = () => document.querySelector<HTMLElement>('.presence .fptoken.ghost');
    const placedToken = () => document.querySelector<HTMLElement>('.surface .fptoken')!;
    const dragTo = (x: number) => ({ cards: [], token: true, x, y: 40 });

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
    await waitFor(() => expect(animationsOf('.surface .fptoken')).toHaveLength(1));
    const [[keyframes]] = animationsOf('.surface .fptoken') as [
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
    const ghost = () => document.querySelector<HTMLElement>('.presence .fptoken.ghost');

    session.presence.set(0, {
      color: 0,
      name: 'Alex',
      at: Date.now(),
      drag: { cards: [], token: true, x: 400, y: 40 },
    });
    await waitFor(() => expect(ghost()).not.toBeNull());
    session.presence.delete(0);
    await waitFor(() => expect(ghost()).toBeNull());
    expect(document.querySelector('.surface .fptoken')?.classList).not.toContain('lifted');
  });

  it('counts frames while a card moves, for the arrows to follow it', async () => {
    const session = fakeSession();
    const { rerender } = render(Table, {
      session,
      view: makeView([card('a', { x: 0 })]),
    });
    await settle();
    const before = motion.frame;

    await rerender({ session, view: makeView([card('a', { x: 200 })]) });
    await waitFor(() => expect(motion.frame).toBeGreaterThan(before + 1));
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

  it("the viewer's own drop does not move again", async () => {
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
    expect(animationsOf('.surface .card[data-id="b"]')).toEqual([]);
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
    await waitFor(() => expect(animationsOf('.surface .pile[data-id="deck:p1"]')).toHaveLength(1));
    const pile = container.querySelector('.surface .pile[data-id="deck:p1"]');
    // Six copies of its back riffle back into it.
    expect(
      animate.mock.contexts.filter((element) => (element as Element).parentElement === pile),
    ).toHaveLength(6);
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
      await waitFor(() => expect(runningOn(pile())).toHaveLength(1));
      const riffle = started.filter((animation) => animation.element.parentElement === pile());
      expect(riffle).toHaveLength(6);

      await rerender({
        session,
        view: makeView([], { piles: alexPiles(29), log: shuffled, handCounts: [6, 5] }),
      });
      await waitFor(() => expect(container.querySelector('.fly')).not.toBeNull());
      expect(runningOn(pile())).toHaveLength(1);
      expect(riffle.filter((animation) => animation.cancelled)).toEqual([]);
    });

    it("a card drawn into the viewer's other deck, whose hand is not shown, leaves its pile", async () => {
      // Sam plays two decks: p1, whose hand shows, and p2, which draws.
      const twoDecks = (cards: TableCard[], hand: string[], count: number): View => {
        const base = makeView(cards, {
          piles: [...PILES, { id: 'deck:p2', kind: 'deck', owner: 2, x: 480, y: 0, count }],
          hands: { p1: [], p2: hand },
        });
        base.you = { ...base.you, areas: ['p1', 'p2'] };
        base.players[1]!.decks.push({ area: 'p2', ready: true, handCount: hand.length });
        return base;
      };
      const session = fakeSession();
      const { rerender, container } = render(Table, { session, view: twoDecks([], [], 30) });
      await settle();

      await rerender({
        session,
        view: twoDecks([card('d', { owner: 2, zone: 'hand' })], ['d'], 29),
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
    const session = fakeSession(2500);
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
    await waitFor(() => expect(animationsOf('.surface .card[data-id="v2"]')).toHaveLength(2));
    const [[keyframes, options]] = animationsOf('.surface .card[data-id="v2"]') as [
      [Keyframe[], KeyframeAnimationOptions],
    ];
    expect(keyframes).toEqual([
      { transform: 'perspective(700px) rotateY(90deg) scale(1.05)' },
      { transform: 'none' },
    ]);
    expect(options.duration).toBe(420);
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
      await waitFor(() => expect(animationsOf('.surface .card[data-id="v1"]')).toHaveLength(2));
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

    // A stop takes the copy away.
    motion.stop();
    expect(container.querySelector('.surface .card[aria-hidden="true"]')).toBeNull();
  });

  it('a card come face up from a deck onto the table only turns in', async () => {
    // The server never lists a deck's cards: the card shows up on the table as the deck shrinks.
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([]) });
    await settle();

    const deck = PILES.map((pile) => (pile.id === 'deck:p1' ? { ...pile, count: 29 } : pile));
    await rerender({
      session,
      view: makeView([card('a', { x: 300 })], {
        piles: deck,
        log: [START, line('played Spider-Man')],
      }),
    });
    await waitFor(() =>
      expect(animationsOf('.surface .card[data-id="a"]').map(([frames]) => frames)).toContainEqual([
        { transform: 'perspective(700px) rotateY(90deg)' },
        { transform: 'perspective(700px) rotateY(0deg)' },
      ]),
    );
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
});
