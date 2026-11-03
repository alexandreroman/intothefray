// What one server update costs the table, through the real GameSession and Game screen over a fake
// socket, as in the app: a view that moves one card must redraw that card alone. The benchmark at
// the end times such updates on a full table; it runs with `pnpm bench` (BENCH_CARDS sets the
// number of table cards, 120 by default).

import { render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import Game from '../screens/Game.svelte';
import { FakeWebSocket } from '../lib/socket.testing';
import type { CardView as TableCard, PileView, View } from '../lib/types';
import { infoFrom, playingView, seated } from './fixtures.testing';

// Counts the boxes CardView derives (cardBox, called once per card drawn): one per card redrawn.
const counter = vi.hoisted(() => ({ on: false, cardView: 0 }));

vi.mock('./layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./layout')>();
  return {
    ...actual,
    cardBox: (...args: Parameters<typeof actual.cardBox>) => {
      // Other components measure cards too: only CardView's own calls count.
      if (counter.on && new Error().stack?.includes('CardView.svelte')) {
        counter.cardView++;
      }
      return actual.cardBox(...args);
    },
  };
});

const CODES = Array.from({ length: 40 }, (_, i) => `01${String(i + 1).padStart(3, '0')}`);
const known = infoFrom(
  Object.fromEntries(CODES.map((code) => [code, [{ name: code, type: 'ally' }]])),
);

vi.mock('../lib/catalog', () => ({
  loadGameCards: vi.fn(() => Promise.resolve()),
  knownCard: vi.fn((code: string) => known(code)),
  gameCards: vi.fn(() => []),
  loadIndex: vi.fn(() => new Promise(() => {})),
}));

/** The card that the updates move, a few steps to the right each time. */
const MOVED = 'c5';

/**
 * A game in play with `tableCards` cards spread over the villain's row and two players' rows,
 * some with damage or exhausted, plus cards in two discard piles and in Alex's hand. The card
 * MOVED lies `step` steps right of its spot.
 */
function buildView(tableCards: number, step: number): View {
  const cards: TableCard[] = [];
  const owners = [-1, 0, 1];
  for (let i = 0; i < tableCards; i++) {
    const owner = owners[i % owners.length] ?? -1;
    const row = owner + 1;
    const column = Math.floor(i / owners.length);
    const id = `c${i}`;
    cards.push({
      id,
      code: CODES[i % CODES.length],
      face: 0,
      back: owner === -1 ? 'encounter' : 'player',
      owner,
      zone: 'table',
      x: 300 + column * 120 + (id === MOVED ? step * 10 : 0),
      y: 40 + row * 260 + (column % 2) * 20,
      z: i + 1,
      ...(i % 7 === 0 && { tokens: { dmg: 2 } }),
      ...(i % 11 === 0 && { exhausted: true }),
    });
  }
  const playerDiscard = Array.from({ length: 20 }, (_, i) => `d0_${i}`);
  const encounterDiscard = Array.from({ length: 10 }, (_, i) => `e_${i}`);
  for (const id of [...playerDiscard, ...encounterDiscard]) {
    const owner = playerDiscard.includes(id) ? 0 : -1;
    cards.push({
      id,
      code: CODES[0],
      face: 0,
      back: 'player',
      owner,
      zone: 'pile',
      x: 0,
      y: 0,
      z: 0,
    });
  }
  const hand = Array.from({ length: 6 }, (_, i) => `h${i}`);
  for (const id of hand) {
    cards.push({
      id,
      code: CODES[1],
      face: 0,
      back: 'player',
      owner: 0,
      zone: 'hand',
      x: 0,
      y: 0,
      z: 0,
    });
  }
  const piles: PileView[] = [
    { id: 'encounter', kind: 'encounter', owner: -1, x: 20, y: 40, count: 30 },
    {
      id: 'encd',
      kind: 'discard',
      owner: -1,
      x: 150,
      y: 40,
      count: encounterDiscard.length,
      cards: encounterDiscard,
    },
    { id: 'deck:p0', kind: 'deck', owner: 0, x: 20, y: 300, count: 25 },
    {
      id: 'disc:p0',
      kind: 'discard',
      owner: 0,
      x: 150,
      y: 300,
      count: playerDiscard.length,
      cards: playerDiscard,
    },
    { id: 'deck:p1', kind: 'deck', owner: 1, x: 20, y: 560, count: 25 },
    { id: 'disc:p1', kind: 'discard', owner: 1, x: 150, y: 560, count: 0, cards: [] },
  ];
  return playingView({
    players: [
      seated('Alex', 0, [{ area: 'p0', handCount: hand.length }], true),
      seated('Sam', 1, [{ area: 'p1', handCount: 0 }]),
    ],
    table: { cards, piles, hands: { p0: hand } },
    log: [{ who: 'Alex', color: 0, text: 'started the game', at: '2026-10-19T14:00:00Z' }],
  });
}

