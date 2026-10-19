import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wsUrl } from './api';
import { getToken, setToken } from './prefs';
import { GameSession } from './session.svelte';
import type { PlayerView, View } from './types';

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

const player = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  name: 'Alex',
  color: 0,
  host: true,
  ready: false,
  handCount: 0,
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
    expect(wsUrl('abc')).toBe('ws://localhost:9000/ws/games/abc');
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
    expect(session.role).toBe('player');
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

  it('act reports null and sends nothing while the socket is not open', () => {
    const session = newSession();

    expect(session.connected).toBe(false);
    expect(session.act({ kind: 'draw', n: 1 })).toBeNull();

    lastSocket().open();
    expect(session.connected).toBe(true);
    expect(session.act({ kind: 'draw', n: 1 })).toBe(1);
    lastSocket().drop();
    expect(session.connected).toBe(false);
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
        view: view([player({ deckName: 'Justice', hero: 'spider-man' })]),
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
        view: view([player(), player({ color: 1, deckName: 'Other' })]),
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
        view: view([player(), player({ color: 1, deckName: 'Other' })]),
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
          player({ deckName: 'Justice', hero: '01001a', ready: true }),
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

  describe('presence', () => {
    it('keeps the latest state of each viewer by colour, stamped with its time', () => {
      vi.setSystemTime(1_000);
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({
        type: 'presence',
        color: 1,
        name: 'Bo',
        cursor: { area: 'villain', x: 1, y: 2 },
      });
      vi.setSystemTime(1_500);
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo', preview: 'c1' });

      expect(session.presence.get(1)).toEqual({
        color: 1,
        name: 'Bo',
        cursor: { area: 'villain', x: 1, y: 2 },
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
        ping: { area: 'p1', x: 5, y: 6 },
      });
      vi.setSystemTime(1_200);
      lastSocket().receive({ type: 'presence', color: 1, name: 'Bo', preview: 'c1' });

      expect(session.presence.get(1)).toMatchObject({
        ping: { area: 'p1', x: 5, y: 6 },
        pingAt: 1_000,
        at: 1_200,
      });
    });

    it('ignores spectators, whose colour is negative', () => {
      const session = newSession();
      lastSocket().open();
      lastSocket().receive({ type: 'presence', color: -1, name: 'Watcher' });

      expect(session.presence.size).toBe(0);
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

    it('is throttled to 20 messages a second, keeping the latest on the trailing edge', () => {
      const session = newSession();
      lastSocket().open();
      const presenceSent = () => lastSocket().sent.filter((m) => m.type === 'presence');

      session.sendPresence({ cursor: { area: 'p0', x: 1, y: 1 } });
      session.sendPresence({ cursor: { area: 'p0', x: 2, y: 2 } });
      session.sendPresence({ cursor: { area: 'p0', x: 3, y: 3 } });
      session.sendPresence({ ping: { area: 'p0', x: 9, y: 9 } });
      expect(presenceSent()).toHaveLength(1);

      vi.advanceTimersByTime(50);
      expect(presenceSent()).toHaveLength(2);
      expect(presenceSent()[1]).toEqual({
        type: 'presence',
        cursor: { area: 'p0', x: 3, y: 3 },
        ping: { area: 'p0', x: 9, y: 9 },
      });

      // Nothing pending: the window closes and the next message goes out at once.
      vi.advanceTimersByTime(50);
      session.sendPresence({ preview: 'c1' });
      expect(presenceSent()).toHaveLength(3);
    });
  });
});
