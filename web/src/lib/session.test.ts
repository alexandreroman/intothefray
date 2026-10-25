import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wsUrl } from './api';
import { getToken, setToken } from './prefs';
import { GameSession } from './session.svelte';
import type { DeckView, PlayerView, View } from './types';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.readyState = 3;
  }

  // Test helpers: what the network does.
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const deck = (overrides: Partial<DeckView> = {}): DeckView => ({
  ready: false,
  handCount: 0,
  ...overrides,
});

const player = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  name: 'Alex',
  color: 0,
  host: true,
  ready: false,
  online: true,
  decks: [deck()],
  ...overrides,
});

const view = (players: PlayerView[] = [player()]): View => ({
  id: 'g1',
  phase: 'lobby',
  you: { role: 'player', color: 0, host: true },
  players,
  spectators: 0,
  config: { scenario: '', difficulty: 'standard', standard: '', expert: '', modulars: [] },
  log: [],
});

// Like the browser's: calling it with another receiver than the global object throws.
function strictSetTimeout(
  this: unknown,
  handler: () => void,
  ms?: number,
): ReturnType<typeof setTimeout> {
  if (this !== undefined && this !== globalThis) {
    throw new TypeError('Illegal invocation');
  }
  return setTimeout(handler, ms);
}

function newSession(gameId = 'g1'): GameSession {
  const session = new GameSession(gameId, 'Alex', {
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    setTimeout: strictSetTimeout as typeof setTimeout,
  });
  session.connect();
  return session;
}

const lastSocket = (): FakeWebSocket => FakeWebSocket.instances.at(-1)!;

