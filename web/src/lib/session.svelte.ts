import { SvelteMap } from 'svelte/reactivity';
import { getToken, setToken } from './prefs';
import type {
  Action,
  PresenceFields,
  PresenceState,
  Role,
  SessionError,
  UnsupportedCard,
  View,
} from './types';
import { wsUrl } from './api';

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

type LobbyOp = 'configure' | 'setDeck' | 'removePlayer' | 'leave' | 'takeSeat' | 'start' | 'end';

type ServerMessage =
  | { type: 'welcome'; token: string; role: Role }
  | { type: 'view'; version: number; view: View }
  | { type: 'error'; id?: number; code: string; message: string }
  | { type: 'deckError'; unsupported: UnsupportedCard[] }
  | ({ type: 'presence'; color: number; name: string } & PresenceFields);

interface Deps {
  WebSocket?: typeof WebSocket;
  setTimeout?: typeof setTimeout;
}

/** Retry delays in ms; the last one repeats forever. */
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
/** At most 20 presence messages per second. */
const PRESENCE_INTERVAL_MS = 50;
const SOCKET_OPEN = 1;
/** Close code of the server for an unknown game. */
const CLOSE_GAME_NOT_FOUND = 4404;

/**
 * The live connection of one viewer to one game. It reconnects by itself
 * until close() is called or the game turns out not to exist.
 */
export class GameSession {
  view = $state<View | null>(null);
  role = $state<Role | null>(null);
  status = $state<Status>('connecting');
  lastError = $state<SessionError | null>(null);
  deckError = $state<UnsupportedCard[] | null>(null);
  /** The error that answered the last deck load, kept until the next load or a new deck. */
  deckLoadError = $state<SessionError | null>(null);
  readonly presence: Map<number, PresenceState> = new SvelteMap();

  readonly #gameId: string;
  readonly #name: string;
  readonly #WebSocketImpl: typeof WebSocket;
  readonly #setTimeout: (handler: () => void, ms: number) => void;

  #socket: WebSocket | null = null;
  #failedAttempts = 0;
  #nextActionId = 0;
  // Lobby errors carry no request id: the first error after a setDeck is
  // taken as its answer.
  #deckLoadPending = false;

  // Presence throttling: a message goes out at once if none went out in the
  // last interval, otherwise the latest one waits for the trailing edge.
  #presenceTimerRunning = false;
  #pendingPresence: PresenceFields | null = null;

