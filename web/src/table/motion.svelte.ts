// Plays the animations of animate.ts on the table, with the Web Animations
// API, as the prototype's animateFrom and playShuffles do: cards sliding to
// their new place or out of a pile onto the table, copies of cards flying to
// a pile, out of one into the hand, or between two piles, and copies going
// into or out of a hand the viewer does not see. An out-of-play pile is not
// drawn: the chip on its owner's frame stands for it. Nothing here holds the
// table up: the new view is drawn at once, in its final state, and the
// animations only paint over it, never catching the pointer.

import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import {
  MARKERS,
  markerPoint,
  type Back,
  type CardView,
  type MarkerName,
  type PileView,
  type TableView,
} from '../lib/types';
import type { Anim, Turn } from './animate';
import { unknownTopId } from './drag';
import { pileBack, pileCaption } from './face';

/** A card moving to its new place (FLIP). */
const MOVE_MS = 250;
const MOVE_EASING = 'cubic-bezier(.2, .8, .2, 1)';
/** A stage card just chosen turns in like a card being put down. */
const TURN_IN_MS = 420;
/** A card turned over: its old side turns away edge-on, then its new side turns in. */
const FLIP_MS = 360;
const FLIP_PERSPECTIVE = 'perspective(700px)';
/** The soft flash on a card that just changed. */
const GLOW_MS = 1100;
/**
 * Copies of the pile's back split left and right, then riffle back in, one
 * after the other. A pile that cards fly into riffles once the last of them
 * has landed, so that the shuffle is seen to mix them in.
 */
const RIFFLE_MS = 620;
const RIFFLE_COPIES = 6;
const RIFFLE_STAGGER_MS = 40;
const RIFFLE_EASING = 'cubic-bezier(.3, .7, .3, 1)';
const PILE_BOUNCE_MS = 700;
/** A copy of a discarded card flies to its pile; several leave one after the other. */
const FLY_MS = 420;
const FLY_STAGGER_MS = 70;
const FLY_EASING = 'cubic-bezier(.3, .7, .2, 1)';
/**
 * A landscape copy flying to a portrait pile turns a quarter on its way
 * (quarterFrames); when it turns over, it does so once on the pile, as a
 * card turned over on the table does (FLIP_MS), edge-on half way.
 */
const QUARTER_FLIP_MS = FLY_MS + FLIP_MS;
const QUARTER_LANDS_AT = FLY_MS / QUARTER_FLIP_MS;
const QUARTER_EDGE_ON = (FLY_MS + FLIP_MS / 2) / QUARTER_FLIP_MS;
/** A card put at the bottom of a pile flies just below it, then slips under it. */
const UNDER_MS = 640;
const UNDER_LANDS_AT = 0.6;
/**
 * A copy of a drawn card flies from its pile to its slot in the hand. Out of a
 * hidden pile it turns over on the way in: edge-on from its back, then flat
 * on its face.
 */
const DRAW_MS = 380;
const DRAW_TURN_FROM = 0.6;
const DRAW_EDGE_ON = 0.8;
/** A card drawn into a hand the viewer does not see slides down out of its pile, fading. */
const DRAW_AWAY_DROP_PX = 40;
const DRAW_AWAY_SCALE = 0.85;

