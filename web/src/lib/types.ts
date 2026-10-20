// Wire types. They mirror the Go JSON: internal/pack/types.go,
// internal/game/{game,state,view,action}.go. Fields the Go side marks
// omitempty are optional here.

// ---- Card packs (internal/pack) ----

export type Size = 'std' | 'land' | 'dstd' | 'dland';
export type Back = 'player' | 'encounter' | 'villain';
export type Difficulty = 'standard' | 'expert';

export interface Threat {
  value: number;
  perPlayer: boolean;
}

export interface PackFace {
  name: string;
  subname?: string;
  type: string;
  stage?: string;
  size: Size;
  images: string[];
  handSize?: number;
  startingThreat?: Threat;
  localized?: Record<string, PackLocalized>; // by language code, e.g. "fr"
}

/** The overrides of a face or an index entry in one language; absent fields fall back to English. */
export interface PackLocalized {
  name?: string;
  subname?: string;
  images?: string[]; // tried before the English images
}

export interface PackCard {
  code: string;
  faces: PackFace[];
  set?: string;
  back: Back;
  quantity: number;
  aliases?: string[];
}

export interface PackRef {
  code: string;
  name: string;
  file: string;
  position: number;
  localized?: Record<string, PackLocalized>; // name only, by language code
}

export interface ScenarioRef {
  id: string;
  name: string;
  pack: string;
  image: string;
  supported: boolean;
  recommended: string[];
  localized?: Record<string, PackLocalized>; // name only, by language code
}

export interface SetRef {
  code: string;
  name: string;
  pack: string;
  kind: string;
  localized?: Record<string, PackLocalized>; // name only, by language code
}

export interface Index {
  version: number;
  lang: string;
  packs: PackRef[];
  scenarios: ScenarioRef[];
  sets: SetRef[];
}

/** The cards of a started game, from GET /api/games/{id}/cards: one entry per distinct card. */
export interface CardPool {
  version: number;
  cards: PackCard[];
}

// ---- Game view (internal/game) ----

export type Phase = 'lobby' | 'playing' | 'ended';
export type Role = 'player' | 'spectator';
export type Zone = 'table' | 'hand' | 'pile' | 'stage';
export type PileKind = 'deck' | 'discard' | 'encounter' | 'encounterDiscard' | 'victory' | 'aside';

/**
 * A seat: "p0".."p3" for the player seated at that index. It says whose hand
 * or whose view, never a place on the table: the table is one surface.
 */
export type Area = `p${number}`;

export interface CardView {
  id: string;
  code?: string; // absent for a face-down table card
  face: number;
  faceDown?: boolean;
  back: Back;
  owner: number; // seat, -1 for no owner
  zone: Zone;
  x: number;
  y: number;
  z: number;
  parent?: string;
  onPile?: string;
  exhausted?: boolean;
  tokens?: Record<string, number>;
  status?: Record<string, number>;
  stage?: string;
}

export interface PileView {
  id: string;
  kind: PileKind;
  owner: number;
  x: number;
  y: number;
  count: number;
  cards?: string[]; // bottom to top, public piles only
}

/** One deck slot of a player: a seat at the table once the game starts. */
export interface DeckView {
  area?: Area;
  hero?: string;
  heroName?: string;
  heroImage?: string; // the hero face image of the identity
  deckName?: string;
  ready: boolean;
  handCount: number;
}

export interface PlayerView {
  name: string;
  color: number;
  host: boolean;
  ready: boolean; // every deck slot holds a deck
  decks: DeckView[];
}

/** Points at one face of a card: its canonical code and face index. */
export interface FaceRef {
  card: string;
  face: number;
}

/**
 * A piece of a history line: plain text, or the printed name of a card. A card
 * name refers to the face it names, so it can be shown in the viewer's
 * language; `text` is the English name.
 */
export interface LogPart {
  text: string;
  card?: boolean;
  ref?: FaceRef;
}

export interface LogView {
  who: string;
  color: number; // -1 for system lines
  text: string;
  at: string; // RFC 3339
  undone?: boolean;
  cards?: string[];
  /** The text in parts, card names flagged; absent when the line names no card. */
  parts?: LogPart[];
}

export interface YouView {
  role?: Role; // absent for an unknown token
  name?: string;
  color: number;
  host: boolean;
  areas?: Area[]; // the viewer's own seats, in order
}