  constructor(gameId: string, name: string, deps: Deps = {}) {
    this.#gameId = gameId;
    this.#name = name;
    this.#WebSocketImpl = deps.WebSocket ?? WebSocket;
    // Called as a plain function: the browser's setTimeout throws "Illegal
    // invocation" when it is called as a method of another object.
    const timer = deps.setTimeout ?? setTimeout;
    this.#setTimeout = (handler, ms) => {
      timer(handler, ms);
    };
  }

  connect(): void {
    const socket = new this.#WebSocketImpl(wsUrl(this.#gameId));
    this.#socket = socket;
    this.status = this.#failedAttempts === 0 ? 'connecting' : 'reconnecting';

    socket.onopen = () => {
      this.status = 'open';
      this.#send({ type: 'hello', token: getToken(this.#gameId) ?? undefined, name: this.#name });
    };
    socket.onmessage = (event: MessageEvent) => {
      this.#handleMessage(String(event.data));
    };
    // A browser always fires close after error, so close alone drives the retry.
    socket.onclose = (event: CloseEvent) => {
      if (this.#socket === socket) {
        this.#handleClose(event.code);
      }
    };
  }

  close(): void {
    this.#stop(null);
  }

  lobby(op: LobbyOp, payload: object = {}): void {
    if (op === 'setDeck') {
      this.deckError = null;
      this.deckLoadError = null;
      this.#deckLoadPending = true;
    }
    this.#send({ type: 'lobby', op, ...payload });
  }

  /** Sends an action and returns its id, which the server echoes in errors. */
  act(action: Action): number {
    this.#nextActionId += 1;
    this.#send({ type: 'action', id: this.#nextActionId, action });
    return this.#nextActionId;
  }

  /**
   * Relays the viewer's cursor, preview, drag or ping, at most 20 times a
   * second. Fields sent while waiting are merged, as each one is a change on
   * its own (a ping must not erase the cursor position).
   */
  sendPresence(fields: PresenceFields): void {
    if (this.#presenceTimerRunning) {
      this.#pendingPresence = { ...this.#pendingPresence, ...fields };
      return;
    }
    this.#send({ type: 'presence', ...fields });
    this.#startPresenceTimer();
  }

  #startPresenceTimer(): void {
    this.#presenceTimerRunning = true;
    this.#setTimeout(() => {
      this.#presenceTimerRunning = false;
      const pending = this.#pendingPresence;
      this.#pendingPresence = null;
      if (pending) {
        this.sendPresence(pending);
      }
    }, PRESENCE_INTERVAL_MS);
  }

  #send(message: object): void {
    if (this.#socket?.readyState === SOCKET_OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  #handleMessage(data: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(data) as ServerMessage;
    } catch {
      return; // The server never sends invalid JSON; ignore anything else.
    }

    switch (message.type) {
      case 'welcome':
        setToken(this.#gameId, message.token);
        this.role = message.role;
        break;
      case 'view':
        this.#handleView(message.view);
        break;
      case 'error':
        this.#handleError({ code: message.code, message: message.message }, message.id);
        break;
      case 'deckError':
        this.#deckLoadPending = false;
        this.deckError = message.unsupported;
        break;
      case 'presence':
        this.#handlePresence(message);
        break;
    }
  }

  #handleView(next: View): void {
    // The connection is healthy once the server has accepted the hello.
    this.#failedAttempts = 0;
    this.lastError = null;
    if (deckSignature(this.view) !== deckSignature(next)) {
      this.deckError = null;
      this.deckLoadError = null;
      this.#deckLoadPending = false;
    }
    this.view = next;
  }

  /**
   * Before the first view, an error means the hello failed. A game-level
   * notFound (no action id) ends the session; any other error is a failed
   * attempt, retried with the usual backoff. Afterwards, the first error
   * without an action id that follows a setDeck answers that deck load;
   * other errors only report.
   */
  #handleError(error: SessionError, actionId: number | undefined): void {
    if (this.#deckLoadPending && this.view !== null && actionId === undefined) {
      this.#deckLoadPending = false;
      this.deckLoadError = error;
      return;
    }
    this.lastError = error;
    if (this.view !== null) {
      return;
    }
    if (error.code === 'notFound' && actionId === undefined) {
      this.#stop(error);
      return;
    }
    const socket = this.#socket;
    this.#socket = null; // Its close event is now ignored.
    socket?.close();
    this.#scheduleReconnect();
  }

  #handlePresence(message: Extract<ServerMessage, { type: 'presence' }>): void {
    // Absent fields did not change: merge into what is known of the viewer.
    const { color, name, cursor, preview, drag, ping } = message;
    const changes = Object.fromEntries(
      Object.entries({ cursor, preview, drag, ping }).filter(([, value]) => value !== undefined),
    );
    this.presence.set(color, { ...this.presence.get(color), color, name, ...changes });
  }

  #handleClose(code: number): void {
    if (code === CLOSE_GAME_NOT_FOUND) {
      this.#stop(this.lastError ?? { code: 'notFound', message: 'This game does not exist.' });
      return;
    }
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    this.presence.clear();
    this.#deckLoadPending = false; // Its answer, if any, went with the old socket.
    this.status = 'reconnecting';
    const delay = BACKOFF_MS[Math.min(this.#failedAttempts, BACKOFF_MS.length - 1)] ?? 0;
    this.#failedAttempts += 1;
    this.#setTimeout(() => {
      if (this.status === 'reconnecting') {
        this.connect();
      }
    }, delay);
  }

  /** Ends the session for good: no retry follows. */
  #stop(error: SessionError | null): void {
    const socket = this.#socket;
    this.#socket = null; // Its close event is now ignored.
    this.status = 'closed';
    this.presence.clear();
    this.#deckLoadPending = false;
    if (error) {
      this.lastError = error;
    }
    socket?.close();
  }
}

/** Identifies the deck of the viewer's own player in a view. */
function deckSignature(view: View | null): string {
  const me = view?.players.find((player) => player.color === view.you.color);
  return JSON.stringify([me?.deckName, me?.hero, me?.heroName]);
}