/**
 * Opens the game with `tableCards` cards on the table, drawn once the catalog has loaded, and
 * returns a way to send the update that puts the moved card at a step.
 */
async function startGame(tableCards: number): Promise<(step: number) => void> {
  localStorage.setItem('itf-name', 'Alex');
  render(Game, { id: 'g1' });
  const socket = FakeWebSocket.last;
  socket.open();
  let version = 1;
  socket.receive({ type: 'view', version, view: buildView(tableCards, 0) });
  flushSync();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
  expect(document.querySelectorAll('.surface .card[data-id^="c"]')).toHaveLength(tableCards);

  return (step) => {
    version += 1;
    socket.receive({ type: 'view', version, view: buildView(tableCards, step) });
    flushSync();
  };
}

/** The element drawing a table card. */
function drawn(id: string): Element | null {
  return document.querySelector(`.surface .card[data-id="${id}"]`);
}

/** The value at a fraction of sorted values: 0.5 is the median. */
function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.floor(sorted.length * fraction)] ?? 0;
}

let originalAnimate: typeof Element.prototype.animate;

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  FakeWebSocket.instances = [];
  counter.on = false;
  counter.cardView = 0;
  // jsdom has no Web Animations: the moves start and never end, as nothing here waits for them.
  originalAnimate = Element.prototype.animate;
  Element.prototype.animate = function () {
    return {
      cancel() {},
      finish() {},
      finished: new Promise(() => {}),
      effect: { setKeyframes() {} },
    };
  } as unknown as typeof Element.prototype.animate;
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  vi.unstubAllGlobals();
});

describe('Table render', () => {
  it('redraws only the card a server update moves, the others keeping their element', async () => {
    const send = await startGame(120);
    const still = drawn('c0');

    counter.on = true;
    for (let step = 1; step <= 5; step++) {
      counter.cardView = 0;
      send(step);
      expect(counter.cardView).toBe(1);
    }

    expect(drawn('c0')).toBe(still);
  });

  // Run with `pnpm bench`; BENCH_CARDS sets the number of table cards.
  it.runIf(Boolean(process.env.BENCH))(
    'measures one server update on a full table',
    async () => {
      const tableCards = Number(process.env.BENCH_CARDS ?? 120);
      const send = await startGame(tableCards);

      // Warms up the JIT first.
      let step = 0;
      for (let i = 0; i < 20; i++) {
        send(++step);
      }
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        send(++step);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((sum, time) => sum + time, 0) / times.length;

      const counted = 10;
      counter.on = true;
      for (let i = 0; i < counted; i++) {
        send(++step);
      }
      counter.on = false;

      process.stderr.write(
        `BENCH ${tableCards} table cards: median ${percentile(times, 0.5).toFixed(2)} ms, ` +
          `mean ${mean.toFixed(2)} ms, p90 ${percentile(times, 0.9).toFixed(2)} ms; ` +
          `CardView redraws per update: ${counter.cardView / counted}\n`,
      );
    },
    60_000,
  );
});
