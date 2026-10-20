// Plays the animations of animate.ts on the table, with the Web Animations
// API, as the prototype's animateFrom and playShuffles do. Nothing here holds
// the table up: the new view is drawn at once, in its final state, and the
// animations only paint over it, never catching the pointer.

import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { Back, CardView, PileView, TableView } from '../lib/types';
import type { Anim } from './animate';
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
/** Copies of the pile's back split left and right, then riffle back in, one after the other. */
const RIFFLE_MS = 620;
const RIFFLE_COPIES = 6;
const RIFFLE_STAGGER_MS = 40;
const RIFFLE_EASING = 'cubic-bezier(.3, .7, .3, 1)';
const PILE_BOUNCE_MS = 700;
/** A copy of a discarded card flies to its pile; several leave one after the other. */
const FLY_MS = 420;
const FLY_STAGGER_MS = 70;
const FLY_EASING = 'cubic-bezier(.3, .7, .2, 1)';
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
  /** The pile it flies to or out of. */
  pile: string;
  from: Measured;
  delay: number;
}

/** A copy of a card on its way from its old place to the pile it went to. */
interface PileFlight extends FlightBase {
  kind: 'toPile';
  /** The card as it was before it left. */
  card: CardView;
  to: Measured;
  /** Put at the bottom of the pile: it lands just below it, then slips under it. */
  under: boolean;
}

/** A copy of a drawn card on its way from its pile to its slot in the hand. */
interface DrawFlight extends FlightBase {
  kind: 'draw';
  /** The card as it is in the hand. */
  card: CardView;
  /** It shows its face all along; otherwise it leaves on its back and turns over on the way. */
  faceUp: boolean;
  to: Measured;
  /** The slot's tilt on the fan, in degrees. */
  angle: number;
}

/** A copy of a card leaving its pile for a hand the viewer does not see. */
interface AwayFlight extends FlightBase {
  kind: 'drawAway';
  /** The card, when the viewer saw it on the pile. */
  card: CardView | undefined;
  /** The back it shows otherwise. */
  back: Back;
  /** The caption of that back: the label of a side deck with its own back. */
  caption: string | undefined;
}

type Flight = PileFlight | DrawFlight | AwayFlight;

const tableCard = (id: string) => `.surface .card:not(.pile)[data-id="${CSS.escape(id)}"]`;
const handCard = (id: string) => `.hand .hcard[data-id="${CSS.escape(id)}"]`;
/** A card another player drags, or has just let go of (Presence.svelte). */
const remoteGhost = (id: string) => `.presence .card.ghost[data-id="${CSS.escape(id)}"]`;
/** The viewer's own drop, lying where it landed until the view shows it (DragLayer.svelte). */
const ownGhost = (id: string) => `.draglayer .card.ghost.landed[data-id="${CSS.escape(id)}"]`;
const tablePile = (id: string) => `.surface .pile[data-id="${CSS.escape(id)}"]`;
const tableToken = '.surface .fptoken';
/** The first player token another player drags, or has just let go of (Presence.svelte). */
const remoteToken = '.presence .fptoken.ghost';

/**
 * What an animation plays on, "card:<id>", "pile:<id>" or the first player
 * token: a new view stops only what it touches.
 */
type Subject = `card:${string}` | `pile:${string}` | 'firstPlayer';

const cardSubject = (id: string): Subject => `card:${id}`;
const pileSubject = (id: string): Subject => `pile:${id}`;

/**
 * A card drawn into a hand the viewer does not see is about nothing on the
 * table: its copy only leaves the pile, which plays on as it does, and a
 * later draw from that pile leaves after it.
 */
function subjectOf(anim: Anim): Subject | null {
  switch (anim.kind) {
    case 'shuffle':
    case 'reveal':
      return pileSubject(anim.pile);
    case 'drawAway':
      return null;
    case 'firstPlayer':
      return 'firstPlayer';
    default:
      return cardSubject(anim.id);
  }
}