/** A card or a pile on the screen: its middle, and its size without its tilt. */
interface Measured {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A copy of a card flying to or out of a pile, drawn by Flights.svelte. */
interface FlightBase {
  key: number;
  from: Measured;
  delay: number;
}

/** A copy of a card on its way from its old place, or the pile it left, to the pile it went to. */
interface PileFlight extends FlightBase {
  kind: 'toPile';
  /** The pile it flies to. */
  pile: string;
  /**
   * The card as it was before it left, or as its new pile lists it when it
   * turns face up there or was not listed before.
   */
  card: CardView;
  to: Measured;
  /** Put at the bottom of the pile: it lands just below it, then slips under it. */
  under: boolean;
  /**
   * Its face shows as a pile draws it, a landscape card turned a quarter
   * (facesAsOnPile); otherwise as the table or the hand draws it.
   */
  asOnPile: boolean;
  /**
   * It turns over on the way, as a drawn card does: face up, leaving on its
   * back, or face down, leaving on its face.
   */
  turns: Turn | undefined;
  /**
   * A landscape copy going to a portrait pile: it turns a quarter counter-
   * clockwise on its way, as the pile draws it, then turns over there.
   */
  quarter: boolean;
}

/** A copy of a drawn card on its way from its pile to its slot in the hand. */
interface DrawFlight extends FlightBase {
  kind: 'draw';
  /** The pile it flies out of. */
  pile: string;
  /** The card as it is in the hand. */
  card: CardView;
  /** It shows its face all along; otherwise it leaves on its back and turns over on the way. */
  faceUp: boolean;
  to: Measured;
  /** The slot's tilt on the fan, in degrees. */
  angle: number;
}

/** A copy of a card going into or out of a hand the viewer does not see. */
interface UnseenHandFlight extends FlightBase {
  /** The card, when the viewer saw it on the pile or the table. */
  card: CardView | undefined;
  /** The back it shows otherwise: its pile's. */
  back: Back;
  /** The caption of that back: the label of a side deck with its own back. */
  caption: string | undefined;
}

/** A copy of a card leaving its pile, or the table, for a hand the viewer does not see. */
interface AwayFlight extends UnseenHandFlight {
  kind: 'drawAway';
  /** The pile it leaves; none for a card taken from the table. */
  pile: string | undefined;
}

/** A copy of a card rising into its pile out of a hand the viewer does not see. */
interface ArriveFlight extends UnseenHandFlight {
  kind: 'arrive';
  /** The pile it rises into. */
  pile: string;
}

type Flight = PileFlight | DrawFlight | AwayFlight | ArriveFlight;

const tableCard = (id: string) => `.surface .card:not(.pile)[data-id="${CSS.escape(id)}"]`;
const handCard = (id: string) => `.hand .hcard[data-id="${CSS.escape(id)}"]`;
/** A card another player drags, or has just let go of (Presence.svelte). */
const remoteGhost = (id: string) => `.presence .card.ghost[data-id="${CSS.escape(id)}"]`;
/** The viewer's own drop, lying where it landed until the view shows it (DragLayer.svelte). */
const ownGhost = (id: string) => `.draglayer .card.ghost.landed[data-id="${CSS.escape(id)}"]`;
const tablePile = (id: string) => `.surface .pile[data-id="${CSS.escape(id)}"]`;
/**
 * A pile where it shows: drawn on the table, or, out of play, the chip on its
 * owner's frame (Surface.svelte). A pile is never both.
 */
const pilePlace = (id: string) => `${tablePile(id)}, .surface .chip[data-pile="${CSS.escape(id)}"]`;
const tableMarker = (name: MarkerName) => `.surface .marker[data-marker="${name}"]`;
/** The marker another player drags, or has just let go of (Presence.svelte). */
const remoteMarker = (name: MarkerName) => `.presence .marker.ghost[data-marker="${name}"]`;

/**
 * What an animation plays on, "card:<id>", "pile:<id>" or
 * "marker:<name>": a new view stops only what it touches.
 */
type Subject = `card:${string}` | `pile:${string}` | `marker:${MarkerName}`;

const cardSubject = (id: string): Subject => `card:${id}`;
const pileSubject = (id: string): Subject => `pile:${id}`;
const markerSubject = (name: MarkerName): Subject => `marker:${name}`;

/**
 * A card drawn into a hand the viewer does not see, or put on a pile out of
 * one, is about nothing on the table: its copy only leaves or reaches the
 * pile, which plays on as it does, and a later one there plays after it.
 */
function subjectOf(anim: Anim): Subject | null {
  switch (anim.kind) {
    case 'shuffle':
    case 'reveal':
      return pileSubject(anim.pile);
    case 'drawAway':
    case 'arrive':
      return null;
    case 'marker':
      return markerSubject(anim.name);
    default:
      return cardSubject(anim.id);
  }
}

/** The subjects of a table: its cards drawn on the table or in the hand, its piles and the markers present. */
function subjectsOf(table: TableView | undefined): Set<Subject> {
  // A lookup for one call: nothing reacts to it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const subjects = new Set<Subject>();
  for (const name of MARKERS) {
    if (table && markerPoint(table, name)) {
      subjects.add(markerSubject(name));
    }
  }
  for (const card of table?.cards ?? []) {
    if (card.zone === 'table' || card.zone === 'hand') {
      subjects.add(cardSubject(card.id));
    }
  }
  for (const pile of table?.piles ?? []) {
    subjects.add(pileSubject(pile.id));
  }
  return subjects;
}

/** How much an element is scaled on the screen: by the zoom on the table, by the hand's own transform. */
function scaleOf(element: HTMLElement, zoom: number): number {
  if (element.closest('.surface')) {
    return zoom;
  }
  const width = element.offsetWidth;
  return width ? element.getBoundingClientRect().width / width : 1;
}

/**
 * A hand card's place on the screen at rest on its slot, and its tilt there:
 * neither popped by a hover nor raised by a selection, which only its picture
 * (.fan) shows. Lowered or raised, the hand is where it shows now.
 */
function measureSlot(card: HTMLElement): { slot: Measured; angle: number } {
  const rest = card.querySelector<HTMLElement>('.hit') ?? card;
  const rect = rest.getBoundingClientRect();
  // The card itself is never tilted: its rect gives the hand's scale.
  const scale = scaleOf(card, 1);
  return {
    slot: {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      w: card.offsetWidth ? card.offsetWidth * scale : rect.width,
      h: card.offsetHeight ? card.offsetHeight * scale : rect.height,
    },
    angle: Number.parseFloat(card.style.getPropertyValue('--rot')) || 0,
  };
}

/** Whether a place on the screen moved or changed size by more than a fraction of a pixel. */
function hasMoved(was: Measured, now: Measured): boolean {
  return (
    Math.abs(was.cx - now.cx) > 0.5 ||
    Math.abs(was.cy - now.cy) > 0.5 ||
    Math.abs(was.w - now.w) > 0.5 ||
    Math.abs(was.h - now.h) > 0.5
  );
}

function measure(element: HTMLElement, zoom: number): Measured {
  const rect = element.getBoundingClientRect();
  // An exhausted card's rect is the box around its tilt: its own size is its layout size, scaled.
  const scale = scaleOf(element, zoom);
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w: element.offsetWidth ? element.offsetWidth * scale : rect.width,
    h: element.offsetHeight ? element.offsetHeight * scale : rect.height,
  };
}

/**
 * What a card about to travel shows on now: another player's ghost of it,
 * where they let it go; else its place on the table or in the hand, or the
 * pile it leaves. The viewer's own drop slipping under a pile, or flying to
 * one, lies where it landed.
 */
function originOf(root: HTMLElement, anim: Anim, piles: readonly PileView[]): HTMLElement | null {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector);
  const placed = (id: string) => `${tableCard(id)}, ${handCard(id)}`;
  switch (anim.kind) {
    case 'move':
    case 'away':
      return find(remoteGhost(anim.id)) ?? find(placed(anim.id));
    case 'under':
      return find(remoteGhost(anim.id)) ?? find(ownGhost(anim.id)) ?? find(placed(anim.id));
    case 'fly': {
      const place = anim.fromPile === undefined ? placed(anim.id) : pilePlace(anim.fromPile);
      const ghost = find(remoteGhost(anim.id)) ?? find(ownGhost(anim.id));
      // A deck's hidden top card the viewer dragged landed as an unknown card, not under its id.
      const pile = anim.dropped ? piles.find((p) => p.id === anim.fromPile) : undefined;
      const unknownTop = pile ? find(ownGhost(unknownTopId(pile))) : null;
      return ghost ?? unknownTop ?? find(place);
    }
    case 'enter':
      return find(remoteGhost(anim.id)) ?? find(pilePlace(anim.fromPile));
    default:
      return null;
  }
}

