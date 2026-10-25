import { SvelteMap } from 'svelte/reactivity';
import { getToken, setToken } from './prefs';
import type {
  Action,
  LobbyConfig,
  PresenceDrag,
  PresenceFields,
  PresencePoint,
  PresenceState,
  Role,
  SessionError,
  UnsupportedCard,
  View,
} from './types';
import { wsUrl } from './api';

type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

type LobbyOp =
  | 'configure'
  | 'setDeck'
  | 'addDeck'
  | 'removeDeck'
  | 'removePlayer'
  | 'leave'
  | 'takeSeat'
  | 'start'
  | 'end';

/** The fields a lobby operation carries; which ones matter depends on the operation. */
interface LobbyPayload {
  url?: string; // setDeck: the deck link
  deck?: number; // setDeck, removeDeck: the caller's deck slot, 0 when absent
  config?: LobbyConfig; // configure
  color?: number; // removePlayer: the colour of the player to remove
}

type ServerMessage =
  | { type: 'welcome'; token: string; role: Role }
  | { type: 'view'; version: number; view: View }
  | { type: 'error'; id?: number; code: string; message: string }
  | { type: 'deckError'; unsupported: UnsupportedCard[] }
  | { type: 'deckSet'; version: number }
  | ({ type: 'presence'; color: number; name: string } & PresenceFields);

interface Deps {
  WebSocket?: typeof WebSocket;
  setTimeout?: typeof setTimeout;
}

/** Retry delays in ms; the last one repeats forever. */
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
/**
 * The least time between two moves of the cursor or of a drag sent to the
 * others (~7 a second): each message costs the server a Redis publish. The
 * table glides the others' cursors and drags over the same time.
 */
export const PRESENCE_INTERVAL_MS = 150;
/**
 * A move shorter than this, in table units (about CSS pixels at 100 %), is
 * not sent until the pointer stops: well below what the others can notice
 * while the cursor glides, ~1.5 % of a card's width, and above the 1-unit
 * jitter of rounding and of a trembling hand.
 */
const PRESENCE_DEAD_ZONE = 3;
const SOCKET_OPEN = 1;
/** Close code of the server for an unknown game. */
const CLOSE_GAME_NOT_FOUND = 4404;

/**
 * The live connection of one viewer to one game. It reconnects by itself
 * until close() is called or the game turns out not to exist.
 */
export class GameSession {
  view = $state<View | null>(null);
  status = $state<Status>('connecting');
  lastError = $state<SessionError | null>(null);
  deckError = $state<UnsupportedCard[] | null>(null);
  /** The error that answered the last deck load, kept until the next load or a new deck. */
  deckLoadError = $state<SessionError | null>(null);
  /** A deck load is in flight: sent, and not yet answered. */
  deckLoading = $state(false);
  /**
   * The number of deck loads the server confirmed with a deckSet. A load that
   * ends otherwise (an error, a lost connection) leaves it as it is.
   */
  deckLoaded = $state(0);
  readonly presence: Map<number, PresenceState> = new SvelteMap();
  /**
   * How long the viewer went without a live view before the current one came,
   * in ms: 0 when the connection held since the previous view, however long
   * ago it came; after a reconnection, the time since that previous view.
   * The table animates no change across a long gap.
   */
  viewGap = 0;

  readonly #gameId: string;
  readonly #name: string;
  readonly #WebSocketImpl: typeof WebSocket;
  readonly #setTimeout: (handler: () => void, ms: number) => void;

  #socket: WebSocket | null = null;
  #failedAttempts = 0;
  #nextActionId = 0;
  // The version of the last view, and the version named by a deckSet that
  // came before its view: the deck load ends with that view.
  #viewVersion: number | null = null;
  #deckSetVersion: number | null = null;
  // When the last view came, and whether the connection dropped since.
  #viewAt: number | null = null;
  #droppedSinceView = false;

  // Presence throttling (sendPresence). After a message, the moves wait for
  // the end of the interval, the latest winning; a move within the dead zone
  // of the last one sent is held until the pointer settles.
  #presenceWindowOpen = false;
  #pendingPresence: PresenceFields = {};
  #heldPresence: PresenceFields = {};
  // Tells whether a settle timer still holds the latest held value.
  #settleGeneration = 0;
  #sentCursor: PresencePoint | null = null;
  #sentDrag: PresenceDrag | null = null;
  // Presence gating: the number of other viewers who would see the viewer's
  // presence, from the last view, and the viewer's latest presence, recorded
  // even when nobody watches so that a newcomer gets it at once. The cursor
  // is undefined until the viewer first sets it.
  #othersWatching = 0;
  #latestCursor: PresencePoint | null | undefined = undefined;
  #latestDrag: PresenceDrag | null = null;
  #latestPreview = '';

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

