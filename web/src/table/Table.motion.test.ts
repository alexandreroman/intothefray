import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { motion } from './motion.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  CardView as TableCard,
  LogView,
  PileView,
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
  extra: { piles?: PileView[]; log?: LogView[]; stages?: Stage[] } = {},
): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Sam', color: 1, host: false, area: 'p1' },
    players: [
      { name: 'Alex', color: 0, host: true, area: 'p0', ready: true, handCount: 5 },
      { name: 'Sam', color: 1, host: false, area: 'p1', ready: true, handCount: 5 },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: extra.piles ?? PILES,
      stages: extra.stages ?? [],
      firstPlayer: { x: 860, y: 40 },
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

/** A Web Animation as the stub below starts it: it never ends unless cancelled. */
interface FakeAnimation {
  element: Element;
  keyframes: Keyframe[];
  cancel: ReturnType<typeof vi.fn>;
  cancelled: boolean;
  finished: Promise<never>;
}

let started: FakeAnimation[] = [];

const animate = vi.fn(function (this: Element, keyframes: Keyframe[]) {
  const animation: FakeAnimation = {
    element: this,
    keyframes,
    cancelled: false,
    cancel: vi.fn(() => {
      animation.cancelled = true;
    }),
    finished: new Promise<never>(() => {}),
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
  document.documentElement.style.setProperty('--p1', '#6fa8ff');
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
    } finally {
      window.matchMedia = matchMedia;
    }
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
    expect(String(keyframes[0]?.boxShadow)).toContain('#6fa8ff');
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