/** The subjects of a table: its cards drawn on the table or in the hand, its piles and the token. */
function subjectsOf(table: TableView | undefined): Set<Subject> {
  // A lookup for one call: nothing reacts to it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const subjects = new Set<Subject>();
  if (table) {
    subjects.add('firstPlayer');
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

/** A flight's copy from its pile to the hand, turning over on the way unless it shows its face. */
function drawFrames(flight: DrawFlight): Keyframe[] {
  const dx = flight.to.cx - flight.from.cx;
  const dy = flight.to.cy - flight.from.cy;
  const scale = flight.from.w ? flight.to.w / flight.from.w : 1;
  // Part of the way there, turned about its vertical axis by turn degrees.
  const at = (progress: number, turn: number): Keyframe => ({
    transform:
      `${FLIP_PERSPECTIVE} translate(${dx * progress}px, ${dy * progress}px)` +
      ` rotate(${flight.angle * progress}deg) scale(${1 + (scale - 1) * progress}) rotateY(${turn}deg)`,
    offset: progress,
  });
  if (flight.faceUp) {
    return [at(0, 0), at(1, 0)];
  }
  return [at(0, 0), at(DRAW_TURN_FROM, 0), at(DRAW_EDGE_ON, 90), at(1, 0)];
}

/** The back drawn over a turning copy's face: gone once the copy is edge-on. */
const BACK_FRAMES: Keyframe[] = [
  { opacity: 1, offset: 0 },
  { opacity: 1, offset: DRAW_EDGE_ON },
  { opacity: 0, offset: DRAW_EDGE_ON },
  { opacity: 0, offset: 1 },
];

const DRAW_AWAY_FRAMES: Keyframe[] = [
  { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  { transform: `translate(0, ${DRAW_AWAY_DROP_PX}px) scale(${DRAW_AWAY_SCALE})`, opacity: 0 },
];

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
 * Copies of the same kind leave one after the other, in the order of their
 * animations; those leaving for a hand the viewer does not see, pile by pile.
 */
function staggered(flights: Flight[]): Flight[] {
  // A count for one call: nothing reacts to it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const counts = new Map<string, number>();
  return flights.map((flight) => {
    const group = flight.kind === 'drawAway' ? `${flight.kind}:${flight.pile}` : flight.kind;
    const count = counts.get(group) ?? 0;
    counts.set(group, count + 1);
    return { ...flight, delay: count * FLY_STAGGER_MS };
  });
}

/**
 * Whether a new view ends a flight: it animates the flight's card again, or
 * the card is no longer where the copy goes, or the pile it leaves is gone.
 */
function flightEnds(flight: Flight, touched: Set<Subject>, after: TableView | undefined): boolean {
  const cards = after?.cards ?? [];
  const piles = after?.piles ?? [];
  switch (flight.kind) {
    case 'toPile':
      // A card put under a pile is not listed there: the pile must only still be there.
      if (flight.under) {
        return touched.has(cardSubject(flight.card.id)) || !piles.some((p) => p.id === flight.pile);
      }
      return (
        touched.has(cardSubject(flight.card.id)) ||
        !piles.some((pile) => pile.id === flight.pile && pile.cards?.includes(flight.card.id))
      );
    case 'draw':
      return (
        touched.has(cardSubject(flight.card.id)) ||
        !cards.some((card) => card.id === flight.card.id && card.zone === 'hand')
      );
    case 'drawAway':
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const before = new Map<string, Measured>();
    for (const anim of shown) {
      if (anim.kind === 'move' || anim.kind === 'fly' || anim.kind === 'under') {
        // Another player's drop goes from where their ghost lies, not from the spot it was taken
        // from; so does the viewer's own drop slipping under a pile, which lies where it landed.
        const element =
          root?.querySelector<HTMLElement>(remoteGhost(anim.id)) ??
          (anim.kind === 'under' ? root?.querySelector<HTMLElement>(ownGhost(anim.id)) : null) ??
          root?.querySelector<HTMLElement>(`${tableCard(anim.id)}, ${handCard(anim.id)}`);
        if (element) {
          before.set(anim.id, measure(element, zoom));
        }
      }
    }
    // A drawn card leaves its pile from where the pile lies on the table; an out-of-play pile is not drawn.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const pilesBefore = new Map<string, Measured>();
    for (const anim of shown) {
      const pile =
        anim.kind === 'draw' ? anim.fromPile : anim.kind === 'drawAway' ? anim.pile : null;
      const element = pile === null ? null : root?.querySelector<HTMLElement>(tablePile(pile));
      if (pile !== null && element) {
        pilesBefore.set(pile, measure(element, zoom));
      }
    }
    const tokenMoves = shown.some((anim) => anim.kind === 'firstPlayer');
    // Another player's drop goes from where their ghost lies, as for a card.
    const tokenElement = tokenMoves
      ? (root?.querySelector<HTMLElement>(remoteToken) ??
        root?.querySelector<HTMLElement>(tableToken))
      : null;
    const tokenBefore = tokenElement ? measure(tokenElement, zoom) : undefined;
    this.#stopFor(shown, tables.after);
    const generation = ++this.#generation;
    if (!root || shown.length === 0) {
      return;
    }
    // The pile is drawn without the flying cards from the start: they land on it later.
    const flying = shown.flatMap((anim) =>
      anim.kind === 'fly' && before.has(anim.id) ? [anim.id] : [],
    );
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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const oldSides = new Map<string, HTMLElement>();
    for (const anim of shown) {
      if (anim.kind !== 'flip') {
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
    for (const anim of shown) {
      switch (anim.kind) {
        case 'move':
          this.#move(root, anim.id, before.get(anim.id), zoom);
          break;
        case 'firstPlayer':
          this.#moveToken(root, tokenBefore, zoom);
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
        case 'shuffle':
          this.#riffle(root, anim.pile);
          break;
        case 'reveal':
          this.#reveal(root, anim.pile);
          break;
        case 'under': {
          const flight = this.#flight(root, anim.id, anim.toPile, before, cardsBefore, true);
          if (flight) {
            flights.push(flight);
          }
          break;
        }
        case 'fly': {
          const flight = this.#flight(root, anim.id, anim.toPile, before, cardsBefore);
          if (flight) {
            flights.push(flight);
          } else {
            this.flying.delete(anim.id);
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
    this.flights = [...this.flights, ...staggered(flights)];
  }

  /**
   * Flies a copy drawn by Flights.svelte: from its card's old place to its
   * pile, from its pile to the hand, or out of its pile for a hand the viewer
   * does not see. A copy turning over has its back drawn over its face, in
   * its [data-side="back"].
   */
  launch(element: HTMLElement, flight: Flight): () => void {
    // Followed through motion.flights: dropping the flight removes its copy, which cancels these.
    const timing = { delay: flight.delay, easing: FLY_EASING, fill: 'both' } as const;
    const animations: (Animation | null)[] = [];
    switch (flight.kind) {
      case 'toPile': {
        const frames = flight.under ? underFrames(flight) : toPileFrames(flight);
        const duration = flight.under ? UNDER_MS : FLY_MS;
        animations.push(this.#run(element, frames, { ...timing, duration }, null));
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
        const back = element.querySelector<HTMLElement>('[data-side="back"]');
        if (back && !flight.faceUp) {
          animations.push(this.#run(back, BACK_FRAMES, { ...timing, duration: DRAW_MS }, null));
        }
        break;
      }
      case 'drawAway':
        animations.push(
          this.#run(element, DRAW_AWAY_FRAMES, { ...timing, duration: DRAW_MS }, null),
        );
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

  /** Slides the first player token from where it lay; no arrow follows it. */
  #moveToken(root: HTMLElement, from: Measured | undefined, zoom: number): void {
    const element = root.querySelector<HTMLElement>(tableToken);
    if (element && from) {
      this.#slide(element, from, zoom, 'firstPlayer', false);
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
   * Without an old side (a hidden card come onto the table), only the second
   * half plays. An exhausted card keeps its tilt.
   */
  #flip(root: HTMLElement, id: string, oldSide: HTMLElement | undefined): void {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element || typeof element.animate !== 'function') {
      return;
    }
    const tilt = getComputedStyle(element).transform;
    const rest = tilt && tilt !== 'none' ? ` ${tilt}` : '';
    const flat = `${FLIP_PERSPECTIVE} rotateY(0deg)${rest}`;
    const edgeOn = `${FLIP_PERSPECTIVE} rotateY(90deg)${rest}`;
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

  /** The prototype's riffle: copies of the pile split left and right, then riffle back into it. */
  #riffle(root: HTMLElement, id: string): void {
    const pile = root.querySelector<HTMLElement>(tablePile(id));
    const art = pile?.querySelector('.art');
    if (!pile || !art || typeof pile.animate !== 'function') {
      return;
    }
    for (let i = 0; i < RIFFLE_COPIES; i++) {
      const copy = document.createElement('div');
      copy.setAttribute('aria-hidden', 'true');
      Object.assign(copy.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '6',
        pointerEvents: 'none',
      });
      copy.append(art.cloneNode(true));
      pile.append(copy);
      this.#copies.set(copy, pileSubject(id));
      const side = i % 2 ? 1 : -1;
      const reach = 26 + Math.floor(i / 2) * 10;
      const animation = this.#run(
        copy,
        [
          { transform: 'translate(0, 0) rotate(0deg)' },
          {
            transform: `translate(${side * reach}px, ${-4 - i}px) rotate(${side * (6 + i * 2)}deg)`,
            offset: 0.45,
          },
          { transform: `translate(${side * 4}px, -2px) rotate(${side * 2}deg)`, offset: 0.8 },
          { transform: 'translate(0, 0) rotate(0deg)' },
        ],
        { duration: RIFFLE_MS, delay: i * RIFFLE_STAGGER_MS, easing: RIFFLE_EASING },
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
      { duration: PILE_BOUNCE_MS, easing: 'ease-out' },
      pileSubject(id),
    );
  }

  #flight(
    root: HTMLElement,
    id: string,
    pileId: string,
    before: ReadonlyMap<string, Measured>,
    cardsBefore: ReadonlyMap<string, CardView>,
    under = false,
  ): PileFlight | null {
    const from = before.get(id);
    const card = cardsBefore.get(id);
    const pile = root.querySelector<HTMLElement>(tablePile(pileId));
    if (!from || !card || !pile) {
      return null;
    }
    const to = pile.getBoundingClientRect();
    return {
      kind: 'toPile',
      key: ++this.#nextKey,
      card,
      pile: pileId,
      from,
      to: { cx: to.left + to.width / 2, cy: to.top + to.height / 2, w: to.width, h: to.height },
      under,
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

  #awayFlight(
    pile: string,
    from: Measured,
    card: CardView | undefined,
    piles: ReadonlyMap<string, PileView>,
  ): AwayFlight {
    const view = piles.get(pile);
    return {
      kind: 'drawAway',
      key: ++this.#nextKey,
      card,
      back: view ? pileBack(view) : 'player',
      caption: view ? pileCaption(view) : undefined,
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
