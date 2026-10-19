import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { motion } from './motion.svelte';
import { knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, LogView, PileView, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
}));

function infoOf(code: string): CardInfo {
  const face = { name: 'Spider-Man', type: 'hero', size: 'std' as const, images: [`${code}.png`] };
  return { card: { code, faces: [face], back: 'player', quantity: 1 }, face: 0, pack: 'core' };
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
  { id: 'deck:p1', kind: 'deck', owner: 1, area: 'p1', x: 600, y: 0, count: 30 },
  { id: 'disc:p0', kind: 'discard', owner: 0, area: 'p0', x: 720, y: 0, count: 0, cards: [] },
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
function makeView(cards: TableCard[], extra: { piles?: PileView[]; log?: LogView[] } = {}): View {
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
      stages: [],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: extra.log ?? [START],
  };
}

function fakeSession() {
  return {
    act: vi.fn(() => 1),
    lobby: vi.fn(() => true),
    lastError: null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
  };
}

/**
 * jsdom lays nothing out: elements are placed from their own left and top,
 * each zone 300 px below the one above.
 */
function fakeRect(this: HTMLElement): DOMRect {
  const zones = [...document.querySelectorAll('.zsec')];
  const zone = this.closest('.zsec');
  const zoneTop = zone ? zones.indexOf(zone) * 300 : 0;
  const left = Number.parseFloat(this.style.left) || 0;
  const top = zoneTop + (Number.parseFloat(this.style.top) || 0);
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

const animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn() }));
let originals: {
  animate: typeof Element.prototype.animate;
  rect: typeof Element.prototype.getBoundingClientRect;
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  originals = { animate: Element.prototype.animate, rect: Element.prototype.getBoundingClientRect };
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  HTMLElement.prototype.getBoundingClientRect = fakeRect;
  document.documentElement.style.setProperty('--p1', '#6fa8ff');
});

afterEach(() => {
  Element.prototype.animate = originals.animate;
  HTMLElement.prototype.getBoundingClientRect = originals.rect;
  document.documentElement.style.removeProperty('--p1');
  animate.mockClear();
  motion.stop();
  interaction.reset();
});

/** The animations started on an element, as [element, keyframes, options]. */
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
      view: makeView([card('a', { area: 'p0', x: 0 })]),
    });
    await settle();

    await rerender({ session, view: makeView([card('a', { area: 'p0', x: 200, y: 20 })]) });
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
      view: makeView([card('a', { area: 'p0', x: 0 })]),
    });
    await settle();
    const before = motion.frame;

    await rerender({ session, view: makeView([card('a', { area: 'p0', x: 200 })]) });
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
        view: makeView([card('a', { area: 'p0', x: 0 })]),
      });
      await settle();

      const next = makeView([card('a', { area: 'p0', x: 200, exhausted: true })], {
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
      view: makeView([card('b', { owner: 1, area: 'p1', x: 0 })]),
    });
    await settle();
    interaction.land({
      action: 1,
      element: { kind: 'card', id: 'b' },
      card: 'b',
      lifted: ['b'],
      handOrder: null,
    });

    await rerender({ session, view: makeView([card('b', { owner: 1, area: 'p1', x: 300 })]) });
    await settle();
    expect(animationsOf('.surface .card[data-id="b"]')).toEqual([]);
  });

  it('a token change glows in the colour of the player who made it', async () => {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView([card('a', { area: 'p0' })]) });
    await settle();

    const next = makeView([card('a', { area: 'p0', tokens: { dmg: 1 } })], {
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
      view: makeView([card('a', { area: 'p0', x: 40 })]),
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
});