    // Events of a replaced socket must not touch the session.
    socket.onopen = () => {
      if (this.#socket !== socket) {
        return;
      }
      this.status = 'open';
      this.#resetPresence();
      this.#send({ type: 'hello', token: getToken(this.#gameId) ?? undefined, name: this.#name });
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.#socket !== socket) {
        return;
      }
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

  /** Returns false when the message was not sent because the socket is not open. */
  lobby(op: LobbyOp, payload: LobbyPayload = {}): boolean {
    if (op === 'setDeck') {
      this.deckError = null;
      this.deckLoadError = null;
    }
    const sent = this.#send({ type: 'lobby', op, ...payload });
    if (sent && op === 'setDeck') {
      this.deckLoading = true;
    }
    return sent;
  }

  /**
   * Sends an action and returns its id, which the server echoes in errors,
   * or null when the action was not sent because the socket is not open.
   * The action is credited to `seat`, one of the viewer's own seats; without
   * it, the server credits the viewer's first seat.
   */
  act(action: Action, seat?: number): number | null {
    const id = this.#nextActionId + 1;
    const message =
      seat === undefined ? { type: 'action', id, action } : { type: 'action', id, action, seat };
    if (!this.#send(message)) {
      return null;
    }
    this.#nextActionId = id;
    return id;
  }

  /**
   * Relays the viewer's cursor, preview, drag or ping. Events (a ping, a
   * preview, the cursor leaving the table, a drag starting or ending) go out
   * at once. Moves (of the cursor, or of a drag) go out at most once per
   * interval, the latest winning, and a tiny move waits until the pointer
   * stops. An event carries the moves still waiting, so that none arrives
   * after it: the cursor's latest spot goes out with a ping, not after it.
   * The end of a drag is the exception: the moves waiting, the drag's last
   * one among them, go out first, as the others keep the ghost where the
   * drag ends.
   *
   * Nothing goes out while no other viewer is connected, no other player
   * and no spectator: each message costs the server a Redis publish that
   * nobody would receive. The viewer's own other tabs do not count, as the
   * server never relays presence to the sender's token. The latest cursor,
   * drag and preview are recorded all the same, and sent at once to a
   * newcomer (see #followOthersWatching); a ping, an event of its moment, is lost.
   */
  sendPresence(fields: PresenceFields): void {
    this.#recordPresence(fields);
    if (this.#othersWatching === 0) {
      return;
    }
    if (this.#isPresenceEvent(fields)) {
      this.#sendPresenceNow(fields);
      return;
    }
    this.#pendingPresence = { ...this.#pendingPresence, ...fields };
    if (!this.#presenceWindowOpen) {
      this.#releasePendingPresence();
    }
  }