describe('GameSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects to the game socket', () => {
    newSession('abc');
    expect(lastSocket().url).toBe(wsUrl('abc'));
  });

  it('sends hello with the stored token', () => {
    setToken('hello-game', 'tok-1');
    newSession('hello-game');
    lastSocket().open();

    expect(lastSocket().sent).toEqual([{ type: 'hello', token: 'tok-1', name: 'Alex' }]);
  });

  it('sends hello without a token for a new viewer', () => {
    newSession('fresh-game');
    lastSocket().open();

    expect(lastSocket().sent).toEqual([{ type: 'hello', name: 'Alex' }]);
  });

  it('stores the token from welcome', () => {
    const session = newSession('welcome-game');
    lastSocket().open();
    lastSocket().receive({ type: 'welcome', token: 'tok-2', role: 'player' });

    expect(getToken('welcome-game')).toBe('tok-2');
    expect(session.status).toBe('open');
  });

  it('reconnects with the stored token', () => {
    newSession('reconnect-game');
    lastSocket().open();
    lastSocket().receive({ type: 'welcome', token: 'tok-3', role: 'player' });

    lastSocket().drop();
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    lastSocket().open();
    expect(lastSocket().sent).toEqual([{ type: 'hello', token: 'tok-3', name: 'Alex' }]);
  });

  it('backs off 0.5, 1, 2, 4 then every 8 seconds, and resets after a view', () => {
    const session = newSession();
    const expectedDelays = [500, 1000, 2000, 4000, 8000, 8000];

    for (const [index, delay] of expectedDelays.entries()) {
      lastSocket().drop();
      expect(session.status).toBe('reconnecting');
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(index + 2);
    }

    lastSocket().open();
    lastSocket().receive({ type: 'view', version: 1, view: view() });
    lastSocket().drop();
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(expectedDelays.length + 2);
  });

  it('tells how long the view went stale across a reconnection, and no gap while connected', () => {
    const session = newSession();
    lastSocket().open();
    lastSocket().receive({ type: 'view', version: 1, view: view() });
    expect(session.viewGap).toBe(0);

    // Live views are never stale, however quiet the table is between them.
    vi.advanceTimersByTime(10_000);
    lastSocket().receive({ type: 'view', version: 2, view: view() });
    expect(session.viewGap).toBe(0);

    // Dropped 1 s after the last view, back 0.5 s later, the new view 0.2 s after that.
    vi.advanceTimersByTime(1000);
    lastSocket().drop();
    vi.advanceTimersByTime(500);
    lastSocket().open();
    vi.advanceTimersByTime(200);
    lastSocket().receive({ type: 'view', version: 3, view: view() });
    expect(session.viewGap).toBe(1700);

    lastSocket().receive({ type: 'view', version: 4, view: view() });
    expect(session.viewGap).toBe(0);
  });

  it('stops reconnecting after close()', () => {
    const session = newSession();
    lastSocket().open();
    session.close();
    const socket = lastSocket();
    lastSocket().drop(1000);
    vi.advanceTimersByTime(60_000);

    expect(socket.readyState).toBe(3);
    expect(session.status).toBe('closed');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('closes for good on close code 4404', () => {
    const session = newSession();
    lastSocket().drop(4404);
    vi.advanceTimersByTime(60_000);

    expect(session.status).toBe('closed');
    expect(session.lastError?.code).toBe('notFound');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('closes for good on a game-level notFound before any view', () => {
    const session = newSession();
    lastSocket().open();
    lastSocket().receive({ type: 'error', code: 'notFound', message: 'No such game.' });
    // Whatever the close code, no retry follows.
    lastSocket().drop(1006);
    vi.advanceTimersByTime(60_000);

    expect(session.status).toBe('closed');
    expect(session.lastError).toEqual({ code: 'notFound', message: 'No such game.' });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it.each(['forbidden', 'phase', 'internal', 'notFound'])(
    'retries after a %s error answering hello, before any view',
    (code) => {
      const session = newSession();
      const first = lastSocket();
      first.open();
      // An error tied to an action id is not about the game itself.
      first.receive({ type: 'error', id: 1, code, message: 'Failed.' });

      expect(first.readyState).toBe(3);
      expect(session.lastError).toEqual({ id: 1, code, message: 'Failed.' });
      expect(session.status).toBe('reconnecting');

      // The close that follows must not schedule a second retry.
      first.drop();
      vi.advanceTimersByTime(500);
      expect(FakeWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(60_000);
      expect(FakeWebSocket.instances).toHaveLength(2);
    },
  );

  it('keeps the session on notFound once a view arrived', () => {
    const session = newSession();
    lastSocket().open();
    lastSocket().receive({ type: 'view', version: 1, view: view() });
    lastSocket().receive({ type: 'error', id: 3, code: 'notFound', message: 'No such card.' });

    expect(session.status).toBe('open');
    expect(session.lastError?.code).toBe('notFound');
  });

  it('replaces the view and clears the error on the next view', () => {
    const session = newSession();
    lastSocket().open();
    lastSocket().receive({ type: 'error', code: 'forbidden', message: 'Nope.' });
    expect(session.lastError?.code).toBe('forbidden');

    // The failed hello abandons that socket: the retry brings the view.
    vi.advanceTimersByTime(500);
    lastSocket().open();
    lastSocket().receive({ type: 'view', version: 1, view: view() });
    expect(session.view?.id).toBe('g1');
    expect(session.lastError).toBeNull();
  });

  it('act returns increasing ids and sends the action', () => {
    const session = newSession();
    lastSocket().open();

    const first = session.act({ kind: 'draw', n: 1 });
    const second = session.act({ kind: 'shuffle' });

    expect([first, second]).toEqual([1, 2]);
    expect(lastSocket().sent.slice(1)).toEqual([
      { type: 'action', id: 1, action: { kind: 'draw', n: 1 } },
      { type: 'action', id: 2, action: { kind: 'shuffle' } },
    ]);
  });

  it('act sends seat', () => {
    const session = newSession();
    lastSocket().open();

    session.act({ kind: 'exhaust', card: 'c1' }, 1);

    expect(lastSocket().sent.at(-1)).toEqual({
      type: 'action',
      id: 1,
      action: { kind: 'exhaust', card: 'c1' },
      seat: 1,
    });
  });

  it('act omits seat when undefined', () => {
    const session = newSession();
    lastSocket().open();

    session.act({ kind: 'exhaust', card: 'c1' });

    expect(lastSocket().sent.at(-1)).not.toHaveProperty('seat');
  });

  it('act reports null and sends nothing while the socket is not open', () => {
    const session = newSession();

    expect(session.act({ kind: 'draw', n: 1 })).toBeNull();

    lastSocket().open();
    expect(session.act({ kind: 'draw', n: 1 })).toBe(1);
    lastSocket().drop();
    expect(session.act({ kind: 'draw', n: 1 })).toBeNull();
  });

  it('lobby reports whether the message was sent', () => {
    const session = newSession();
    expect(session.lobby('start')).toBe(false);

    lastSocket().open();
    expect(session.lobby('start')).toBe(true);
  });

  it('keeps the action id of an error', () => {
    const session = newSession();
    lastSocket().open();
    lastSocket().receive({ type: 'view', version: 1, view: view() });
    const id = session.act({ kind: 'draw', n: 1 });
    expect(id).toBe(1);
    lastSocket().receive({ type: 'error', id, code: 'invalid', message: 'nope' });

    expect(session.lastError).toEqual({ id: 1, code: 'invalid', message: 'nope' });
  });

  it('ignores the events of a replaced socket', () => {
    const session = newSession();
    const stale = lastSocket();
    stale.open();
    stale.receive({ type: 'view', version: 1, view: view() });
    stale.drop();
    vi.advanceTimersByTime(500);
    const fresh = lastSocket();
    expect(fresh).not.toBe(stale);

    stale.receive({ type: 'view', version: 2, view: view([player({ name: 'Old' })]) });
    stale.onopen?.();

    expect(session.view?.players[0]?.name).toBe('Alex');
    expect(session.status).toBe('reconnecting');
    expect(stale.sent.filter((m) => m.type === 'hello')).toHaveLength(1);
  });

  it('sends lobby operations with their payload', () => {
    const session = newSession();
    lastSocket().open();
    session.lobby('setDeck', { url: 'https://marvelcdb.com/decklist/view/1' });
    session.lobby('start');

    expect(lastSocket().sent.slice(1)).toEqual([
      { type: 'lobby', op: 'setDeck', url: 'https://marvelcdb.com/decklist/view/1' },
      { type: 'lobby', op: 'start' },
    ]);
  });

  it('lobby sends addDeck', () => {
    const session = newSession();
    lastSocket().open();

    expect(session.lobby('addDeck')).toBe(true);

    expect(lastSocket().sent.at(-1)).toEqual({ type: 'lobby', op: 'addDeck' });
  });

  it('lobby setDeck sends deck', () => {
    const session = newSession();
    lastSocket().open();
    const url = 'https://marvelcdb.com/decklist/view/1';

    session.lobby('setDeck', { url, deck: 1 });

    expect(lastSocket().sent.at(-1)).toEqual({ type: 'lobby', op: 'setDeck', url, deck: 1 });
  });

  describe('deckError', () => {
    const unsupported = [{ code: '01001', name: 'Spider-Man', pack: 'core', qty: 1 }];

    it('is exposed', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({ type: 'deckError', unsupported });

      expect(session.deckError).toEqual(unsupported);
    });

    it('stays while the player deck is unchanged', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({ type: 'view', version: 1, view: view() });
      lastSocket().receive({ type: 'deckError', unsupported });
      lastSocket().receive({ type: 'view', version: 2, view: view([player({ ready: true })]) });

      expect(session.deckError).toEqual(unsupported);
    });

    it('is cleared when the player deck changes', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({ type: 'view', version: 1, view: view() });
      lastSocket().receive({ type: 'deckError', unsupported });
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player({ decks: [deck({ deckName: 'Justice', hero: 'spider-man' })] })]),
      });

      expect(session.deckError).toBeNull();
    });

    it('ignores the deck changes of other players', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'view',
        version: 1,
        view: view([player(), player({ color: 1 })]),
      });
      lastSocket().receive({ type: 'deckError', unsupported });
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player(), player({ color: 1, decks: [deck({ deckName: 'Other' })] })]),
      });

      expect(session.deckError).toEqual(unsupported);
    });
  });

  describe('deckLoadError', () => {
    const unsupported = [{ code: '01001', name: 'Spider-Man', pack: 'core', qty: 1 }];
    const importFailed = {
      type: 'error',
      code: 'deck',
      message: 'This is not a marvelcdb deck link.',
    };

    function sessionWithView(): GameSession {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'view',
        version: 1,
        view: view([player(), player({ color: 1 })]),
      });
      return session;
    }

    it('takes the error answering setDeck, not lastError', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive(importFailed);

      expect(session.deckLoadError).toEqual({
        code: 'deck',
        message: 'This is not a marvelcdb deck link.',
      });
      expect(session.lastError).toBeNull();
    });

    it('survives views that do not change the player deck', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive(importFailed);
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player(), player({ color: 1, decks: [deck({ deckName: 'Other' })] })]),
      });

      expect(session.deckLoadError?.code).toBe('deck');
    });

    it('is cleared, with deckError, when the next setDeck is sent', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive(importFailed);
      session.lobby('setDeck', { url: 'y' });
      lastSocket().receive({ type: 'deckError', unsupported });
      session.lobby('setDeck', { url: 'z' });

      expect(session.deckLoadError).toBeNull();
      expect(session.deckError).toBeNull();
    });

    it('is cleared when the player deck changes', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive(importFailed);
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([
          player({
            ready: true,
            decks: [deck({ deckName: 'Justice', hero: '01001a', ready: true })],
          }),
          player({ color: 1 }),
        ]),
      });

      expect(session.deckLoadError).toBeNull();
    });

    it('takes only the first error after setDeck', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive(importFailed);
      lastSocket().receive({
        type: 'error',
        code: 'forbidden',
        message: 'You are not allowed to do that.',
      });

      expect(session.deckLoadError?.code).toBe('deck');
      expect(session.lastError?.code).toBe('forbidden');
    });

    it('is not set by an error once a deckError answered the load', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().receive({ type: 'deckError', unsupported });
      lastSocket().receive({
        type: 'error',
        code: 'invalid',
        message: 'This request is not valid.',
      });

      expect(session.deckLoadError).toBeNull();
      expect(session.lastError?.code).toBe('invalid');
    });

    it('is not set by an error when no deck load is pending', () => {
      const session = sessionWithView();
      lastSocket().receive({
        type: 'error',
        code: 'invalid',
        message: 'This request is not valid.',
      });

      expect(session.deckLoadError).toBeNull();
      expect(session.lastError?.code).toBe('invalid');
    });

    it('forgets a pending load when the connection drops', () => {
      const session = sessionWithView();
      session.lobby('setDeck', { url: 'x' });
      lastSocket().drop();
      vi.advanceTimersByTime(500);
      lastSocket().open();
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player(), player({ color: 1 })]),
      });
      lastSocket().receive({
        type: 'error',
        code: 'invalid',
        message: 'This request is not valid.',
      });

      expect(session.deckLoadError).toBeNull();
      expect(session.lastError?.code).toBe('invalid');
    });
  });

  describe('deckLoading', () => {
    const others = [player({ color: 1 })];
    const unchanged = (version: number) => ({
      type: 'view',
      version,
      view: view([player(), ...others]),
    });

    function loadingSession(): GameSession {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive(unchanged(1));
      session.lobby('setDeck', { url: 'x' });
      return session;
    }

    it('is set once setDeck is sent', () => {
      const session = loadingSession();

      expect(session.deckLoading).toBe(true);
    });

    it('is not set by a setDeck that could not be sent', () => {
      const session = newSession();

      expect(session.lobby('setDeck', { url: 'x' })).toBe(false);
      expect(session.deckLoading).toBe(false);
    });

    it('ends with a deckSet for a version the view already holds', () => {
      const session = loadingSession();
      lastSocket().receive(unchanged(2));
      lastSocket().receive({ type: 'deckSet', version: 2 });

      expect(session.deckLoading).toBe(false);
    });

    it('ends with the view of the version a deckSet named before it', () => {
      const session = loadingSession();
      lastSocket().receive({ type: 'deckSet', version: 2 });
      expect(session.deckLoading).toBe(true);

      lastSocket().receive(unchanged(2));

      expect(session.deckLoading).toBe(false);
    });

    it('ignores a deckSet while no load is in flight', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive(unchanged(1));
      lastSocket().receive({ type: 'deckSet', version: 2 });
      session.lobby('setDeck', { url: 'x' });

      lastSocket().receive(unchanged(2));

      expect(session.deckLoading).toBe(true);
    });

    it('ends with a deckError', () => {
      const session = loadingSession();
      lastSocket().receive({
        type: 'deckError',
        unsupported: [{ code: '01001', name: 'Spider-Man', pack: 'core', qty: 1 }],
      });

      expect(session.deckLoading).toBe(false);
    });

    it('ends with the error that answers the load', () => {
      const session = loadingSession();
      lastSocket().receive({ type: 'error', code: 'deck', message: 'Nope.' });

      expect(session.deckLoading).toBe(false);
      expect(session.deckLoadError?.code).toBe('deck');
    });

    it('stays on with a view that changes the player deck, without a deckSet', () => {
      const session = loadingSession();
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player({ decks: [deck({ deckName: 'Justice', hero: '01001a' })] }), ...others]),
      });

      expect(session.deckLoading).toBe(true);
      expect(session.deckLoaded).toBe(0);
    });

    it('waits past the views below the version its deckSet named', () => {
      const session = loadingSession();
      lastSocket().receive({ type: 'deckSet', version: 3 });
      // Another change, made before the deck was set.
      lastSocket().receive({
        type: 'view',
        version: 2,
        view: view([player({ decks: [deck({ deckName: 'Justice', hero: '01001a' })] }), ...others]),
      });
      expect(session.deckLoading).toBe(true);

      lastSocket().receive(unchanged(3));

      expect(session.deckLoading).toBe(false);
      expect(session.deckLoaded).toBe(1);
    });

    it('takes an error that follows its deckSet as no answer to the load', () => {
      const session = loadingSession();
      lastSocket().receive({ type: 'deckSet', version: 2 });
      lastSocket().receive({ type: 'error', code: 'forbidden', message: 'Nope.' });
      expect(session.lastError?.code).toBe('forbidden');

      lastSocket().receive(unchanged(2));

      expect(session.deckLoaded).toBe(1);
      expect(session.deckLoadError).toBeNull();
    });

    it('stays on with a view that changes nothing of the player deck', () => {
      const session = loadingSession();
      lastSocket().receive(unchanged(2));

      expect(session.deckLoading).toBe(true);
    });

    it('ends when the connection drops, forgetting the version a deckSet named', () => {
      const session = loadingSession();
      lastSocket().receive({ type: 'deckSet', version: 2 });
      lastSocket().drop();
      expect(session.deckLoading).toBe(false);

      vi.advanceTimersByTime(500);
      lastSocket().open();
      session.lobby('setDeck', { url: 'y' });
      lastSocket().receive(unchanged(2));

      expect(session.deckLoading).toBe(true);
    });

    it('ends when the session closes', () => {
      const session = loadingSession();
      session.close();

      expect(session.deckLoading).toBe(false);
    });

    describe('deckLoaded', () => {
      it('counts a load confirmed by a deckSet after its view', () => {
        const session = loadingSession();
        lastSocket().receive(unchanged(2));
        lastSocket().receive({ type: 'deckSet', version: 2 });

        expect(session.deckLoaded).toBe(1);
      });

      it('counts a load confirmed by a deckSet before its view, once the view comes', () => {
        const session = loadingSession();
        lastSocket().receive({ type: 'deckSet', version: 2 });
        expect(session.deckLoaded).toBe(0);

        lastSocket().receive(unchanged(2));

        expect(session.deckLoaded).toBe(1);
      });

      it('counts each confirmed load once', () => {
        const session = loadingSession();
        lastSocket().receive({ type: 'deckSet', version: 2 });
        lastSocket().receive({
          type: 'view',
          version: 2,
          view: view([player({ decks: [deck({ deckName: 'Justice' })] }), ...others]),
        });
        lastSocket().receive(unchanged(3));

        expect(session.deckLoaded).toBe(1);
      });

      it('counts no load that ends with an error', () => {
        const session = loadingSession();
        lastSocket().receive({ type: 'error', code: 'deck', message: 'Nope.' });
        session.lobby('setDeck', { url: 'y' });
        lastSocket().receive({
          type: 'deckError',
          unsupported: [{ code: '01001', name: 'Spider-Man', pack: 'core', qty: 1 }],
        });

        expect(session.deckLoaded).toBe(0);
      });

      it('counts no load cut short by a lost connection or the end of the session', () => {
        const session = loadingSession();
        lastSocket().drop();
        vi.advanceTimersByTime(500);
        lastSocket().open();
        session.lobby('setDeck', { url: 'y' });
        session.close();

        expect(session.deckLoaded).toBe(0);
      });
    });
  });

  describe('presence', () => {
    it('keeps the latest state of each viewer by colour, stamped with its time', () => {
      vi.setSystemTime(1_000);
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'presence',
        color: 1,
        name: 'Bo',
        cursor: { x: 1, y: 2 },
      });
      vi.setSystemTime(1_500);
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo', preview: 'c1' });

      expect(session.presence.get(1)).toEqual({
        color: 1,
        name: 'Bo',
        cursor: { x: 1, y: 2 },
        preview: 'c1',
        at: 1_500,
      });
    });

    it('stamps a ping with the time it came, which later messages keep', () => {
      vi.setSystemTime(1_000);
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'presence',
        color: 1,
        name: 'Bo',
        ping: { x: 5, y: 6 },
      });
      vi.setSystemTime(1_200);
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo', preview: 'c1' });

      expect(session.presence.get(1)).toMatchObject({
        ping: { x: 5, y: 6 },
        pingAt: 1_000,
        at: 1_200,
      });
    });

    it('drops a player that a view no longer lists', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'view',
        version: 1,
        view: view([player(), player({ color: 1 })]),
      });
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo' });
      lastSocket().receive({ type: 'presence', color: 2, name: 'Cy' });

      lastSocket().receive({ type: 'view', version: 2, view: view([player()]) });

      expect(session.presence.size).toBe(0);
    });

    it('is emptied when the connection drops', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo' });
      lastSocket().drop();

      expect(session.presence.size).toBe(0);
    });
  });

  describe('sendPresence', () => {
    const drag = (x: number, y: number, cards = ['c1']) => ({ cards, x, y });

    // The presence messages sent since the session opened, without their type.
    function presenceSent(): Record<string, unknown>[] {
      return lastSocket()
        .sent.filter((m) => m.type === 'presence')
        .map(({ type: _type, ...fields }) => fields);
    }

    // A view with Bo, another player, connected: presence has a viewer.
    const watched = (): View => view([player(), player({ name: 'Bo', color: 1, host: false })]);

    let version = 0;
    function receiveView(next: View): void {
      version += 1;
      lastSocket().receive({ type: 'view', version, view: next });
    }

    function openSession(): GameSession {
      const session = newSession();
      lastSocket().open();
      receiveView(watched());
      return session;
    }

    it('sends the first move at once and the latest of the next ones at the end of the interval', () => {
      const session = openSession();

      session.sendPresence({ cursor: { x: 10, y: 10 } });
      session.sendPresence({ cursor: { x: 20, y: 20 } });
      session.sendPresence({ cursor: { x: 30, y: 30 } });
      expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 } }]);

      vi.advanceTimersByTime(50);
      expect(presenceSent()).toHaveLength(1);

      vi.advanceTimersByTime(100);
      expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 } }, { cursor: { x: 30, y: 30 } }]);
    });

    it('throttles the moves of a drag like those of the cursor', () => {
      const session = openSession();

      session.sendPresence({ drag: drag(10, 10) });
      session.sendPresence({ drag: drag(20, 20) });
      session.sendPresence({ drag: drag(30, 30) });
      expect(presenceSent()).toEqual([{ drag: drag(10, 10) }]);

      vi.advanceTimersByTime(150);
      expect(presenceSent()).toEqual([{ drag: drag(10, 10) }, { drag: drag(30, 30) }]);
    });

    it.each([
      ['a ping', { ping: { x: 9, y: 9 } }],
      ['a preview', { preview: 'c1' }],
      ['a cleared preview', { preview: '' }],
      ['the cursor leaving', { cursor: null }],
    ])('sends %s at once, with the move waiting', (_name, event) => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      session.sendPresence({ cursor: { x: 20, y: 20 } });

      session.sendPresence(event);
      expect(presenceSent()).toEqual([
        { cursor: { x: 10, y: 10 } },
        { cursor: { x: 20, y: 20 }, ...event },
      ]);

      // What it took along is not sent again.
      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(2);
    });

    it('sends the start and the end of a drag at once, the end after the last move', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      session.sendPresence({ cursor: { x: 20, y: 20 } });

      session.sendPresence({ drag: drag(20, 20) });
      session.sendPresence({ drag: drag(40, 40) });
      session.sendPresence({ drag: null });
      // The others keep the ghost where the drag ends: its last spot goes out before the end.
      expect(presenceSent()).toEqual([
        { cursor: { x: 10, y: 10 } },
        { cursor: { x: 20, y: 20 }, drag: drag(20, 20) },
        { drag: drag(40, 40) },
        { drag: null },
      ]);

      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(4);
    });

    it('sends a held move of a drag, with the other moves held, before its end', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 }, drag: drag(10, 10) });
      vi.advanceTimersByTime(150);
      session.sendPresence({ cursor: { x: 11, y: 10 }, drag: drag(11, 11) });
      expect(presenceSent()).toHaveLength(1);

      session.sendPresence({ drag: null });
      expect(presenceSent()).toEqual([
        { cursor: { x: 10, y: 10 }, drag: drag(10, 10) },
        { cursor: { x: 11, y: 10 }, drag: drag(11, 11) },
        { drag: null },
      ]);

      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(3);
    });

    it('sends nothing before the first view of a new connection, then what the viewer is doing', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      session.sendPresence({ drag: drag(10, 10) });
      lastSocket().drop();
      vi.advanceTimersByTime(500);
      lastSocket().open();

      session.sendPresence({ drag: drag(30, 30) });
      expect(presenceSent()).toEqual([]);

      // The others know nothing of the old socket: the whole state goes out, the drag included.
      receiveView(watched());
      expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 }, drag: drag(30, 30) }]);

      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(1);
    });

    it('sends at once a drag of other cards than the last one sent: a new drag', () => {
      const session = openSession();
      session.sendPresence({ drag: drag(10, 10) });

      session.sendPresence({ drag: drag(20, 20, ['c2']) });
      session.sendPresence({ drag: { cards: [], token: 'firstPlayer', x: 30, y: 30 } });

      expect(presenceSent()).toEqual([
        { drag: drag(10, 10) },
        { drag: drag(20, 20, ['c2']) },
        { drag: { cards: [], token: 'firstPlayer', x: 30, y: 30 } },
      ]);
    });

    it('keeps the order: a ping carries the move waiting, the end of the interval sends only newer moves', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      session.sendPresence({ cursor: { x: 20, y: 20 } });
      session.sendPresence({ ping: { x: 20, y: 20 } });
      session.sendPresence({ cursor: { x: 30, y: 30 } });

      vi.advanceTimersByTime(150);
      expect(presenceSent()).toEqual([
        { cursor: { x: 10, y: 10 } },
        { cursor: { x: 20, y: 20 }, ping: { x: 20, y: 20 } },
        { cursor: { x: 30, y: 30 } },
      ]);
    });

    it('holds a move within the dead zone of the last one sent, but not a longer one', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      vi.advanceTimersByTime(150);

      session.sendPresence({ cursor: { x: 12, y: 12 } }); // 2.8 units away
      expect(presenceSent()).toHaveLength(1);

      session.sendPresence({ cursor: { x: 13, y: 10 } }); // 3 units away
      expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 } }, { cursor: { x: 13, y: 10 } }]);

      // The longer move superseded the held one.
      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(2);
    });

    it('sends a trembling cursor once it stops, exactly where it stopped', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      vi.advanceTimersByTime(150);

      for (const [x, y] of [
        [11, 10],
        [10, 11],
        [12, 11],
        [11, 12],
      ] as const) {
        session.sendPresence({ cursor: { x, y } });
        vi.advanceTimersByTime(100);
      }
      expect(presenceSent()).toHaveLength(1);

      vi.advanceTimersByTime(50);
      expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 } }, { cursor: { x: 11, y: 12 } }]);

      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(2);
    });

    it('holds the small moves of a drag too', () => {
      const session = openSession();
      session.sendPresence({ drag: drag(10, 10) });
      vi.advanceTimersByTime(150);

      session.sendPresence({ drag: drag(11, 11) });
      expect(presenceSent()).toHaveLength(1);

      vi.advanceTimersByTime(150);
      expect(presenceSent()).toEqual([{ drag: drag(10, 10) }, { drag: drag(11, 11) }]);
    });

    it('sends a held move with an event that comes first', () => {
      const session = openSession();
      session.sendPresence({ cursor: { x: 10, y: 10 } });
      vi.advanceTimersByTime(150);
      session.sendPresence({ cursor: { x: 11, y: 10 } });

      session.sendPresence({ preview: 'c1' });
      expect(presenceSent()).toEqual([
        { cursor: { x: 10, y: 10 } },
        { cursor: { x: 11, y: 10 }, preview: 'c1' },
      ]);

      vi.advanceTimersByTime(1000);
      expect(presenceSent()).toHaveLength(2);
    });

    describe('with nobody else connected', () => {
      const alone = (): View => view([player(), player({ name: 'Bo', color: 1, online: false })]);

      function aloneSession(): GameSession {
        const session = newSession();
        lastSocket().open();
        receiveView(alone());
        return session;
      }

      it.each([
        ['a cursor move', { cursor: { x: 10, y: 10 } }],
        ['the cursor leaving', { cursor: null }],
        ['a drag', { drag: drag(10, 10) }],
        ['the end of a drag', { drag: null }],
        ['a ping', { ping: { x: 9, y: 9 } }],
        ['a preview', { preview: 'c1' }],
      ])('sends nothing for %s', (_name, fields) => {
        const session = aloneSession();

        session.sendPresence(fields);
        vi.advanceTimersByTime(1000);

        expect(presenceSent()).toEqual([]);
      });

      it("does not count the viewer's own other tabs", () => {
        const session = newSession();
        lastSocket().open();
        // Alex, colour 0 and online, is the viewer: their other tabs never get their presence.
        receiveView(view([player(), player({ name: 'Bo', color: 1, online: false })]));

        session.sendPresence({ cursor: { x: 10, y: 10 } });

        expect(presenceSent()).toEqual([]);
      });

      it('sends what the viewer is doing once a spectator connects', () => {
        const session = aloneSession();
        session.sendPresence({ cursor: { x: 10, y: 10 } });
        session.sendPresence({ ping: { x: 10, y: 10 } });
        session.sendPresence({ preview: 'c1' });
        session.sendPresence({ cursor: { x: 20, y: 20 } });

        receiveView({ ...alone(), spectators: 1 });

        // A ping is of its moment: it is not replayed.
        expect(presenceSent()).toEqual([{ cursor: { x: 20, y: 20 }, preview: 'c1' }]);
      });

      it('sends what the viewer is doing once another player comes online', () => {
        const session = aloneSession();
        session.sendPresence({ cursor: { x: 10, y: 10 } });
        session.sendPresence({ cursor: null });

        receiveView(watched());

        expect(presenceSent()).toEqual([{ cursor: null }]);
      });

      it('sends nothing to a newcomer when there is nothing to tell', () => {
        const session = aloneSession();
        session.sendPresence({ preview: 'c1' });
        session.sendPresence({ preview: '' });
        session.sendPresence({ drag: drag(10, 10) });
        session.sendPresence({ drag: null });

        receiveView(watched());

        expect(presenceSent()).toEqual([]);
      });

      it('sends a drag in progress to a newcomer, then its moves and its end', () => {
        const session = aloneSession();
        session.sendPresence({ drag: drag(10, 10) });
        session.sendPresence({ drag: drag(20, 20) });

        receiveView(watched());
        // Moves of the drag already sent, throttled as usual.
        session.sendPresence({ drag: drag(30, 30) });
        vi.advanceTimersByTime(150);
        session.sendPresence({ drag: drag(40, 40) });
        session.sendPresence({ drag: null });

        expect(presenceSent()).toEqual([
          { drag: drag(20, 20) },
          { drag: drag(30, 30) },
          { drag: drag(40, 40) },
          { drag: null },
        ]);
      });

      it('drops the moves waiting when the last other viewer leaves', () => {
        const session = openSession();
        session.sendPresence({ cursor: { x: 10, y: 10 } });
        session.sendPresence({ cursor: { x: 30, y: 30 } });

        receiveView(alone());
        vi.advanceTimersByTime(1000);

        expect(presenceSent()).toEqual([{ cursor: { x: 10, y: 10 } }]);
      });

      it('forgets what the viewers who left were sent', () => {
        const session = openSession();
        session.sendPresence({ drag: drag(10, 10) });
        receiveView(alone());
        session.sendPresence({ drag: null });
        receiveView(watched());

        // The newcomer knows nothing of the first drag: one of the same card, close by, is a new
        // drag sent at once, not a tiny move of the old one held in the dead zone.
        session.sendPresence({ drag: drag(11, 10) });
        expect(presenceSent()).toEqual([{ drag: drag(10, 10) }, { drag: drag(11, 10) }]);
      });
    });

    describe('as other viewers come and go', () => {
      const withSpectators = (spectators: number): View => ({ ...watched(), spectators });

      it('sends what the viewer is doing to each newcomer, once', () => {
        const session = openSession();
        session.sendPresence({ cursor: { x: 10, y: 10 } });
        vi.advanceTimersByTime(150);

        receiveView(withSpectators(1));
        expect(presenceSent()).toEqual([
          { cursor: { x: 10, y: 10 } },
          { cursor: { x: 10, y: 10 } },
        ]);

        // Same viewers, then fewer: nobody new to tell.
        receiveView(withSpectators(1));
        receiveView(withSpectators(0));
        vi.advanceTimersByTime(1000);
        expect(presenceSent()).toHaveLength(2);
      });

      it('counts the online players, not those who closed every tab', () => {
        const session = openSession();
        session.sendPresence({ cursor: { x: 10, y: 10 } });
        vi.advanceTimersByTime(150);

        // Kim is seated but offline: still only Bo watches.
        receiveView(view([...watched().players, player({ name: 'Kim', color: 2, online: false })]));
        vi.advanceTimersByTime(1000);

        expect(presenceSent()).toHaveLength(1);
      });
    });
  });
});
