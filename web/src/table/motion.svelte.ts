// Plays the animations of animate.ts on the table, with the Web Animations
// API, as the prototype's animateFrom and playShuffles do. Nothing here holds
// the table up: the new view is drawn at once, in its final state, and the
// animations only paint over it, never catching the pointer.

import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { CardView, TableView } from '../lib/types';
import type { Anim } from './animate';

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

/** A card or a pile on the screen: its middle, and its size without its tilt. */
interface Measured {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A copy of a card on its way to a pile, drawn by Flights.svelte. */
interface Flight {
  key: number;
  /** The card as it was before it left. */
  card: CardView;
  /** The pile it flies to. */
  pile: string;
  from: Measured;
  to: Measured;
  delay: number;
}

const tableCard = (id: string) => `.surface .card:not(.pile)[data-id="${CSS.escape(id)}"]`;
const handCard = (id: string) => `.hand .hcard[data-id="${CSS.escape(id)}"]`;
const tablePile = (id: string) => `.surface .pile[data-id="${CSS.escape(id)}"]`;

/** What an animation plays on, "card:<id>" or "pile:<id>": a new view stops only what it touches. */
type Subject = `card:${string}` | `pile:${string}`;

const cardSubject = (id: string): Subject => `card:${id}`;
const pileSubject = (id: string): Subject => `pile:${id}`;

function subjectOf(anim: Anim): Subject {
  return anim.kind === 'shuffle' ? pileSubject(anim.pile) : cardSubject(anim.id);
}

/** The subjects of a table: its cards drawn on the table or in the hand, and its piles. */
function subjectsOf(table: TableView | undefined): Set<Subject> {
  // A lookup for one call: nothing reacts to it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const subjects = new Set<Subject>();
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

class TableMotion {
  /** The copies of cards flying to a pile. */
  flights = $state.raw<Flight[]>([]);
  /** The cards of those copies: their pile is drawn as it was until they land. */
  readonly flying = new SvelteSet<string>();
  /**
   * Counts the frames while cards move: what is drawn from the cards' places
   * on the screen (the arrows) measures again at each one.
   */
  frame = $state(0);

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
      if (anim.kind === 'move' || anim.kind === 'fly') {
        const element = root?.querySelector<HTMLElement>(
          `${tableCard(anim.id)}, ${handCard(anim.id)}`,
        );
        if (element) {
          before.set(anim.id, measure(element, zoom));
        }
      }
    }
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
      return;
    }

    const cardsBefore = new Map((tables.before?.cards ?? []).map((card) => [card.id, card]));
    const flights: Flight[] = [];
    for (const anim of shown) {
      switch (anim.kind) {
        case 'move':
          this.#move(root, anim.id, before.get(anim.id), zoom);
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
        case 'fly': {
          const flight = this.#flight(
            root,
            anim.id,
            anim.toPile,
            before,
            cardsBefore,
            flights.length,
          );
          if (flight) {
            flights.push(flight);
          } else {
            this.flying.delete(anim.id);
          }
          break;
        }
      }
    }
    this.flights = [...this.flights, ...flights];
  }

  /** Flies a copy drawn by Flights.svelte from its card's old place to its pile. */
  launch(element: HTMLElement, flight: Flight): () => void {
    const dx = flight.to.cx - flight.from.cx;
    const dy = flight.to.cy - flight.from.cy;
    const scale = flight.from.w ? flight.to.w / flight.from.w : 1;
    const animation = this.#run(
      element,
      [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      ],
      { duration: FLY_MS, delay: flight.delay, easing: FLY_EASING, fill: 'both' },
      // Followed through motion.flights: dropping the flight removes its copy, which cancels this.
      null,
    );
    const land = () => this.#land(flight);
    if (animation) {
      animation.finished.then(land, land);
    } else {
      land();
    }
    return () => animation?.cancel();
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

  /**
   * Stops what plays on the cards and piles these animations are about, and
   * on those the new table no longer shows; a flight also stops when its
   * card is no longer in its pile.
   */
  #stopFor(anims: Anim[], after: TableView | undefined): void {
    const touched = new Set(anims.map(subjectOf));
    const shown = subjectsOf(after);
    const piled = new Map((after?.piles ?? []).map((pile) => [pile.id, pile.cards ?? []]));
    this.#stopWhere(
      (subject) => touched.has(subject) || !shown.has(subject),
      (flight) =>
        touched.has(cardSubject(flight.card.id)) ||
        !piled.get(flight.pile)?.includes(flight.card.id),
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
      for (const flight of ending) {
        if (!this.flights.some((f) => f.card.id === flight.card.id)) {
          this.flying.delete(flight.card.id);
        }
      }
    }
  }

  #move(root: HTMLElement, id: string, from: Measured | undefined, zoom: number): void {
    const element = root.querySelector<HTMLElement>(`${tableCard(id)}, ${handCard(id)}`);
    if (!element || !from) {
      return;
    }
    const to = measure(element, zoom);
    // Translations are in the element's own units: table units on a zoomed surface.
    const scale = scaleOf(element, zoom);
    const dx = (from.cx - to.cx) / scale;
    const dy = (from.cy - to.cy) / scale;
    const size = to.w ? from.w / to.w : 1;
    if (Math.abs(dx) + Math.abs(dy) <= 1 && Math.abs(size - 1) <= 0.02) {
      return;
    }
    // The translate and scale properties leave the card's own transform (its tilt) alone.
    this.#run(
      element,
      [
        { translate: `${dx}px ${dy}px`, scale: `${size}` },
        { translate: '0px 0px', scale: '1' },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING },
      cardSubject(id),
      true,
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
    index: number,
  ): Flight | null {
    const from = before.get(id);
    const card = cardsBefore.get(id);
    const pile = root.querySelector<HTMLElement>(tablePile(pileId));
    if (!from || !card || !pile) {
      return null;
    }
    const to = pile.getBoundingClientRect();
    return {
      key: ++this.#nextKey,
      card,
      pile: pileId,
      from,
      to: { cx: to.left + to.width / 2, cy: to.top + to.height / 2, w: to.width, h: to.height },
      delay: index * FLY_STAGGER_MS,
    };
  }

  /** The copy reached its pile: the pile shows the card from now on. */
  #land(flight: Flight): void {
    // stop() has already cleared away a flight it cancelled.
    if (!this.flights.some((f) => f.key === flight.key)) {
      return;
    }
    this.flights = this.flights.filter((f) => f.key !== flight.key);
    if (!this.flights.some((f) => f.card.id === flight.card.id)) {
      this.flying.delete(flight.card.id);
    }
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
      this.#countFrames();
    }
    const done = () => {
      this.#running.delete(animation);
      this.#moving.delete(animation);
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