  #recordPresence(fields: PresenceFields): void {
    if (fields.cursor !== undefined) {
      this.#latestCursor = fields.cursor;
    }
    if (fields.drag !== undefined) {
      this.#latestDrag = fields.drag;
    }
    if (fields.preview !== undefined) {
      this.#latestPreview = fields.preview;
    }
  }

  /**
   * Sends the viewer's latest presence at once, for viewers who just came:
   * the cursor once known, the drag in progress, the card previewed. A drag
   * started before they came then shows, and its later moves and its end
   * follow as usual.
   */
  #sendPresenceSnapshot(): void {
    const snapshot: PresenceFields = {};
    if (this.#latestCursor !== undefined) {
      snapshot.cursor = this.#latestCursor;
    }
    if (this.#latestDrag !== null) {
      snapshot.drag = this.#latestDrag;
    }
    if (this.#latestPreview !== '') {
      snapshot.preview = this.#latestPreview;
    }
    if (Object.keys(snapshot).length > 0) {
      this.#sendPresenceNow(snapshot);
    }
  }

  #isPresenceEvent(fields: PresenceFields): boolean {
    if (fields.ping !== undefined || fields.preview !== undefined) {
      return true;
    }
    if (fields.cursor === null || fields.drag === null) {
      return true;
    }
    // Other cards (or the token instead of cards) than the last drag sent: a new drag starts.
    return fields.drag !== undefined && !isSameLoad(fields.drag, this.#sentDrag);
  }

  /** Sends the fields with every move waiting or held, past the throttle and the dead zone. */
  #sendPresenceNow(fields: PresenceFields): void {
    const waiting = { ...this.#heldPresence, ...this.#pendingPresence };
    this.#heldPresence = {};
    this.#pendingPresence = {};
    if (fields.drag === null && waiting.drag) {
      // The others keep the ghost of a drag that ends where it was let go: the end must not
      // erase its last move, which goes out first.
      this.#transmitPresence(waiting);
      this.#transmitPresence(fields);
    } else {
      this.#transmitPresence({ ...waiting, ...fields });
    }
    this.#openPresenceWindow();
  }

  /** Sends one presence message, and notes the spots the others then know. */
  #transmitPresence(message: PresenceFields): void {
    if (!this.#send({ type: 'presence', ...message })) {
      return;
    }
    if (message.cursor !== undefined) {
      this.#sentCursor = message.cursor;
    }
    if (message.drag !== undefined) {
      this.#sentDrag = message.drag;
    }
  }

  /**
   * Forgets what the throttle knows of the last connection, or of the
   * viewers who all left: the spots sent then, and the moves waiting or
   * held. What follows starts afresh, so that its first move goes out at
   * once.
   */
  #resetPresence(): void {
    this.#pendingPresence = {};
    this.#heldPresence = {};
    this.#settleGeneration += 1; // A settle timer still running finds nothing to send.
    this.#sentCursor = null;
    this.#sentDrag = null;
  }

  /** Sends the moves waiting, but holds those within the dead zone of the last ones sent. */
  #releasePendingPresence(): void {
    const due = this.#pendingPresence;
    this.#pendingPresence = {};
    let held = false;
    if (due.cursor !== undefined && isNear(due.cursor, this.#sentCursor)) {
      this.#heldPresence.cursor = due.cursor;
      delete due.cursor;
      held = true;
    }
    // A drag waiting carries the load last sent: one of other cards is an event, sent at once.
    if (due.drag !== undefined && isNear(due.drag, this.#sentDrag)) {
      this.#heldPresence.drag = due.drag;
      delete due.drag;
      held = true;
    }
    if (Object.keys(due).length > 0) {
      this.#sendPresenceNow(due);
    } else if (held) {
      this.#settlePresence();
    }
  }

  /**
   * Sends the held moves once the pointer stays still for an interval: the
   * others then see exactly where it stopped. Each new held move restarts
   * the wait; the timer cannot be cleared, so a newer one makes it stale.
   */
  #settlePresence(): void {
    this.#settleGeneration += 1;
    const generation = this.#settleGeneration;
    this.#setTimeout(() => {
      const latest = generation === this.#settleGeneration;
      if (latest && Object.keys(this.#heldPresence).length > 0) {
        this.#sendPresenceNow({});
      }
    }, PRESENCE_INTERVAL_MS);
  }

  /** After a message, the moves wait for the end of the interval. */
  #openPresenceWindow(): void {
    if (this.#presenceWindowOpen) {
      return;
    }
    this.#presenceWindowOpen = true;
    this.#setTimeout(() => {
      this.#presenceWindowOpen = false;
      this.#releasePendingPresence();
    }, PRESENCE_INTERVAL_MS);
  }

  #send(message: object): boolean {
    if (this.#socket?.readyState !== SOCKET_OPEN) {
      return false;
    }
    this.#socket.send(JSON.stringify(message));
    return true;
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
        break;
      case 'view':
        this.#handleView(message.version, message.view);
        break;
      case 'error':
        this.#handleError(
          message.id === undefined
            ? { code: message.code, message: message.message }
            : { id: message.id, code: message.code, message: message.message },
        );
        break;
      case 'deckError':
        this.#endDeckLoad();
        this.deckError = message.unsupported;
        break;
      case 'deckSet':
        this.#handleDeckSet(message.version);
        break;
      case 'presence':
        this.#handlePresence(message);
        break;
    }
  }

  #handleView(version: number, next: View): void {
    // The connection is healthy once the server has accepted the hello.
    this.#failedAttempts = 0;
    this.lastError = null;
    this.#viewVersion = version;
    if (deckSignature(this.view) !== deckSignature(next)) {
      this.deckError = null;
      this.deckLoadError = null;
    }
    // A change of the viewer's decks says nothing of the load: it may come from
    // another tab, or overtake the error that answers the load. Only the
    // version of its deckSet does.
    if (this.#deckSetVersion !== null && version >= this.#deckSetVersion) {
      this.#confirmDeckLoad();
    }
    const now = Date.now();
    this.viewGap = this.#droppedSinceView && this.#viewAt !== null ? now - this.#viewAt : 0;
    this.#droppedSinceView = false;
    this.#viewAt = now;
    this.view = next;
    this.#followOthersWatching(next);
    // A colour no longer seated has left: its cursor must not linger.
    for (const color of [...this.presence.keys()]) {
      if (!next.players.some((player) => player.color === color)) {
        this.presence.delete(color);
      }
    }
  }

  /**
   * Gates presence on the viewers the view tells connected. Newcomers get
   * the latest presence at once, else they would see nothing until the next
   * move; once all have left, the throttle forgets what they were sent.
   */
  #followOthersWatching(next: View): void {
    const others = othersWatching(next);
    const newcomers = others > this.#othersWatching;
    this.#othersWatching = others;
    if (others === 0) {
      this.#resetPresence();
    } else if (newcomers) {
      this.#sendPresenceSnapshot();
    }
  }

  /**
   * Ends the deck load the server acknowledged, once the view holds the
   * version the deck was set in. The view and the deckSet come in either
   * order: when the deckSet comes first, the load ends with the view.
   */
  #handleDeckSet(version: number): void {
    if (!this.deckLoading) {
      return;
    }
    if (this.#viewVersion !== null && this.#viewVersion >= version) {
      this.#confirmDeckLoad();
    } else {
      this.#deckSetVersion = version;
    }
  }

  #confirmDeckLoad(): void {
    this.#endDeckLoad();
    this.deckLoaded += 1;
  }

  #endDeckLoad(): void {
    this.deckLoading = false;
    this.#deckSetVersion = null;
  }

  /**
   * Before the first view, an error means the hello failed. A game-level
   * notFound (no action id) ends the session; any other error is a failed
   * attempt, retried with the usual backoff. Afterwards, the first error
   * without an action id that follows a setDeck answers that deck load,
   * unless its deckSet came already; other errors only report.
   */
  #handleError(error: SessionError): void {
    const actionId = error.id;
    // Lobby errors carry no request id: the first one during a load is its
    // answer, until the deckSet that answers it instead.
    const awaitingAnswer = this.deckLoading && this.#deckSetVersion === null;
    if (awaitingAnswer && this.view !== null && actionId === undefined) {
      this.#endDeckLoad();
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
    // Stamped, so that the table can hide a silent viewer and tell a new ping from an old one.
    const at = Date.now();
    const state: PresenceState = { ...this.presence.get(color), color, name, ...changes, at };
    if (ping !== undefined) {
      state.pingAt = at;
    }
    this.presence.set(color, state);
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
    // Until the next view tells who is there, nobody watches.
    this.#othersWatching = 0;
    this.#droppedSinceView = true;
    this.#endDeckLoad(); // Its answer, if any, went with the old socket.
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
    this.#othersWatching = 0;
    this.#endDeckLoad();
    if (error) {
      this.lastError = error;
    }
    socket?.close();
  }
}