export interface Stage {
  key: string;
  label: string;
  current: string;
  cards: string[];
}

export interface Arrow {
  from: string;
  to: string;
  seat: number;
}

/** A spot of the table, in table units. */
export interface Point {
  x: number;
  y: number;
}

export interface PrivateView {
  pile: string;
  mode: 'top' | 'search';
  cards: string[]; // top first
}

export interface TableView {
  cards: CardView[];
  piles: PileView[];
  hands?: Partial<Record<Area, string[]>>; // the hands of the viewer's own seats only
  stages: Stage[];
  firstPlayer: Point;
  arrows?: Arrow[];
  private?: PrivateView;
}

export interface LobbyConfig {
  scenario: string;
  difficulty: Difficulty;
  standard: string;
  expert: string;
  modulars: string[];
}

export interface View {
  id: string;
  phase: Phase;
  you: YouView;
  players: PlayerView[];
  spectators: number;
  config: LobbyConfig;
  table?: TableView;
  log: LogView[];
  canUndo?: boolean;
}

// ---- Actions ----

export type ActionKind =
  | 'move'
  | 'attach'
  | 'toHand'
  | 'toDeck'
  | 'discard'
  | 'toPile'
  | 'play'
  | 'exhaust'
  | 'readyAll' // ready every exhausted table card, whoever owns it
  | 'flip'
  | 'token'
  | 'status'
  | 'chooseStage'
  | 'draw'
  | 'reveal'
  | 'deal'
  | 'discardTop'
  | 'shuffle'
  | 'shuffleBack'
  | 'shuffleIn'
  | 'reorderTop'
  | 'handOrder'
  | 'firstPlayer'
  | 'arrowAdd'
  | 'arrowClear'
  | 'look' // open a private view of the top `n` cards of `pile`
  | 'search' // open a private view of the whole `pile`
  | 'closeView' // close the view; `where: 'shuffle'` also shuffles the pile
  | 'group' // several cards moved at once: `actions`, all of one kind
  | 'undo';

/**
 * An action as a client sends it. Which fields matter depends on `kind`.
 *
 * Left out on purpose, because the server fills them while resolving the
 * action: `renames` (shuffles), `seat` (acting seat), `exhausted` and
 * `faceDown` (outcome of an exhaust or a flip).
 */
export interface Action {
  kind: ActionKind;
  card?: string;
  target?: string; // card id (attach, arrow, play under it) or pile id
  pile?: string;
  area?: Area; // whose hand (draw, handOrder), or who is dealt a card (deal)
  x?: number;
  y?: number;
  /** A card tucked under `target` (attach, play) lies at `x`, `y`, where it was dropped. */
  placed?: boolean;
  n?: number;
  name?: string; // token or status name
  delta?: number;
  face?: number; // chosen stage face
  where?: 'top' | 'bottom' | 'shuffle';
  stage?: string;
  cards?: string[]; // new order, for reorderTop and handOrder
  actions?: Action[]; // one per card of a group: move, toHand, toDeck, discard or toPile
}

// ---- Live session (internal/server/protocol.go) ----

/** A spot of the table, in table units: where a cursor is, or what a ping points at. */
export interface PresencePoint {
  x: number;
  y: number;
}

/**
 * A drag in progress: the cards dragged, or the first player token, and where
 * their corner is, in table units.
 */
export interface PresenceDrag {
  /** Empty for the token, which carries no card. */
  cards: string[];
  /** The first player token is dragged. */
  token?: boolean;
  x: number;
  y: number;
}

/** The fields a presence message relays; each is absent when it did not change. */
export interface PresenceFields {
  cursor?: PresencePoint | null; // null while the viewer is off the table: hand raised, dialog open
  preview?: string; // id of the card or pile being previewed, '' once cleared
  drag?: PresenceDrag | null; // null once the drag ended
  ping?: PresencePoint;
}

/** What is known of another viewer: the last value of each relayed field. */
export interface PresenceState extends PresenceFields {
  color: number;
  name: string;
  /** When their last message came, in ms since the epoch. */
  at: number;
  /** When their last ping came: a ping is an event, not a state. */
  pingAt?: number;
}

/** A card of an imported deck that the game cannot use. */
export interface UnsupportedCard {
  code: string;
  name: string;
  pack: string;
  qty: number;
}

export interface SessionError {
  id?: number; // id of the action this error answers, when it answers one
  code: string;
  message: string;
}