/**
 * Whether a copy flying to a pile shows its face as a pile draws it: where
 * it shows it, on the pile it leaves, or, turning face up, on the pile it
 * lands on. A card revealed on a deck lies there as the pile draws it. The
 * viewer's own drop leaves its ghost, which the table draws.
 */
function facesAsOnPile(anim: Extract<Anim, { kind: 'fly' }>, card: CardView | undefined): boolean {
  if (anim.turns === 'up' || card?.onPile !== undefined) {
    return true;
  }
  return anim.fromPile !== undefined && !anim.dropped;
}

/** The pile an animation leaves or reaches without a card on the table: a draw's, or a hand's unseen card's. */
function pileOf(anim: Anim): string | null {
  switch (anim.kind) {
    case 'draw':
      return anim.fromPile;
    case 'drawAway':
    case 'arrive':
      return anim.pile;
    default:
      return null;
  }
}

/** The back a copy shows for a card the viewer did not see: the one its pile shows. */
function backOf(pile: PileView | undefined): Pick<UnseenHandFlight, 'back' | 'caption'> {
  return { back: pile ? pileBack(pile) : 'player', caption: pile ? pileCaption(pile) : undefined };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** A player colour (styles/tokens.css) as the keyframes need it: a value, not a var(). */
function playerColor(color: number): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--p${color + 1}`)
    .trim();
  return value || '#ffffff';
}

/**
 * A copy's way from one place to another, tilting to angle degrees as it
 * goes; when it turns, it turns over in the last part of the way: edge-on
 * from one side, then flat on the other.
 */
function turningFrames(from: Measured, to: Measured, angle: number, turns: boolean): Keyframe[] {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const scale = from.w ? to.w / from.w : 1;
  // Part of the way there, turned about its vertical axis by turn degrees.
  const at = (progress: number, turn: number): Keyframe => ({
    transform:
      `${FLIP_PERSPECTIVE} translate(${dx * progress}px, ${dy * progress}px)` +
      ` rotate(${angle * progress}deg) scale(${1 + (scale - 1) * progress}) rotateY(${turn}deg)`,
    offset: progress,
  });
  if (!turns) {
    return [at(0, 0), at(1, 0)];
  }
  return [at(0, 0), at(DRAW_TURN_FROM, 0), at(DRAW_EDGE_ON, 90), at(1, 0)];
}

/** A flight's copy from its pile to the hand, turning over on the way unless it shows its face. */
function drawFrames(flight: DrawFlight): Keyframe[] {
  return turningFrames(flight.from, flight.to, flight.angle, !flight.faceUp);
}

/**
 * The back drawn over a turning copy's face, edgeOn the part of the way where
 * the copy is edge-on: turning face up, it is gone from then on; turning face
 * down, it shows from then on.
 */
function backFrames(turns: Turn, edgeOn: number): Keyframe[] {
  const first = turns === 'up' ? 1 : 0;
  const then = 1 - first;
  return [
    { opacity: first, offset: 0 },
    { opacity: first, offset: edgeOn },
    { opacity: then, offset: edgeOn },
    { opacity: then, offset: 1 },
  ];
}

const DRAW_AWAY_FRAMES: Keyframe[] = [
  { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  { transform: `translate(0, ${DRAW_AWAY_DROP_PX}px) scale(${DRAW_AWAY_SCALE})`, opacity: 0 },
];

/** A card put on a pile out of a hand the viewer does not see rises into it, fading in. */
const ARRIVE_FRAMES: Keyframe[] = [...DRAW_AWAY_FRAMES].reverse();

/**
 * A card slipping under its pile: it flies to just below the pile, then slides
 * up into it, only its part past the pile's bottom edge showing, as if the
 * pile lay over it. The clip is in the copy's own box, before its scale.
 */
function underFrames(flight: PileFlight): Keyframe[] {
  const dx = flight.to.cx - flight.from.cx;
  const dy = flight.to.cy - flight.from.cy;
  const scale = flight.from.w ? flight.to.w / flight.from.w : 1;
  return [
    { transform: 'translate(0, 0) scale(1)', clipPath: 'inset(0% 0 0 0)' },
    {
      transform: `translate(${dx}px, ${dy + flight.to.h}px) scale(${scale})`,
      clipPath: 'inset(0% 0 0 0)',
      offset: UNDER_LANDS_AT,
      easing: 'ease-in-out',
    },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: 'inset(100% 0 0 0)' },
  ];
}

function toPileFrames(flight: PileFlight): Keyframe[] {
  const dx = flight.to.cx - flight.from.cx;
  const dy = flight.to.cy - flight.from.cy;
  const scale = flight.from.w ? flight.to.w / flight.from.w : 1;
  return [
    { transform: 'translate(0, 0) scale(1)' },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
  ];
}

/**
 * A landscape copy's way to a portrait pile (PileFlight.quarter): it turns a
 * quarter counter-clockwise as it goes, its long side ending as tall as the
 * pile. When it turns over, it does so on the pile, about the screen's
 * vertical axis: the turn comes before the quarter in the transform. The
 * keyframes carry their own easing: the animation runs linear.
 */
function quarterFrames(flight: PileFlight): Keyframe[] {
  const dx = flight.to.cx - flight.from.cx;
  const dy = flight.to.cy - flight.from.cy;
  const scale = flight.from.w ? flight.to.h / flight.from.w : 1;
  // Part of the way there, turned about the screen's vertical axis by turn degrees.
  const pose = (progress: number, turn: number): string =>
    `${FLIP_PERSPECTIVE} translate(${dx * progress}px, ${dy * progress}px) rotateY(${turn}deg)` +
    ` rotate(${-90 * progress}deg) scale(${1 + (scale - 1) * progress})`;
  if (!flight.turns) {
    return [
      { transform: pose(0, 0), offset: 0, easing: FLY_EASING },
      { transform: pose(1, 0), offset: 1 },
    ];
  }
  return [
    { transform: pose(0, 0), offset: 0, easing: FLY_EASING },
    { transform: pose(1, 0), offset: QUARTER_LANDS_AT, easing: 'ease-in' },
    { transform: pose(1, 90), offset: QUARTER_EDGE_ON, easing: 'ease-out' },
    { transform: pose(1, 0), offset: 1 },
  ];
}

/** How long a copy takes to get where it goes, turned over there when it turns a quarter on its way. */
function flightMs(flight: Flight): number {
  if (flight.kind !== 'toPile') {
    return DRAW_MS;
  }
  if (flight.under) {
    return UNDER_MS;
  }
  return flight.quarter && flight.turns ? QUARTER_FLIP_MS : FLY_MS;
}

/** When the last copy flying into a pile lands on it, from now (0 with none). */
function lastLanding(flights: Flight[], pile: string): number {
  let landing = 0;
  for (const flight of flights) {
    const intoPile = flight.kind === 'toPile' || flight.kind === 'arrive';
    if (intoPile && flight.pile === pile) {
      landing = Math.max(landing, flight.delay + flightMs(flight));
    }
  }
  return landing;
}

/**
 * Copies of the same kind leave one after the other, in the order of their
 * animations; those leaving for or coming out of a hand the viewer does not
 * see, pile by pile.
 */
function staggered(flights: Flight[]): Flight[] {
  // A count for one call: nothing reacts to it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const counts = new Map<string, number>();
  return flights.map((flight) => {
    const byPile = flight.kind === 'drawAway' || flight.kind === 'arrive';
    const group = byPile ? `${flight.kind}:${flight.pile ?? ''}` : flight.kind;
    const count = counts.get(group) ?? 0;
    counts.set(group, count + 1);
    return { ...flight, delay: count * FLY_STAGGER_MS };
  });
}

/**
 * Whether a new view ends a flight: it animates the flight's card again, or
 * the card is no longer where the copy goes, or the pile it leaves or goes to
 * is gone.
 */
function flightEnds(flight: Flight, touched: Set<Subject>, after: TableView | undefined): boolean {
  const cards = after?.cards ?? [];
  const piles = after?.piles ?? [];
  const isTouched = (card: CardView | undefined) =>
    card !== undefined && touched.has(cardSubject(card.id));
  /**
   * Whether the card is no longer on the pile it goes to. A card put under a
   * pile, or on one that lists none of its cards (a deck), is not listed
   * there: the pile must only still be there.
   */
  const leftPile = (pileId: string, card: CardView | undefined, listed: boolean) => {
    const pile = piles.find((p) => p.id === pileId);
    if (!pile) {
      return true;
    }
    return (
      listed && card !== undefined && pile.cards !== undefined && !pile.cards.includes(card.id)
    );
  };
  switch (flight.kind) {
    case 'toPile':
      return isTouched(flight.card) || leftPile(flight.pile, flight.card, !flight.under);
    case 'arrive':
      return isTouched(flight.card) || leftPile(flight.pile, flight.card, true);
    case 'draw':
      return (
        isTouched(flight.card) ||
        !cards.some((card) => card.id === flight.card.id && card.zone === 'hand')
      );
    case 'drawAway':
      // Out of the table, it fades where the card was: it ends only when that card comes back.
      if (flight.pile === undefined) {
        return isTouched(flight.card);
      }
      return !piles.some((pile) => pile.id === flight.pile);
  }
}

class TableMotion {
  /** The copies of cards flying to and out of piles. */
  flights = $state.raw<Flight[]>([]);
  /** The cards flying to a pile: their pile is drawn as it was until they land. */
  readonly flying = new SvelteSet<string>();
  /** The cards drawn into the hand, flying in from their pile: hidden in the hand until they land. */
  readonly drawing = new SvelteSet<string>();
  /**
   * Counts the frames while cards move: what is drawn from the cards' places
   * on the screen (the arrows) measures again at each one.
   */
  frame = $state(0);

  /** Whether cards move on the screen: animated to a new place, or flying to and from piles. */
  get moving(): boolean {
    return this.#cardsMoving || this.flights.length > 0;
  }

  #cardsMoving = $state(false);

  // Each running animation, with what it plays on.
  #running = new Map<Animation, Subject>();
  // The animations that move cards on the screen, which the frame counter follows.
  #moving = new Set<Animation>();
  // The riffle copies added to piles, with their pile.
  #copies = new Map<HTMLElement, Subject>();
  #raf = 0;
  #nextKey = 0;
  // Counts the views animated: a view that came while the previous one was drawn takes over.
  #generation = 0;

  /**
   * To call as a new view is about to be drawn: measures the cards that will
   * move where they are now, then plays the animations once the view is
   * drawn. What still plays on the cards and piles the new view animates,
   * or on those it no longer shows, stops first (a card caught mid-move
   * starts again from where it shows); everything else plays on to its end.
   */
  async animate(
    root: HTMLElement | undefined,
    anims: Anim[],
    tables: { before: TableView | undefined; after: TableView | undefined },
    zoom: number,
  ): Promise<void> {
    const reduced = prefersReducedMotion();
    // Without motion, the state shows at once; the glow is a flash, not a motion.
    const shown = reduced ? anims.filter((anim) => anim.kind === 'glow') : anims;
    // Read within this call only: nothing reacts to it.
    // Where each card about to travel shows now (originOf).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const before = new Map<string, Measured>();
    for (const anim of shown) {
      const element = root ? originOf(root, anim, tables.before?.piles ?? []) : null;
      if (element && 'id' in anim) {
        before.set(anim.id, measure(element, zoom));
      }
    }
    // A card drawn or put on a pile with no card on the table goes from where the pile shows (pilePlace).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const pilesBefore = new Map<string, Measured>();
    for (const anim of shown) {
      const pile = pileOf(anim);
      const element = pile === null ? null : root?.querySelector<HTMLElement>(pilePlace(pile));
      if (pile !== null && element) {
        pilesBefore.set(pile, measure(element, zoom));
      }
    }
    // Another player's drop goes from where their ghost lies, as for a card.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const markersBefore = new Map<MarkerName, Measured>();
    for (const anim of shown) {
      if (anim.kind === 'marker') {
        const element =
          root?.querySelector<HTMLElement>(remoteMarker(anim.name)) ??
          root?.querySelector<HTMLElement>(tableMarker(anim.name));
        if (element) {
          markersBefore.set(anim.name, measure(element, zoom));
        }
      }
    }
    this.#stopFor(shown, tables.after);
    const generation = ++this.#generation;
    if (!root || shown.length === 0) {
      return;
    }
    // The pile is drawn without the flying cards from the start: they land on it later.
    const flying = shown.flatMap((anim) => {
      if (anim.kind === 'fly' && before.has(anim.id)) {
        return [anim.id];
      }
      if (anim.kind === 'arrive' && anim.card !== undefined && pilesBefore.has(anim.pile)) {
        return [anim.card];
      }
      return [];
    });
    for (const id of flying) {
      this.flying.add(id);
    }
    // A drawn card is hidden in the hand from the start: its copy shows it on its way there.
    const drawn = shown.flatMap((anim) =>
      anim.kind === 'draw' && pilesBefore.has(anim.fromPile) ? [anim.id] : [],
    );
    for (const id of drawn) {
      this.drawing.add(id);
    }
    // The side a card showed before it was turned over: the new view is about to replace it.
    // A card taken into the hand turns there, with no old side: it is drawn on the table only.
    const intoHand = new Set(
      (tables.after?.cards ?? []).flatMap((card) => (card.zone === 'hand' ? [card.id] : [])),
    );
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const oldSides = new Map<string, HTMLElement>();
    for (const anim of shown) {
      if (anim.kind !== 'flip' || intoHand.has(anim.id)) {
        continue;
      }
      const element = root.querySelector(tableCard(anim.id));
      if (element instanceof HTMLElement) {
        oldSides.set(anim.id, element.cloneNode(true) as HTMLElement);
      }
    }

    await tick();
    // A newer view came meanwhile, and animates from what is drawn now.
    if (generation !== this.#generation) {
      for (const id of flying) {
        this.flying.delete(id);
      }
      for (const id of drawn) {
        this.drawing.delete(id);
      }
      return;
    }

    const cardsBefore = new Map((tables.before?.cards ?? []).map((card) => [card.id, card]));
    const cardsAfter = new Map((tables.after?.cards ?? []).map((card) => [card.id, card]));
    const pileViews = new Map((tables.before?.piles ?? []).map((pile) => [pile.id, pile]));
    const flights: Flight[] = [];
    const shuffled: string[] = [];
    for (const anim of shown) {
      switch (anim.kind) {
        // A card come onto the table slides out of its pile as a moved card does.
        case 'move':
        case 'enter':
          this.#move(root, anim.id, before.get(anim.id), zoom);
          break;
        case 'marker':
          this.#moveMarker(root, anim.name, markersBefore.get(anim.name), zoom);
          break;
        case 'turnIn':
          this.#turnIn(root, anim.id);
          break;
        case 'flip':
          this.#flip(root, anim.id, oldSides.get(anim.id));
          break;
        case 'glow':
          this.#glow(root, anim.id, anim.color);
          break;
        // Riffled below, once the copies flying into the pile are known.
        case 'shuffle':
          shuffled.push(anim.pile);
          break;
        case 'reveal':
          this.#reveal(root, anim.pile);
          break;
        case 'under': {
          const flight = this.#flight(
            root,
            anim.toPile,
            before.get(anim.id),
            cardsBefore.get(anim.id),
            {
              under: true,
            },
          );
          if (flight) {
            flights.push(flight);
          }
          break;
        }
        case 'fly': {
          // Turning face up, it shows the face it lands on: it may lie face down before, or be new
          // in the view, out of a deck. Otherwise it shows as it left.
          const card =
            anim.turns === 'up'
              ? (cardsAfter.get(anim.id) ?? cardsBefore.get(anim.id))
              : (cardsBefore.get(anim.id) ?? cardsAfter.get(anim.id));
          const flight = this.#flight(root, anim.toPile, before.get(anim.id), card, {
            asOnPile: facesAsOnPile(anim, card),
            turns: anim.turns,
          });
          if (flight) {
            flights.push(flight);
          } else {
            this.flying.delete(anim.id);
          }
          break;
        }
        case 'away': {
          const from = before.get(anim.id);
          const card = cardsBefore.get(anim.id);
          if (from && card) {
            flights.push(this.#awayFlight(undefined, from, card, pileViews));
          }
          break;
        }
        case 'arrive': {
          const from = pilesBefore.get(anim.pile);
          const card = anim.card === undefined ? undefined : cardsAfter.get(anim.card);
          if (from) {
            flights.push({
              kind: 'arrive',
              key: ++this.#nextKey,
              card,
              ...backOf(pileViews.get(anim.pile)),
              pile: anim.pile,
              from,
              delay: 0,
            });
          } else if (anim.card !== undefined) {
            this.flying.delete(anim.card);
          }
          break;
        }
        case 'draw': {
          const from = pilesBefore.get(anim.fromPile);
          const card = cardsAfter.get(anim.id);
          const flight = from && card ? this.#drawFlight(root, anim, from, card, pileViews) : null;
          if (flight) {
            flights.push(flight);
          }
          if (flight?.kind !== 'draw') {
            this.drawing.delete(anim.id);
          }
          break;
        }
        case 'drawAway': {
          const from = pilesBefore.get(anim.pile);
          if (from) {
            const card = anim.card === undefined ? undefined : cardsBefore.get(anim.card);
            flights.push(this.#awayFlight(anim.pile, from, card, pileViews));
          }
          break;
        }
      }
    }
    const launched = staggered(flights);
    for (const pile of shuffled) {
      this.#riffle(root, pile, lastLanding(launched, pile));
    }
    this.flights = [...this.flights, ...launched];
  }

  /**
   * Flies a copy drawn by Flights.svelte: from its card's old place, or the
   * pile it left, to its pile, from its pile to the hand, out of its pile or
   * off the table for a hand the viewer does not see, or into its pile out of
   * such a hand. A copy turning over has its back drawn over its face, in its
   * [data-side="back"].
   */
  launch(element: HTMLElement, flight: Flight): () => void {
    // Followed through motion.flights: dropping the flight removes its copy, which cancels these.
    const timing = { delay: flight.delay, easing: FLY_EASING, fill: 'both' } as const;
    const animations: (Animation | null)[] = [];
    // Once it is edge-on, its back gives way to its face, or its face to its back.
    const turnBack = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const back = element.querySelector<HTMLElement>('[data-side="back"]');
      if (back) {
        animations.push(this.#run(back, frames, options, null));
      }
    };
    switch (flight.kind) {
      case 'toPile': {
        let frames = toPileFrames(flight);
        let edgeOn = DRAW_EDGE_ON;
        // Its keyframes carry their easing, for the back to switch sides as it is edge-on.
        let easing: string = FLY_EASING;
        if (flight.under) {
          frames = underFrames(flight);
        } else if (flight.quarter) {
          frames = quarterFrames(flight);
          edgeOn = QUARTER_EDGE_ON;
          easing = 'linear';
        } else if (flight.turns) {
          frames = turningFrames(flight.from, flight.to, 0, true);
        }
        const options = { ...timing, easing, duration: flightMs(flight) };
        animations.push(this.#run(element, frames, options, null));
        if (flight.turns) {
          turnBack(backFrames(flight.turns, edgeOn), options);
        }
        break;
      }
      case 'draw': {
        const toSlot = this.#run(
          element,
          drawFrames(flight),
          { ...timing, duration: DRAW_MS },
          null,
        );
        if (toSlot) {
          this.#follow(toSlot, flight);
        }
        animations.push(toSlot);
        if (!flight.faceUp) {
          turnBack(backFrames('up', DRAW_EDGE_ON), { ...timing, duration: DRAW_MS });
        }
        break;
      }
      case 'drawAway':
        animations.push(
          this.#run(element, DRAW_AWAY_FRAMES, { ...timing, duration: DRAW_MS }, null),
        );
        break;
      case 'arrive':
        animations.push(this.#run(element, ARRIVE_FRAMES, { ...timing, duration: DRAW_MS }, null));
        break;
    }
    // The copy itself moves first: it lands when that ends.
    const flown = animations[0];
    const land = () => this.#land(flight);
    if (flown) {
      flown.finished.then(land, land);
    } else {
      land();
    }
    return () => {
      for (const animation of animations) {
        animation?.cancel();
      }
    };
  }

  /**
   * Keeps a drawn card's copy heading for its slot while the hand moves under
   * it, raised, lowered or laid out again: at each frame, its way ends where
   * the slot is now, and it goes on from the same point of the way. The hand
   * moves smoothly (its transitions), so does the copy, and it lands on the
   * slot whatever happened meanwhile.
   */
  #follow(animation: Animation, flight: DrawFlight): void {
    const effect = animation.effect as KeyframeEffect | null;
    if (typeof effect?.setKeyframes !== 'function') {
      return;
    }
    let target = flight;
    const step = () => {
      // Landed, or stopped.
      if (!this.flights.some((f) => f.key === flight.key)) {
        return;
      }
      const card = document.querySelector<HTMLElement>(handCard(flight.card.id));
      if (card) {
        const { slot, angle } = measureSlot(card);
        if (hasMoved(target.to, slot) || Math.abs(target.angle - angle) > 0.1) {
          target = { ...target, to: slot, angle };
          effect.setKeyframes(drawFrames(target));
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * Stops every animation: the table shows as it is. A view still being
   * drawn (animate() waiting for its redraw) plays nothing either.
   */
  stop(): void {
    this.#generation++;
    this.#stopWhere(
      () => true,
      () => true,
    );
  }

  /** Resolves once every animation playing now has finished, or was stopped. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.#running.keys()].map((animation) => animation.finished));
  }

  /**
   * Stops what plays on the cards and piles these animations are about, and
   * on those the new table no longer shows; a flight also stops when its
   * card is no longer where its copy goes (flightEnds).
   */
  #stopFor(anims: Anim[], after: TableView | undefined): void {
    const touched = new Set(anims.flatMap((anim) => subjectOf(anim) ?? []));
    const shown = subjectsOf(after);
    this.#stopWhere(
      (subject) => touched.has(subject) || !shown.has(subject),
      (flight) => flightEnds(flight, touched, after),
    );
  }

  #stopWhere(stops: (subject: Subject) => boolean, flightEnds: (flight: Flight) => boolean): void {
    for (const [animation, subject] of this.#running) {
      if (stops(subject)) {
        animation.cancel();
        this.#running.delete(animation);
        this.#moving.delete(animation);
      }
    }
    this.#cardsMoving = this.#moving.size > 0;
    for (const [copy, subject] of this.#copies) {
      if (stops(subject)) {
        copy.remove();
        this.#copies.delete(copy);
      }
    }
    const ending = this.flights.filter(flightEnds);
    if (ending.length > 0) {
      // Removing a copy cancels its animation (Flights.svelte).
      this.flights = this.flights.filter((flight) => !ending.includes(flight));
      this.#release(ending);
    }
  }

  /** The cards drawn as they were while a flight's copy flies: in its pile, or hidden in the hand. */
  #waitingFor(flight: Flight): SvelteSet<string> | null {
    switch (flight.kind) {
      case 'toPile':
      case 'arrive':
        return this.flying;
      case 'draw':
        return this.drawing;
      case 'drawAway':
        return null;
    }
  }

  /** The ended flights' cards show where they went, unless another copy of them still flies there. */
  #release(ended: Flight[]): void {
    for (const flight of ended) {
      const waiting = this.#waitingFor(flight);
      const id = flight.card?.id;
      if (!waiting || id === undefined) {
        continue;
      }
      if (!this.flights.some((f) => f.kind === flight.kind && f.card?.id === id)) {
        waiting.delete(id);
      }
    }
  }

  #move(root: HTMLElement, id: string, from: Measured | undefined, zoom: number): void {
    const element = root.querySelector<HTMLElement>(`${tableCard(id)}, ${handCard(id)}`);
    if (element && from) {
      // Moving cards are followed frame by frame, for the arrows drawn between them.
      this.#slide(element, from, zoom, cardSubject(id), true);
    }
  }

  /** Slides a marker from where it lay; no arrow follows it. */
  #moveMarker(root: HTMLElement, name: MarkerName, from: Measured | undefined, zoom: number): void {
    const element = root.querySelector<HTMLElement>(tableMarker(name));
    if (element && from) {
      this.#slide(element, from, zoom, markerSubject(name), false);
    }
  }

  /** Slides an element from where it showed to its new place (FLIP). */
  #slide(
    element: HTMLElement,
    from: Measured,
    zoom: number,
    subject: Subject,
    moves: boolean,
  ): void {
    const to = measure(element, zoom);
    // Translations are in the element's own units: table units on a zoomed surface.
    const scale = scaleOf(element, zoom);
    const dx = (from.cx - to.cx) / scale;
    const dy = (from.cy - to.cy) / scale;
    const size = to.w ? from.w / to.w : 1;
    if (Math.abs(dx) + Math.abs(dy) <= 1 && Math.abs(size - 1) <= 0.02) {
      return;
    }
    // The translate and scale properties leave the element's own transform (a card's tilt) alone.
    this.#run(
      element,
      [
        { translate: `${dx}px ${dy}px`, scale: `${size}` },
        { translate: '0px 0px', scale: '1' },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING },
      subject,
      moves,
    );
  }

  #turnIn(root: HTMLElement, id: string): void {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element) {
      return;
    }
    const tilt = getComputedStyle(element).transform;
    const rest = tilt && tilt !== 'none' ? tilt : 'none';
    const turned = `perspective(700px) rotateY(90deg) scale(1.05)${rest === 'none' ? '' : ` ${rest}`}`;
    this.#run(
      element,
      [{ transform: turned }, { transform: rest }],
      { duration: TURN_IN_MS, easing: MOVE_EASING },
      cardSubject(id),
      true,
    );
  }

  /**
   * Turns a card over around its vertical axis: a copy of its old side turns
   * away to edge-on, then the card, drawn with its new side, turns back flat.
   * Without an old side (a hidden card come onto the table, or one taken face
   * down into the hand), only the second half plays. An exhausted card keeps
   * its tilt; a hand card keeps its place.
   */
  #flip(root: HTMLElement, id: string, oldSide: HTMLElement | undefined): void {
    const onTable = root.querySelector<HTMLElement>(tableCard(id));
    const element = onTable ?? root.querySelector<HTMLElement>(handCard(id));
    if (!element || typeof element.animate !== 'function') {
      return;
    }
    const computed = getComputedStyle(element).transform;
    const own = computed && computed !== 'none' ? computed : '';
    const turned = (angle: string) => {
      const turn = `${FLIP_PERSPECTIVE} rotateY(${angle})`;
      if (!own) {
        return turn;
      }
      // A table card's tilt turns with it. A hand card's placement (translateX(-50%)) comes
      // first: after the turn, it would shift the axis to the card's edge.
      return onTable ? `${turn} ${own}` : `${own} ${turn}`;
    };
    const flat = turned('0deg');
    const edgeOn = turned('90deg');
    const half = FLIP_MS / 2;

    if (oldSide && element.parentElement) {
      // A picture only: it neither takes the pointer nor answers to the card's id.
      oldSide.removeAttribute('data-id');
      oldSide.setAttribute('aria-hidden', 'true');
      oldSide.style.pointerEvents = 'none';
      // At the end of the surface, clear of the cards Svelte lays out; its own z-index stacks it.
      element.parentElement.append(oldSide);
      this.#copies.set(oldSide, cardSubject(id));
      const away = this.#run(
        oldSide,
        [{ transform: flat }, { transform: edgeOn }],
        { duration: half, easing: 'ease-in', fill: 'forwards' },
        cardSubject(id),
      );
      const remove = () => {
        oldSide.remove();
        this.#copies.delete(oldSide);
      };
      void away?.finished.then(remove, remove);
    }
    // Edge-on, the card is not seen while its old side turns away.
    const keyframes: Keyframe[] = oldSide
      ? [
          { transform: edgeOn, offset: 0 },
          { transform: edgeOn, offset: 0.5, easing: 'ease-out' },
          { transform: flat, offset: 1 },
        ]
      : [{ transform: edgeOn }, { transform: flat }];
    this.#run(element, keyframes, { duration: oldSide ? FLIP_MS : half }, cardSubject(id));
  }

  /**
   * The new top card of a side deck turns face up on its pile, as a hidden
   * card come onto the table does: the second half of a flip, from edge-on.
   */
  #reveal(root: HTMLElement, id: string): void {
    const art = root.querySelector<HTMLElement>(`${tablePile(id)} .art`);
    if (!art) {
      return;
    }
    this.#run(
      art,
      [
        { transform: `${FLIP_PERSPECTIVE} rotateY(90deg)` },
        { transform: `${FLIP_PERSPECTIVE} rotateY(0deg)` },
      ],
      { duration: FLIP_MS / 2 },
      pileSubject(id),
    );
  }

  #glow(root: HTMLElement, id: string, color: number): void {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element) {
      return;
    }
    const glow = playerColor(color);
    this.#run(
      element,
      [
        {
          boxShadow: `0 0 0 1.5px ${glow}, 0 0 10px 1px color-mix(in srgb, ${glow} 55%, transparent)`,
        },
        { boxShadow: '0 0 0 0 transparent' },
      ],
      // CardView draws an empty ::after around the card for it.
      { duration: GLOW_MS, easing: 'ease-out', pseudoElement: '::after' },
      cardSubject(id),
    );
  }

  /**
   * The prototype's riffle: copies of the pile split left and right, then
   * riffle back into it, after delay (ms): once the cards flying into it land.
   */
  #riffle(root: HTMLElement, id: string, delay: number): void {
    const pile = root.querySelector<HTMLElement>(tablePile(id));
    const art = pile?.querySelector('.art');
    if (!pile || !art || typeof pile.animate !== 'function') {
      return;
    }
    for (let i = 0; i < RIFFLE_COPIES; i++) {
      const copy = document.createElement('div');
      copy.setAttribute('aria-hidden', 'true');
      // Shown only while it riffles (its first and last frames), as waiting at rest it would cover
      // the pile's count.
      Object.assign(copy.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '6',
        pointerEvents: 'none',
        visibility: 'hidden',
      });
      copy.append(art.cloneNode(true));
      pile.append(copy);
      this.#copies.set(copy, pileSubject(id));
      const side = i % 2 ? 1 : -1;
      const reach = 26 + Math.floor(i / 2) * 10;
      const animation = this.#run(
        copy,
        [
          { transform: 'translate(0, 0) rotate(0deg)', visibility: 'visible' },
          {
            transform: `translate(${side * reach}px, ${-4 - i}px) rotate(${side * (6 + i * 2)}deg)`,
            offset: 0.45,
          },
          { transform: `translate(${side * 4}px, -2px) rotate(${side * 2}deg)`, offset: 0.8 },
          { transform: 'translate(0, 0) rotate(0deg)', visibility: 'visible' },
        ],
        { duration: RIFFLE_MS, delay: delay + i * RIFFLE_STAGGER_MS, easing: RIFFLE_EASING },
        pileSubject(id),
      );
      const remove = () => {
        copy.remove();
        this.#copies.delete(copy);
      };
      animation?.finished.then(remove, remove);
    }
    this.#run(
      pile,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(.94)', offset: 0.4 },
        { transform: 'scale(1.03)', offset: 0.85 },
        { transform: 'scale(1)' },
      ],
      { duration: PILE_BOUNCE_MS, delay, easing: 'ease-out' },
      pileSubject(id),
    );
  }

  /** A copy of a card from where it showed (from) to the pile it went to, where that pile shows. */
  #flight(
    root: HTMLElement,
    pileId: string,
    from: Measured | undefined,
    card: CardView | undefined,
    how: Partial<Pick<PileFlight, 'under' | 'asOnPile' | 'turns'>>,
  ): PileFlight | null {
    const pile = root.querySelector<HTMLElement>(pilePlace(pileId));
    if (!from || !card || !pile) {
      return null;
    }
    const rect = pile.getBoundingClientRect();
    const to = {
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      w: rect.width,
      h: rect.height,
    };
    const under = how.under ?? false;
    return {
      kind: 'toPile',
      key: ++this.#nextKey,
      card,
      pile: pileId,
      from,
      to,
      under,
      asOnPile: how.asOnPile ?? false,
      turns: how.turns,
      quarter: !under && from.w > from.h && to.h > to.w,
      delay: 0,
    };
  }

  /**
   * A drawn card's copy, from its pile to its slot in the hand. When the hand
   * shown is not the one it went to (another of the viewer's decks), it
   * leaves the pile as another player's draw does.
   */
  #drawFlight(
    root: HTMLElement,
    anim: Extract<Anim, { kind: 'draw' }>,
    from: Measured,
    card: CardView,
    piles: ReadonlyMap<string, PileView>,
  ): Flight {
    const element = root.querySelector<HTMLElement>(handCard(anim.id));
    if (!element) {
      return this.#awayFlight(anim.fromPile, from, anim.faceUp ? card : undefined, piles);
    }
    const { slot, angle } = measureSlot(element);
    return {
      kind: 'draw',
      key: ++this.#nextKey,
      card,
      faceUp: anim.faceUp,
      pile: anim.fromPile,
      from,
      to: slot,
      angle,
      delay: 0,
    };
  }

  /** A copy leaving its pile, or the table (no pile), for a hand the viewer does not see. */
  #awayFlight(
    pile: string | undefined,
    from: Measured,
    card: CardView | undefined,
    piles: ReadonlyMap<string, PileView>,
  ): AwayFlight {
    return {
      kind: 'drawAway',
      key: ++this.#nextKey,
      card,
      ...backOf(pile === undefined ? undefined : piles.get(pile)),
      pile,
      from,
      delay: 0,
    };
  }

  /** The copy reached where it went: its card shows there from now on. */
  #land(flight: Flight): void {
    // stop() has already cleared away a flight it cancelled.
    if (!this.flights.some((f) => f.key === flight.key)) {
      return;
    }
    this.flights = this.flights.filter((f) => f.key !== flight.key);
    this.#release([flight]);
  }

  /**
   * Starts an animation, where the browser has the Web Animations API (jsdom
   * has not). It is followed under its subject, unless that is null.
   */
  #run(
    element: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    subject: Subject | null,
    moves = false,
  ): Animation | null {
    if (typeof element.animate !== 'function') {
      return null;
    }
    const animation = element.animate(keyframes, options);
    if (subject !== null) {
      this.#running.set(animation, subject);
    }
    if (moves) {
      this.#moving.add(animation);
      this.#cardsMoving = true;
      this.#countFrames();
    }
    const done = () => {
      this.#running.delete(animation);
      this.#moving.delete(animation);
      this.#cardsMoving = this.#moving.size > 0;
    };
    animation.finished.then(done, done);
    return animation;
  }

  /** Counts frames until the last moving card has stopped, one frame past it. */
  #countFrames(): void {
    if (this.#raf !== 0) {
      return;
    }
    const step = () => {
      this.frame += 1;
      this.#raf = this.#moving.size > 0 ? requestAnimationFrame(step) : 0;
    };
    this.#raf = requestAnimationFrame(step);
  }
}

export const motion = new TableMotion();