/** Identifies the decks of the viewer's own player in a view. */
function deckSignature(view: View | null): string {
  const me = view?.players.find((player) => player.color === view.you.color);
  const decks = me?.decks.map((deck) => [deck.deckName, deck.hero, deck.heroName]);
  return JSON.stringify(decks);
}

/**
 * The number of the other viewers connected to the game, who would see the
 * viewer's presence. A player's own tabs share their colour and never count.
 */
function othersWatching(view: View): number {
  const otherPlayers = view.players.filter(
    (player) => player.online && player.color !== view.you.color,
  ).length;
  return otherPlayers + view.spectators;
}

/** Whether a drag carries the same cards, or the token, as another one: it only moved. */
function isSameLoad(drag: PresenceDrag, other: PresenceDrag | null): boolean {
  if (other === null || drag.token !== other.token) {
    return false;
  }
  return (
    drag.cards.length === other.cards.length && drag.cards.every((id, i) => id === other.cards[i])
  );
}

/** Whether a spot lies within the dead zone of the last one sent. */
function isNear(spot: PresencePoint | null, sent: PresencePoint | null): boolean {
  if (spot === null || sent === null) {
    return false;
  }
  const dx = spot.x - sent.x;
  const dy = spot.y - sent.y;
  return dx * dx + dy * dy < PRESENCE_DEAD_ZONE * PRESENCE_DEAD_ZONE;
}
