// Plays the animations of animate.ts on the table, with the Web Animations
// API: cards sliding to their new place or out of a pile onto the table,
// copies of cards flying to a pile, out of one into the hand, or between two
// piles, and copies going into or out of a hand the viewer does not see. An out-of-play pile is not
// drawn: the chip on its owner's frame stands for it, a card flying to it
// fades out into it (CHIP_FADE_FROM), turning over first where it starts when
// it turns (flipsFirst), and a card leaves it at a card's size
// (measureOrigin). In dock mode, a card drawn into the viewer's hand, or taken back into it off the
// table, flies to the dock's hand button or to its deck's hero selector entry when no hand sheet
// shows its hand (dockLanding). Nothing here holds the table up: the new view is drawn at
// once, in its final state, and the animations only paint over it, never
// catching the pointer.

import { tick } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { createSubscriber, SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
  MARKERS,
  markerPoint,
  type Area,
  type Back,
  type CardView,
  type MarkerName,
  type PileView,
  type Point,
  type TableView,
} from '../lib/types';
import { playerColorToken } from '../lib/playerColor';
import type { Anim, Tuck, Turn } from './animate';
import { DOCK_SCALE } from './dockPiles';
import { unknownTopId } from './drag';
import { isHidden, pileBack, pileCaption } from './face';
import { EXHAUST_DEGREES, isDiscardPile, PORTRAIT_CARD } from './layout';
import { tableCard, tablePile } from './screen';
import { seatOf } from './seats';

/**
 * A card held up off the table: dragged, turning over, flying. It shows a little larger, and its
 * shadow (.shade) falls further down and to the right of it, as the light comes from the top left.
 * The drag layer passes both to the ghosts' styles (--lift-scale, --lift-shade).
 */
export const LIFT_SCALE = 1.06;
export const LIFT_SHADE = '5px 5px';
/**
 * The viewer's own drop settles on the table once the view shows it: down from its lift, dipping a
 * little below its size (SETTLE_DIP, at SETTLE_DIPS_AT), its shadow back under it, upright.
 */
const SETTLE_MS = 220;
const SETTLE_DIP = 0.98;
const SETTLE_DIPS_AT = 0.55;
/** A copy flying to a pile or to the hand is held up highest this far into its way. */
const FLIGHT_LIFT_AT = 0.45;
/** A card moving to its new place (FLIP). */
const MOVE_MS = 250;
const MOVE_EASING = 'cubic-bezier(.2, .8, .2, 1)';
/**
 * The viewer's own drop in dock mode slides from its ghost to its slot (MOVE_MS) and settles
 * (SETTLE_MS) as one motion: the settle starts this fraction of the way through the slide.
 */
const LAND_SETTLES_AT = 0.5;
/**
 * A card tucked into a stack lies beneath it: drawn above the stack, it first shifts out to a
 * staging spot past its slot, easing out, then, drawn at its own z-index, slides in under the stack
 * to its slot. Each step stops at the staging spot, so the switch of z-index shows no jump.
 */
const TUCK_OUT_MS = 200;
const TUCK_IN_MS = 200;
const TUCK_IN_EASING = 'ease-in-out';
/**
 * The staging spot lies this fraction of the card's own size down and to the right of its slot,
 * its top-left corner on the middle of the slot: a portrait card (112 × 157) is then about 85 %
 * clear of the card it tucks under (10 to the left of and 20 above its slot), so that it is seen
 * going in under the stack. Further out, the shift would read as a throw away from the stack.
 */
const TUCK_STAGING = 0.5;
/** A card exhausted or readied tilts to its new angle where it lies, briefly. */
const TILT_MS = 180;
/** A stage card just chosen turns in like a card being put down. */
const TURN_IN_MS = 420;
/** A card turned over: its old side turns away edge-on, then its new side turns in. */
export const FLIP_MS = 360;
/** The depth from which a card turning about its vertical axis is seen: turned over, or turning in. */
export const FLIP_PERSPECTIVE = 'perspective(700px)';
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
/** From the first copy leaving the pile to the last one back on it. */
const RIFFLE_SPAN_MS = (RIFFLE_COPIES - 1) * RIFFLE_STAGGER_MS + RIFFLE_MS;
const RIFFLE_EASING = 'cubic-bezier(.3, .7, .3, 1)';
const PILE_BOUNCE_MS = 700;
/** A copy of a discarded card flies to its pile; several leave one after the other. */
const FLY_MS = 420;
const FLY_STAGGER_MS = 70;
const FLY_EASING = 'cubic-bezier(.3, .7, .2, 1)';
/**
 * A copy flying to an out-of-play pile's chip fades out from this far into its flight, evenly to
 * its end: as it shrinks into the chip, it vanishes into the pile instead of going all at once
 * when it lands. Its way eases out, so it is then all but on the chip. A copy that turns over
 * first (flipsFirst) fades from this far into its flight once turned (CHIP_FLIP_FADE_FROM).
 */
const CHIP_FADE_FROM = 0.55;
/**
 * A copy flying to a chip that turns over on its way does so first, where it starts, as a card
 * turned over on the table does (FLIP_MS), edge-on half way, then flies to the chip (FLY_MS).
 */
const CHIP_FLIP_MS = FLIP_MS + FLY_MS;
const CHIP_EDGE_ON = FLIP_MS / 2 / CHIP_FLIP_MS;
const CHIP_FLIES_AT = FLIP_MS / CHIP_FLIP_MS;
const CHIP_FLIP_FADE_FROM = CHIP_FLIES_AT + CHIP_FADE_FROM * (1 - CHIP_FLIES_AT);
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
/**
 * In dock mode the viewer's hand is not drawn on the table: a card discarded or played
 * from it does not fly across the table. Where the viewer saw it, a copy rises, held up, and fades
 * out.
 */
const RISE_MS = 300;
const RISE_PX = 120;
/**
 * In dock mode, the avatar a drawn card's copy lands on or beside pulses as it lands: it grows a
 * little and back, on its scale alone (transform-family: nothing painted again).
 */
const PULSE_MS = 200;
const PULSE_SCALE = 1.12;

/** A card or a pile on the screen: its middle, and its size without its tilt. */
interface Measured {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** An element where the new view draws it, measured before any motion starts (TableMotion.animate). */
interface Placed {
  element: HTMLElement;
  to: Measured;
  /** How much it is scaled on the screen (scaleOf): its translations are in its own units. */
  scale: number;
}

/** A copy's way from one place to another, on the screen: how far it goes, and how much it grows. */
function wayTo(from: Measured, to: Measured): { dx: number; dy: number; scale: number } {
  return { dx: to.cx - from.cx, dy: to.cy - from.cy, scale: from.w ? to.w / from.w : 1 };
}

/**
 * An element's way back from where it showed to its new place (FLIP): how far off it starts, in its
 * own units (table units on a zoomed surface), and how much larger.
 */
function wayFrom({ to, scale }: Placed, from: Measured): { dx: number; dy: number; size: number } {
  return {
    dx: (from.cx - to.cx) / scale,
    dy: (from.cy - to.cy) / scale,
    size: to.w ? from.w / to.w : 1,
  };
}

/** What starts a motion measured beforehand: it writes to the page, and measures nothing. */
type Start<T = void> = () => T;

const START_NOTHING: Start = () => {};

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
  /**
   * It goes to an out-of-play pile's chip: it fades out into it on the last part of its way. When it
   * turns over, it does so first, where it starts (flipsFirst).
   */
  fades: boolean;
}

/**
 * A copy of a drawn card on its way from its pile to its slot in the hand; in dock mode, with no
 * hand sheet showing its hand, to the dock's hand button or a hero selector entry (dock), also from
 * the table for a card taken back into the hand.
 */
interface DrawFlight extends FlightBase {
  kind: 'draw';
  /** The pile it flies out of; none for a card taken from the table. */
  pile: string | undefined;
  /** The card as it is in the hand. */
  card: CardView;
  /** It shows its face all along; otherwise it leaves on its back and turns over on the way. */
  faceUp: boolean;
  to: Measured;
  /** The slot's tilt on the fan, in degrees. */
  angle: number;
  /** Where it lands on the dock or the hero selector (dockLanding); null for a hand slot. */
  dock: DockLanding | null;
  /** It lands in an open sheet (the hand sheet's carousel or its header): it is drawn over it. */
  overSheet: boolean;
}

/**
 * Where a drawn card's copy lands in dock mode when no hand sheet shows its slot: on the dock or a
 * hero selector entry (dockLanding), or in the hand sheet's hand size (sheetCountLanding). Nothing
 * follows it there (#follow), an accepted approximation: the mini cards may move up as others leave
 * the hand, a switch of deck moves the selector's entries.
 */
interface DockLanding {
  /** It goes into an avatar or a capsule: it fades out on the last part of its way, as into a chip. */
  fades: boolean;
  /** The avatar that pulses as it lands; none for the hand sheet's hand size. */
  pulse: HTMLElement | null;
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

/**
 * A copy of a card discarded or played from the viewer's hand in dock mode, rising and fading out
 * where the viewer saw it (riseOrigin): its pile shows it at once, or the table at its spot. Its
 * face shows as the hand sheet and the dock draw it, a landscape card turned a quarter.
 */
interface RiseFlight extends FlightBase {
  kind: 'rise';
  /** The card as it was in the hand. */
  card: CardView;
  /** It starts on the dock's hand button as a card the table draws: what it shows is zoomed alike. */
  zoomed: boolean;
}

type Flight = PileFlight | DrawFlight | AwayFlight | ArriveFlight | RiseFlight;

const handCard = (id: string) => `.hand .hcard[data-id="${CSS.escape(id)}"]`;
/** A card another player drags, or has just let go of (Presence.svelte). */
const remoteGhost = (id: string) => `.presence .card.ghost[data-id="${CSS.escape(id)}"]`;
/** The viewer's own drop, held up where it landed until the view shows it (DragLayer.svelte). */
const OWN_GHOST = '.draglayer .card.ghost.landed';
const ownGhost = (id: string) => `${OWN_GHOST}[data-id="${CSS.escape(id)}"]`;
/**
 * A pile where it shows: drawn on the table, or, out of play, the chip on its
 * owner's frame (Surface.svelte). A pile is never both.
 */
const pilePlace = (id: string) => `${tablePile(id)}, .surface .chip[data-pile="${CSS.escape(id)}"]`;
/** The chip that stands for an out-of-play pile, on its owner's frame (Surface.svelte). */
const PILE_CHIP = '.surface .chip[data-pile]';
/** The hand button of the dock (Dock.svelte), where the hand opens in dock mode. */
const DOCK_HAND_BUTTON = '.dock .handbtn';
/** The dock's hand button while it shows that seat's hand. */
const dockHandButton = (seat: number) => `${DOCK_HAND_BUTTON}[data-seat="${seat}"]`;
/** A seat's entry in a hero selector (HeroPicker.svelte). */
const heroEntry = (seat: number) => `.picker .item[data-seat="${seat}"]`;
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

/**
 * How much an element is scaled on the screen: by the zoom on the table and in the drag layer, by
 * the hand's own transform. Not by a lift or a sway, nor by an exhausted card's tilt: its box on
 * the screen grows with them.
 */
function scaleOf(element: HTMLElement, zoom: number): number {
  if (element.closest('.surface, .draglayer')) {
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
  const rest = (card.querySelector<HTMLElement>('.hit') ?? card).getBoundingClientRect();
  return {
    // Its size is the card's own, never tilted; its centre is the slot's.
    slot: { ...measure(card, 1), cx: rest.left + rest.width / 2, cy: rest.top + rest.height / 2 },
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

/** What is left of a tilt still playing on a card, in degrees (its rotate property): 0 at rest. */
function playingTilt(element: HTMLElement): number {
  const angle = Number.parseFloat(getComputedStyle(element).rotate);
  return Number.isFinite(angle) ? angle : 0;
}

/**
 * The transform an element has of its own, which a turn keeps: an exhausted table card's tilt, a
 * hand card's placement; '' for none.
 */
function ownTransform(element: HTMLElement): string {
  const transform = getComputedStyle(element).transform;
  return transform === 'none' ? '' : transform;
}

/** Measures an element where it is drawn, for a motion to start there (#slide, #tuck). */
function placedAt(element: HTMLElement, zoom: number): Placed {
  return { element, to: measure(element, zoom), scale: scaleOf(element, zoom) };
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
 * Where a card leaves from (originOf, pilePlace): where it shows, the
 * viewer's own drop at the size it is held up at, or, out of
 * an out-of-play pile, a card on the chip that stands for the pile. The chip
 * is wider than tall and smaller than a card, but a card leaves it as a card:
 * it travels at a card's size, from the chip's middle, and a portrait card
 * does not count as landscape for the quarter turn (PileFlight.quarter). In
 * dock mode it is the size the table draws its cards at.
 */
function measureOrigin(element: HTMLElement, zoom: number): Measured {
  if (element.matches(OWN_GHOST)) {
    // Held up where it was let go: it leaves at that size, the lift easing off on its way.
    const ghost = measure(element, zoom);
    return { ...ghost, w: ghost.w * LIFT_SCALE, h: ghost.h * LIFT_SCALE };
  }
  if (!element.matches(PILE_CHIP)) {
    return measure(element, zoom);
  }
  return tableCardOn(element, zoom, element.closest('.dock-mode') !== null);
}

/** A portrait card as the table draws it, centred on an element: in dock mode, at the dock scale. */
function tableCardOn(element: HTMLElement, zoom: number, dock: boolean): Measured {
  const under = measure(element, zoom);
  const scale = dock ? DOCK_SCALE : 1;
  return {
    cx: under.cx,
    cy: under.cy,
    w: PORTRAIT_CARD.w * scale * zoom,
    h: PORTRAIT_CARD.h * scale * zoom,
  };
}

/**
 * Whether a card leaves the viewer's hand in dock mode by an action, as the hand sheet's, not a
 * drop: discarded, or played onto the table. It rises where the viewer saw it
 * (RiseFlight). A drop flies or slides from its ghost, which the viewer saw let go, as anywhere
 * else.
 */
function risesAway(
  root: HTMLElement,
  anim: Anim,
  tables: { before: TableView | undefined; after: TableView | undefined },
): anim is Extract<Anim, { kind: 'fly' | 'move' }> {
  let leavesHand: boolean;
  if (anim.kind === 'fly') {
    const pile = tables.after?.piles.find((p) => p.id === anim.toPile);
    leavesHand = anim.fromPile === undefined && pile !== undefined && isDiscardPile(pile.kind);
  } else if (anim.kind === 'move') {
    leavesHand = anim.to.zone === 'table';
  } else {
    return false;
  }
  if (!leavesHand || anim.dropped || !root.matches('.dock-mode')) {
    return false;
  }
  const ghost = root.querySelector(`${remoteGhost(anim.id)}, ${ownGhost(anim.id)}`);
  const card = tables.before?.cards.find((c) => c.id === anim.id);
  return ghost === null && card?.zone === 'hand';
}

/**
 * Where a card discarded or played from the viewer's hand in dock mode rises from: its card in the
 * hand sheet's carousel, whose Play and Discard send it; else, with the sheet shut (the card sent
 * another way, as by an undo), a card the table draws on the dock's hand button. The sheet is still
 * there as it slides away: the copy rises from where the card was.
 */
function riseOrigin(
  root: HTMLElement,
  id: string,
  zoom: number,
): Pick<RiseFlight, 'from' | 'zoomed'> | null {
  const inSheet = root.querySelector<HTMLElement>(handCard(id));
  if (inSheet) {
    return { from: measure(inSheet, zoom), zoomed: false };
  }
  const button = root.querySelector<HTMLElement>(DOCK_HAND_BUTTON);
  if (button) {
    return { from: tableCardOn(button, zoom, true), zoomed: true };
  }
  return null;
}

/**
 * Whether a table card goes back into the viewer's hand in dock mode by an action, not a drop of
 * the viewer's (dropped): it flies to the dock as a drawn card does, unless the hand sheet shows its
 * hand once the view is drawn (#dockFlight). Its place on the table must have been measured.
 */
function takenBackToDock(
  root: HTMLElement,
  anim: Anim,
  before: ReadonlyMap<string, Measured>,
): anim is Extract<Anim, { kind: 'move' }> {
  if (anim.kind !== 'move' || anim.dropped || !root.matches('.dock-mode')) {
    return false;
  }
  return anim.from.zone === 'table' && anim.to.zone === 'hand' && before.has(anim.id);
}

/** The seat whose hand a card is in, in a table view: hands are listed by seat area. */
function handSeatOf(table: TableView | undefined, id: string): number | null {
  for (const [area, hand] of Object.entries(table?.hands ?? {})) {
    if (hand?.includes(id)) {
      return seatOf(area as Area);
    }
  }
  return null;
}

/**
 * The first element matching selector that still shows: none of an inert part of the page, as a
 * sheet sliding away is until it is gone (Sheet.svelte).
 */
function shownElement(root: HTMLElement, selector: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (!element.closest('[inert]')) {
      return element;
    }
  }
  return null;
}

/** A portrait card as high as an element, centred on it: what goes into an avatar. */
function portraitOn(element: HTMLElement): Measured {
  const rect = element.getBoundingClientRect();
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w: (rect.height * PORTRAIT_CARD.w) / PORTRAIT_CARD.h,
    h: rect.height,
  };
}

/**
 * Where a card drawn into a seat's hand lands in dock mode when no hand sheet shows that hand. On
 * the dock's hand button showing the seat: on the bar, the card's own mini card, or the last one for
 * a card past them; on the rail, which has none, the avatar. Else that seat's hero selector entry,
 * the hand sheet's own first, as it lies over the table, unless the sheet is sliding away
 * (shownElement). Null when none shows (no selector, a drag over the hand button).
 */
function dockLanding(
  root: HTMLElement,
  id: string,
  seat: number,
  zoom: number,
): { to: Measured; dock: DockLanding; overSheet: boolean } | null {
  const button = root.querySelector<HTMLElement>(dockHandButton(seat));
  if (button) {
    const avatar = button.querySelector<HTMLElement>('.avatar');
    const minis = [...button.querySelectorAll<HTMLElement>('.mini')];
    const mini = minis.find((element) => element.dataset.id === id) ?? minis.at(-1);
    if (mini && avatar) {
      return { to: measure(mini, zoom), dock: { fades: false, pulse: avatar }, overSheet: false };
    }
    if (avatar) {
      return { to: portraitOn(avatar), dock: { fades: true, pulse: avatar }, overSheet: false };
    }
    return null;
  }
  const entry =
    shownElement(root, `.sheet ${heroEntry(seat)}`) ?? shownElement(root, heroEntry(seat));
  const swatch = entry?.querySelector<HTMLElement>('.swatch');
  if (!swatch) {
    return null;
  }
  return {
    to: portraitOn(swatch),
    dock: { fades: true, pulse: swatch },
    overSheet: swatch.closest('.sheet') !== null,
  };
}

/**
 * Whether a hand sheet card's slot lies out of sight in its carousel, its middle past the
 * carousel's edges: a drawn card's is added after the others, past the card in the middle.
 */
function outOfCarousel(card: HTMLElement): boolean {
  const carousel = card.closest('[data-carousel]');
  if (!carousel) {
    return false;
  }
  const box = carousel.getBoundingClientRect();
  const { slot } = measureSlot(card);
  return slot.cx < box.left || slot.cx > box.right || slot.cy < box.top || slot.cy > box.bottom;
}

/**
 * Where a card drawn into the hand the hand sheet shows lands when its slot lies out of sight
 * (outOfCarousel): in the hand size in the sheet's header, fading out. Null without one.
 */
function sheetCountLanding(card: HTMLElement): { to: Measured; dock: DockLanding } | null {
  const count = card.closest('.sheet')?.querySelector<HTMLElement>('.title .count-pill');
  return count ? { to: portraitOn(count), dock: { fades: true, pulse: null } } : null;
}

/**
 * A card taken back into the hand flies as the hand draws it, portrait: off a landscape spot on the
 * table, it leaves from a portrait box about the same middle, its long side upright. The box
 * changes at once, with no quarter turn: the copy shows the card as the hand does from the start.
 */
function asPortrait(from: Measured): Measured {
  return from.w > from.h ? { ...from, w: from.h, h: from.w } : from;
}

/** A deck's hidden top card the viewer dragged landed as an unknown card, not under its id. */
function unknownTopGhost(
  root: HTMLElement,
  fromPile: string | undefined,
  piles: readonly PileView[],
): HTMLElement | null {
  const pile = piles.find((p) => p.id === fromPile);
  return pile ? root.querySelector<HTMLElement>(ownGhost(unknownTopId(pile))) : null;
}

/**
 * What a card about to travel shows on now: another player's ghost of it,
 * where they let it go; else its place on the table or in the hand, under the
 * id it had there for a card that got a new one, or the pile it leaves. The
 * viewer's own drop slipping under a pile, flying to one, or tucked into a
 * stack, lies where it landed.
 */
function originOf(root: HTMLElement, anim: Anim, piles: readonly PileView[]): HTMLElement | null {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector);
  const placed = (id: string) => `${tableCard(id)}, ${handCard(id)}`;
  const unknownTop = (fromPile: string | undefined) => unknownTopGhost(root, fromPile, piles);
  switch (anim.kind) {
    case 'move': {
      const landed = anim.dropped ? find(ownGhost(anim.id)) : null;
      return find(remoteGhost(anim.id)) ?? landed ?? find(placed(anim.was ?? anim.id));
    }
    case 'away':
      return find(remoteGhost(anim.id)) ?? find(placed(anim.id));
    case 'under':
      return find(remoteGhost(anim.id)) ?? find(ownGhost(anim.id)) ?? find(placed(anim.id));
    case 'fly': {
      const place = anim.fromPile === undefined ? placed(anim.id) : pilePlace(anim.fromPile);
      const ghost = find(remoteGhost(anim.id)) ?? find(ownGhost(anim.id));
      const top = anim.dropped ? unknownTop(anim.fromPile) : null;
      return ghost ?? top ?? find(place);
    }
    case 'enter': {
      const landed = anim.dropped ? (find(ownGhost(anim.id)) ?? unknownTop(anim.fromPile)) : null;
      return find(remoteGhost(anim.id)) ?? landed ?? find(pilePlace(anim.fromPile));
    }
    default:
      return null;
  }
}

/**
 * Whether a copy flying to a pile shows its face as a pile draws it: where
 * it shows it, on the pile it leaves, or, turning face up, on the pile it
 * lands on. A card revealed on a deck lies there as the pile draws it, but
 * its ghost, the viewer's or another player's, lies as the table draws it:
 * landscape for a side scheme (from, wider than tall). The viewer's own drop
 * leaves its ghost, which the table draws.
 */
function facesAsOnPile(
  anim: Extract<Anim, { kind: 'fly' }>,
  card: CardView | undefined,
  from: Measured | undefined,
): boolean {
  if (anim.turns === 'up') {
    return true;
  }
  if (card?.onPile !== undefined) {
    return from === undefined || from.h >= from.w;
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

/**
 * The table piles whose count hides while the animation plays (TableMotion.isHushed): those it
 * leaves or lands on, and a pile riffled or turning a new top card face up. The viewer's own drop
 * of a pile's card leaves from its ghost, clear of the pile, whose count went down with the drag
 * (interaction.takenFrom): only the pile it lands on hides its count.
 */
function hushedPiles(anim: Anim): string[] {
  switch (anim.kind) {
    case 'fly':
      return anim.fromPile === undefined || anim.dropped
        ? [anim.toPile]
        : [anim.toPile, anim.fromPile];
    case 'under':
      return [anim.toPile];
    case 'enter':
      return anim.dropped ? [] : [anim.fromPile];
    case 'draw':
      return [anim.fromPile];
    case 'drawAway':
    case 'arrive':
    case 'shuffle':
    case 'reveal':
      return [anim.pile];
    default:
      return [];
  }
}

/** The back a copy shows for a card the viewer did not see: the one its pile shows. */
function backOf(pile: PileView | undefined): Pick<UnseenHandFlight, 'back' | 'caption'> {
  return { back: pile ? pileBack(pile) : 'player', caption: pile ? pileCaption(pile) : undefined };
}

/** A player colour (styles/tokens.css) as the keyframes need it: a value, not a var(). */
function playerColor(color: number): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(playerColorToken(color))
    .trim();
  return value || '#ffffff';
}

/**
 * A copy's way from one place to another, tilting to angle degrees as it
 * goes; when it turns, it turns over in the last part of the way: edge-on
 * from one side, then flat on the other.
 */
function turningFrames(from: Measured, to: Measured, angle: number, turns: boolean): Keyframe[] {
  const { dx, dy, scale } = wayTo(from, to);
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

/** A lift of a turning card: up to edge-on, back down flat from there, or both in turn (#lift). */
type Lift = 'up' | 'down' | 'upAndDown';

/** The keyframes of a lift on a card's scale property, or on its shade's translate property. */
function liftFrames(property: 'scale' | 'translate', lift: Lift): Keyframe[] {
  const flat = property === 'scale' ? '1' : '0px 0px';
  const lifted = property === 'scale' ? `${LIFT_SCALE}` : LIFT_SHADE;
  switch (lift) {
    case 'up':
      return [{ [property]: flat, easing: 'ease-out' }, { [property]: lifted }];
    case 'down':
      return [{ [property]: lifted, easing: 'ease-in' }, { [property]: flat }];
    case 'upAndDown':
      return [
        { [property]: flat, easing: 'ease-out' },
        { [property]: lifted, offset: 0.5, easing: 'ease-in' },
        { [property]: flat },
      ];
  }
}

/** A copy flying to a pile or to the hand is held up on its way (LIFT_SCALE), then put down. */
const FLIGHT_LIFT_FRAMES: Keyframe[] = [
  { scale: '1' },
  { scale: `${LIFT_SCALE}`, offset: FLIGHT_LIFT_AT },
  { scale: '1' },
];

/**
 * A copy turning over before it flies to a chip (flipsFirst) rises as it turns, easing out to
 * edge-on, stays held up until it leaves, then comes down on its way. The keyframes carry their own
 * easing: the animation runs linear.
 */
const CHIP_FLIP_LIFT_FRAMES: Keyframe[] = [
  { scale: '1', offset: 0, easing: 'ease-out' },
  { scale: `${LIFT_SCALE}`, offset: CHIP_EDGE_ON },
  { scale: `${LIFT_SCALE}`, offset: CHIP_FLIES_AT, easing: 'ease-in-out' },
  { scale: '1', offset: 1 },
];

/** A copy flying to an out-of-play pile's chip fades out into it, evenly from fadeFrom of its way. */
function chipFadeFrames(fadeFrom: number): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 1, offset: fadeFrom }, { opacity: 0 }];
}

const DRAW_AWAY_FRAMES: Keyframe[] = [
  { transform: 'translate(0, 0) scale(1)', opacity: 1 },
  { transform: `translate(0, ${DRAW_AWAY_DROP_PX}px) scale(${DRAW_AWAY_SCALE})`, opacity: 0 },
];

/** The avatar a drawn card's copy lands on in dock mode pulses (PULSE_MS). */
const PULSE_FRAMES: Keyframe[] = [{ scale: '1' }, { scale: `${PULSE_SCALE}` }, { scale: '1' }];

/** A card discarded or played from the viewer's hand in dock mode rises, held up, and fades out (RiseFlight). */
const RISE_FRAMES: Keyframe[] = [
  { transform: 'translateY(0)', scale: `${LIFT_SCALE}`, opacity: 1 },
  { transform: `translateY(-${RISE_PX}px)`, scale: `${LIFT_SCALE}`, opacity: 0 },
];

/** A card put on a pile out of a hand the viewer does not see rises into it, fading in. */
const ARRIVE_FRAMES: Keyframe[] = [...DRAW_AWAY_FRAMES].reverse();

/**
 * A card slipping under its pile: it flies to just below the pile, then slides
 * up into it, only its part past the pile's bottom edge showing, as if the
 * pile lay over it. The clip is in the copy's own box, before its scale.
 */
function underFrames(flight: PileFlight): Keyframe[] {
  const { dx, dy, scale } = wayTo(flight.from, flight.to);
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
  const { dx, dy, scale } = wayTo(flight.from, flight.to);
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
  const { dx, dy } = wayTo(flight.from, flight.to);
  // Its long side ends as tall as the pile.
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

/**
 * A copy flying to an out-of-play pile's chip that turns over on its way does so first, where it
 * starts (chipFlipFrames): turning in the last part of its way, it would be all but faded out.
 */
function flipsFirst(flight: PileFlight): boolean {
  return flight.fades && flight.turns !== undefined;
}

/**
 * A turning copy's way to an out-of-play pile's chip (flipsFirst): it turns over where it starts,
 * easing in to edge-on and out flat again, as a card turned over on the table does, then flies to
 * the chip. The keyframes carry their own easing: the animation runs linear.
 */
function chipFlipFrames(flight: PileFlight): Keyframe[] {
  const { dx, dy, scale } = wayTo(flight.from, flight.to);
  // Part of the way there, turned about its vertical axis by turn degrees, as turningFrames has it.
  const pose = (progress: number, turn: number): string =>
    `${FLIP_PERSPECTIVE} translate(${dx * progress}px, ${dy * progress}px)` +
    ` scale(${1 + (scale - 1) * progress}) rotateY(${turn}deg)`;
  return [
    { transform: pose(0, 0), offset: 0, easing: 'ease-in' },
    { transform: pose(0, 90), offset: CHIP_EDGE_ON, easing: 'ease-out' },
    { transform: pose(0, 0), offset: CHIP_FLIES_AT, easing: FLY_EASING },
    { transform: pose(1, 0), offset: 1 },
  ];
}

/**
 * How long a copy takes to get where it goes: turned over there when it turns a quarter on its way,
 * or turned over first when it goes to a chip.
 */
function flightMs(flight: Flight): number {
  if (flight.kind === 'rise') {
    return RISE_MS;
  }
  if (flight.kind !== 'toPile') {
    return DRAW_MS;
  }
  if (flight.under) {
    return UNDER_MS;
  }
  if (flipsFirst(flight)) {
    return CHIP_FLIP_MS;
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
    case 'rise':
      return isTouched(flight.card);
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
  /**
   * The cards drawn into the hand, flying in from their pile, and in dock mode the table cards taken
   * back into it, flying to the dock: hidden in the hand, and left out of its counts, until they land.
   */
  readonly drawing = new SvelteSet<string>();
  /**
   * Counts the frames while cards move: what is drawn from the cards' places
   * on the screen (the arrows) measures again at each one. It counts only
   * while an effect reads it: with nothing drawn from the cards' places, no
   * frame is counted.
   */
  get frame(): number {
    this.#followFrames();
    return this.#frame;
  }

  #frame = $state(0);
  // Whether an effect reads the frame counter (#followFrames).
  #framesFollowed = false;
  // Starts counting the frames once an effect reads them, cards moving or as soon as they move, and
  // stops once the last effect reading them is gone.
  #followFrames = createSubscriber(() => {
    this.#framesFollowed = true;
    this.#countFrames();
    return () => {
      this.#framesFollowed = false;
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
    };
  });

  /**
   * Whether a pile's count hides (PileView): something leaves or lands on it, or it riffles or turns
   * a new top card face up, in a view still playing. It hides as the view is drawn and shows again
   * once the last of it has ended, landed or stopped.
   */
  isHushed(pile: string): boolean {
    return this.#hushes.has(pile);
  }

  /** Whether cards move on the screen: animated to a new place, or flying to and from piles. */
  get moving(): boolean {
    return this.#cardsMoving || this.flights.length > 0;
  }

  #cardsMoving = $state(false);

  // Each running animation, with what it plays on.
  #running = new Map<Animation, Subject>();
  // The animations that move cards on the screen, which the frame counter follows.
  #moving = new Set<Animation>();
  // The table cards turned over (#flip) or turned in (#turnIn), by the animation that turns each one.
  #turning = new Map<Animation, string>();
  // The riffle copies added to piles, with their pile.
  #copies = new Map<HTMLElement, Subject>();
  #raf = 0;
  #nextKey = 0;
  // Counts the views animated: a view that came while the previous one was drawn takes over.
  #generation = 0;
  // The piles whose count hides (isHushed), with how many views still play on each: a pile shows its
  // count again only once the last of them has ended.
  readonly #hushes = new SvelteMap<string, number>();
  // What waits for each flight to end, by its key: called once it has landed or was stopped (#release).
  #flightEnds = new Map<number, () => void>();

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
    const reduced = prefersReducedMotion.current;
    // Without motion, the state shows at once; the glow is a flash, not a motion.
    const shown = reduced ? anims.filter((anim) => anim.kind === 'glow') : anims;
    // Read within this call only: nothing reacts to it.
    // Where each card about to travel shows now (originOf, measureOrigin).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const before = new Map<string, Measured>();
    for (const anim of shown) {
      const element = root ? originOf(root, anim, tables.before?.piles ?? []) : null;
      if (element && 'id' in anim) {
        before.set(anim.id, measureOrigin(element, zoom));
      }
    }
    // A card discarded or played from the viewer's hand in dock mode rises where the viewer saw it (riseOrigin).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const rising = new Map<string, Pick<RiseFlight, 'from' | 'zoomed'>>();
    for (const anim of shown) {
      if (!root || !risesAway(root, anim, tables)) {
        continue;
      }
      const origin = riseOrigin(root, anim.id, zoom);
      if (origin) {
        rising.set(anim.id, origin);
      }
    }
    // A card drawn or put on a pile with no card on the table goes from where the pile shows (pilePlace).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const pilesBefore = new Map<string, Measured>();
    for (const anim of shown) {
      const pile = pileOf(anim);
      const element = pile === null ? null : root?.querySelector<HTMLElement>(pilePlace(pile));
      if (pile !== null && element) {
        pilesBefore.set(pile, measureOrigin(element, zoom));
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
    // A card caught mid-tilt tilts again from the angle it shows (#tilt).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const tilting = new Map<string, number>();
    for (const anim of shown) {
      if (anim.kind !== 'tilt') {
        continue;
      }
      const element = root?.querySelector<HTMLElement>(tableCard(anim.id));
      if (element) {
        tilting.set(anim.id, playingTilt(element));
      }
    }
    // The viewer's own drop settles upright from the angle its ghost swayed to (#settle,
    // #slideAndSettle).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const swayed = new Map<string, number>();
    for (const anim of shown) {
      const slidesIn = (anim.kind === 'move' || anim.kind === 'enter') && anim.settles;
      if (anim.kind !== 'settle' && !slidesIn) {
        continue;
      }
      // Out of a deck, its ghost may be the deck's unknown top card.
      const fromPile = anim.kind === 'move' ? undefined : anim.fromPile;
      const ghost = root
        ? (root.querySelector<HTMLElement>(ownGhost(anim.id)) ??
          unknownTopGhost(root, fromPile, tables.before?.piles ?? []))
        : null;
      if (ghost) {
        swayed.set(anim.id, playingTilt(ghost));
      }
    }
    // A card sliding to its new place, or settling where the viewer let it go, plays on the scale
    // property: it is not lifted as it turns (face up, out of a deck the viewer dragged it off).
    const onScale = new Set(
      shown.flatMap((anim) =>
        anim.kind === 'move' || anim.kind === 'enter' || anim.kind === 'settle' ? [anim.id] : [],
      ),
    );
    this.#stopFor(shown, tables.after);
    const generation = ++this.#generation;
    if (!root || shown.length === 0) {
      return;
    }
    // The pile is drawn without the flying cards from the start: they land on it later.
    const flying = shown.flatMap((anim) => {
      if (anim.kind === 'fly' && before.has(anim.id) && !rising.has(anim.id)) {
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
    // A drawn card is hidden in the hand from the start: its copy shows it on its way there. So is a
    // table card taken back into the hand in dock mode, until the view shows whether it flies to the
    // dock (#dockFlight).
    const takenBack = new Set(
      shown.flatMap((anim) => (takenBackToDock(root, anim, before) ? [anim.id] : [])),
    );
    const drawn = shown.flatMap((anim) =>
      anim.kind === 'draw' && pilesBefore.has(anim.fromPile) ? [anim.id] : [],
    );
    drawn.push(...takenBack);
    for (const id of drawn) {
      this.drawing.add(id);
    }
    // The piles the view plays on hide their count from the start, still showing the one they had:
    // their new count shows once the cards have landed. Without Web Animations (#run), nothing plays
    // on them: they keep it in sight, rather than hide it as the view is drawn.
    const animates = typeof root.animate === 'function';
    // Nothing lands on the pile a card rises away to: it shows its new count at once.
    const landing = shown.filter((anim) => !(anim.kind === 'fly' && rising.has(anim.id)));
    const hushed = new Set(animates ? landing.flatMap(hushedPiles) : []);
    for (const pile of hushed) {
      this.#hush(pile);
    }
    // The piles whose count shows again once what plays on them has ended (playing). Any other shows
    // it again as the view is drawn, even should drawing it throw: motion lasts as long as the page.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const handedOver = new Set<string>();
    try {
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
      // What plays on each pile: its count shows again once all of it has ended.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const playing = new Map<string, Promise<unknown>[]>();
      const playsOn = (pile: string, ended: Promise<unknown> | undefined) => {
        if (!ended) {
          return;
        }
        let endings = playing.get(pile);
        if (!endings) {
          endings = [];
          playing.set(pile, endings);
        }
        endings.push(ended);
      };
      // A copy plays on the piles its animation hushes until it has landed or was stopped. Its key
      // stays the same once staggered.
      const launch = (anim: Anim, flight: Flight) => {
        flights.push(flight);
        const piles = hushedPiles(anim);
        if (piles.length === 0) {
          return;
        }
        const ended = this.#ended(flight);
        for (const pile of piles) {
          playsOn(pile, ended);
        }
      };
      // Everything the motions start from is measured first, on the view just drawn, then they all
      // start: a measure after a start would lay the page out again, once per card, in the view's
      // first frame. The copies' flights only measure.
      const starts: Start[] = [];
      // A card tilting meanwhile (exhausted or readied by another player) tilts on the same rotate
      // property: it comes upright from its sway at once.
      const leanOf = (id: string) => (tilting.has(id) ? 0 : (swayed.get(id) ?? 0));
      // The viewer's own drop in dock mode lands in its slot; any other card slides there.
      const slideOf = (anim: Extract<Anim, { kind: 'move' | 'enter' }>) =>
        anim.settles
          ? this.#slideAndSettle(root, anim.id, before.get(anim.id), zoom, leanOf(anim.id))
          : this.#move(root, anim.id, before.get(anim.id), zoom, anim.tuck);
      for (const anim of shown) {
        switch (anim.kind) {
          // A card played from the viewer's hand in dock mode also rises where the viewer saw it: the
          // table still slides it to its spot from there, under the sheet that showed it.
          case 'move': {
            const rise = rising.get(anim.id);
            const inHand = cardsBefore.get(anim.id);
            if (rise && inHand) {
              flights.push({ kind: 'rise', key: ++this.#nextKey, card: inHand, ...rise, delay: 0 });
            }
            // A table card taken back into a hand no sheet shows flies to the dock, leaving as the
            // table showed it: on its back when it lay face down (under the id it had there), turning
            // face up on its way. Into the hand the sheet shows, it slides into its slot.
            if (takenBack.has(anim.id)) {
              const from = before.get(anim.id);
              const card = cardsAfter.get(anim.id);
              const onTable = cardsBefore.get(anim.was ?? anim.id);
              const faceUp = onTable === undefined || !isHidden(onTable);
              const shownInSheet = shownElement(root, handCard(anim.id)) !== null;
              const flight =
                from && card && !shownInSheet
                  ? this.#dockFlight(
                      root,
                      { card, pile: undefined, from: asPortrait(from), faceUp },
                      tables.after,
                      zoom,
                    )
                  : null;
              if (flight) {
                launch(anim, flight);
                break;
              }
              this.drawing.delete(anim.id);
            }
            starts.push(slideOf(anim));
            break;
          }
          // A card come onto the table slides out of its pile as a moved card does.
          case 'enter': {
            const slide = slideOf(anim);
            starts.push(() => playsOn(anim.fromPile, slide()?.finished));
            break;
          }
          case 'marker':
            starts.push(this.#moveMarker(root, anim.name, markersBefore.get(anim.name), zoom));
            break;
          case 'tilt':
            starts.push(() => this.#tilt(root, anim.id, anim.exhausted, tilting.get(anim.id) ?? 0));
            break;
          case 'settle': {
            const lean = leanOf(anim.id);
            starts.push(() => this.#settle(root, anim.id, lean));
            break;
          }
          case 'turnIn':
            starts.push(this.#turnIn(root, anim.id, !onScale.has(anim.id)));
            break;
          case 'flip':
            starts.push(this.#flip(root, anim.id, oldSides.get(anim.id), !onScale.has(anim.id)));
            break;
          case 'glow':
            starts.push(this.#glow(root, anim.id, anim.color));
            break;
          // Riffled below, once the copies flying into the pile are known.
          case 'shuffle':
            shuffled.push(anim.pile);
            break;
          case 'reveal':
            starts.push(() => playsOn(anim.pile, this.#reveal(root, anim.pile)?.finished));
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
              launch(anim, flight);
            }
            break;
          }
          case 'fly': {
            const rise = rising.get(anim.id);
            const inHand = cardsBefore.get(anim.id);
            if (rise && inHand) {
              flights.push({ kind: 'rise', key: ++this.#nextKey, card: inHand, ...rise, delay: 0 });
              break;
            }
            // Turning face up, it shows the face it lands on: it may lie face down before, or be new
            // in the view, out of a deck. Otherwise it shows as it left.
            const card =
              anim.turns === 'up'
                ? (cardsAfter.get(anim.id) ?? cardsBefore.get(anim.id))
                : (cardsBefore.get(anim.id) ?? cardsAfter.get(anim.id));
            const from = before.get(anim.id);
            const flight = this.#flight(root, anim.toPile, from, card, {
              asOnPile: facesAsOnPile(anim, card, from),
              turns: anim.turns,
            });
            if (flight) {
              launch(anim, flight);
            } else {
              this.flying.delete(anim.id);
            }
            break;
          }
          case 'away': {
            const from = before.get(anim.id);
            const card = cardsBefore.get(anim.id);
            if (from && card) {
              launch(anim, this.#awayFlight(undefined, from, card, pileViews));
            }
            break;
          }
          case 'arrive': {
            const from = pilesBefore.get(anim.pile);
            const card = anim.card === undefined ? undefined : cardsAfter.get(anim.card);
            if (from) {
              launch(anim, {
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
            const flight =
              from && card
                ? this.#drawFlight(root, anim, from, card, pileViews, tables.after, zoom)
                : null;
            if (flight) {
              launch(anim, flight);
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
              launch(anim, this.#awayFlight(anim.pile, from, card, pileViews));
            }
            break;
          }
        }
      }
      for (const start of starts) {
        start();
      }
      const launched = staggered(flights);
      for (const pile of shuffled) {
        for (const animation of this.#riffle(root, pile, lastLanding(launched, pile))) {
          playsOn(pile, animation.finished);
        }
      }
      this.flights = [...this.flights, ...launched];
      for (const pile of hushed) {
        const endings = playing.get(pile);
        if (endings) {
          void Promise.allSettled(endings).then(() => this.#unhush(pile));
          handedOver.add(pile);
        }
      }
    } finally {
      // A pile nothing plays on after all (a newer view took over, or its cards or itself were not found)
      // shows its count at once.
      for (const pile of hushed) {
        if (!handedOver.has(pile)) {
          this.#unhush(pile);
        }
      }
      // So does a card hidden from the start whose copy never took off, should drawing the view
      // throw. A newer view that took over has shown them already, and may hide them again.
      if (generation === this.#generation) {
        this.#showUnlaunched(drawn, flying);
      }
    }
  }

  /**
   * Shows the cards hidden as a view was drawn (in the hand, or as their pile was) that no copy
   * still flying carries: their copy never took off.
   */
  #showUnlaunched(drawn: readonly string[], flying: readonly string[]): void {
    const carried = (waiting: SvelteSet<string>) =>
      new Set(
        this.flights.flatMap((flight) =>
          this.#waitingFor(flight) === waiting && flight.card ? [flight.card.id] : [],
        ),
      );
    const stillDrawing = carried(this.drawing);
    for (const id of drawn) {
      if (!stillDrawing.has(id)) {
        this.drawing.delete(id);
      }
    }
    const stillFlying = carried(this.flying);
    for (const id of flying) {
      if (!stillFlying.has(id)) {
        this.flying.delete(id);
      }
    }
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
        let lift = FLIGHT_LIFT_FRAMES;
        let liftEasing = 'ease-in-out';
        let fadeFrom = CHIP_FADE_FROM;
        if (flight.under) {
          frames = underFrames(flight);
        } else if (flight.quarter) {
          frames = quarterFrames(flight);
          edgeOn = QUARTER_EDGE_ON;
          easing = 'linear';
        } else if (flipsFirst(flight)) {
          frames = chipFlipFrames(flight);
          edgeOn = CHIP_EDGE_ON;
          easing = 'linear';
          lift = CHIP_FLIP_LIFT_FRAMES;
          liftEasing = 'linear';
          fadeFrom = CHIP_FLIP_FADE_FROM;
        } else if (flight.turns) {
          frames = turningFrames(flight.from, flight.to, 0, true);
        }
        const options = { ...timing, easing, duration: flightMs(flight) };
        animations.push(this.#run(element, frames, options, null));
        // On the scale property, apart from the transform its way plays on. Slipping under its
        // pile, it stays flat: the pile lies over it.
        if (!flight.under) {
          animations.push(this.#run(element, lift, { ...options, easing: liftEasing }, null));
        }
        // On the opacity of the copy itself: a turning copy's back plays on its own element.
        if (flight.fades) {
          const fade = { ...options, easing: 'linear' };
          animations.push(this.#run(element, chipFadeFrames(fadeFrom), fade, null));
        }
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
        // A hand slot moves with its hand; the dock and the hero selector stay where they are.
        if (toSlot && flight.dock === null) {
          this.#follow(toSlot, flight);
        }
        animations.push(toSlot);
        // Into an avatar, on the copy's opacity: a turning copy's back plays on its own element.
        if (flight.dock?.fades) {
          const fade = { ...timing, duration: DRAW_MS, easing: 'linear' };
          animations.push(this.#run(element, chipFadeFrames(CHIP_FADE_FROM), fade, null));
        }
        // On the scale property: the keyframes #follow rewrites leave it alone.
        animations.push(
          this.#run(
            element,
            FLIGHT_LIFT_FRAMES,
            { ...timing, duration: DRAW_MS, easing: 'ease-in-out' },
            null,
          ),
        );
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
      case 'rise':
        animations.push(
          this.#run(
            element,
            RISE_FRAMES,
            { ...timing, duration: RISE_MS, easing: 'ease-out' },
            null,
          ),
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
   * The ghost of a landscape card picked up off the deck it is revealed on
   * (DragLayer): it turns a quarter clockwise from the deck's portrait slot,
   * which draws it turned counter-clockwise, to lie landscape, the reverse of
   * the quarter a landscape card turns on its way to a pile (quarterFrames).
   * It turns about the point the pointer holds (held, as fractions of its
   * box), which stays on the same spot of its art. It turns on the rotate
   * property, as a tilt does, apart from the transform of an exhausted card.
   */
  turnOffPile(ghost: HTMLElement, held: Point): void {
    if (prefersReducedMotion.current) {
      return;
    }
    const transformOrigin = `${held.x * 100}% ${held.y * 100}%`;
    this.#run(
      ghost,
      [
        { rotate: '-90deg', transformOrigin },
        { rotate: '0deg', transformOrigin },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING },
      null,
    );
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

  /** Whether a table card is turned over or turned in: edge-on for a while, out of reach of the pointer. */
  isTurning(id: string): boolean {
    return [...this.#turning.values()].includes(id);
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
        this.#turning.delete(animation);
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
      case 'rise':
        return null;
    }
  }

  /**
   * The ended flights' cards show where they went, unless another copy of them still flies there;
   * what waited for them to end (#ended) goes on.
   */
  #release(ended: Flight[]): void {
    for (const flight of ended) {
      this.#flightEnds.get(flight.key)?.();
      this.#flightEnds.delete(flight.key);
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

  /** Resolves once the flight has landed or was stopped. */
  #ended(flight: Flight): Promise<void> {
    return new Promise((resolve) => this.#flightEnds.set(flight.key, resolve));
  }

  /** Hides a pile's count for one more view (isHushed). */
  #hush(pile: string): void {
    this.#hushes.set(pile, (this.#hushes.get(pile) ?? 0) + 1);
  }

  /** One view less plays on the pile: with none left, its count shows again. */
  #unhush(pile: string): void {
    const views = (this.#hushes.get(pile) ?? 0) - 1;
    if (views > 0) {
      this.#hushes.set(pile, views);
    } else {
      this.#hushes.delete(pile);
    }
  }

  /**
   * Measures a card at its new place, and returns what slides it there; tucked into a stack (tuck),
   * it slides in under the stack. The start returns the animation that takes it there, if one plays.
   */
  #move(
    root: HTMLElement,
    id: string,
    from: Measured | undefined,
    zoom: number,
    tuck: Tuck | undefined,
  ): Start<Animation | null> {
    const element = root.querySelector<HTMLElement>(`${tableCard(id)}, ${handCard(id)}`);
    if (!element || !from) {
      return () => null;
    }
    const placed = placedAt(element, zoom);
    if (tuck) {
      return () => this.#tuck(placed, from, cardSubject(id), tuck);
    }
    // Moving cards are followed frame by frame, for the arrows drawn between them.
    return () => this.#slide(placed, from, cardSubject(id), true);
  }

  /**
   * Slides a card tucked into a stack to its slot in two steps (TUCK_OUT_MS, TUCK_IN_MS): out to
   * its staging spot (TUCK_STAGING) drawn above the stack, at tuck.z, then up into its slot at its
   * own z-index, beneath the stack. The z-index above lives in the animation only: the card's own
   * comes back as the first step ends. Even a card already on its slot, the end of its own chain,
   * shifts out and back in.
   */
  #tuck(placed: Placed, from: Measured, subject: Subject, tuck: Tuck): Animation | null {
    const { element, to, scale } = placed;
    const { dx, dy, size } = wayFrom(placed, from);
    const stagingX = (to.w / scale) * TUCK_STAGING;
    const stagingY = (to.h / scale) * TUCK_STAGING;
    const duration = TUCK_OUT_MS + TUCK_IN_MS;
    // Each keyframe's easing plays from it to the next one: one step each.
    const slide = this.#run(
      element,
      [
        { translate: `${dx}px ${dy}px`, scale: `${size}`, easing: MOVE_EASING },
        {
          translate: `${stagingX}px ${stagingY}px`,
          scale: '1',
          offset: TUCK_OUT_MS / duration,
          easing: TUCK_IN_EASING,
        },
        { translate: '0px 0px', scale: '1' },
      ],
      { duration },
      subject,
      true,
    );
    this.#run(
      element,
      [{ zIndex: tuck.z }, { zIndex: tuck.z }],
      { duration: TUCK_OUT_MS },
      subject,
    );
    return slide;
  }

  /**
   * Measures a marker at its new place, and returns what slides it there from where it lay; no arrow
   * follows it.
   */
  #moveMarker(
    root: HTMLElement,
    name: MarkerName,
    from: Measured | undefined,
    zoom: number,
  ): Start {
    const element = root.querySelector<HTMLElement>(tableMarker(name));
    if (!element || !from) {
      return START_NOTHING;
    }
    const placed = placedAt(element, zoom);
    return () => {
      this.#slide(placed, from, markerSubject(name), false);
    };
  }

  /** Slides an element from where it showed to its new place, measured there (FLIP). */
  #slide(placed: Placed, from: Measured, subject: Subject, moves: boolean): Animation | null {
    const { dx, dy, size } = wayFrom(placed, from);
    const { element } = placed;
    if (Math.abs(dx) + Math.abs(dy) <= 1 && Math.abs(size - 1) <= 0.02) {
      return null;
    }
    // The translate and scale properties leave the element's own transform (a card's tilt) alone.
    return this.#run(
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

  /**
   * Tilts a card exhausted or readied from the angle it showed: its old tilt,
   * and playing, in degrees, what was left of a tilt it was caught in. The new
   * view has already turned it: its rotate property, which leaves its own
   * transform (the tilt) and a move's translate and scale alone, plays the
   * difference down to nothing. It turns about its centre, where the arrows
   * end: they need not follow it.
   */
  #tilt(root: HTMLElement, id: string, exhausted: boolean, playing: number): void {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    const from = (exhausted ? -EXHAUST_DEGREES : EXHAUST_DEGREES) + playing;
    if (!element || Math.abs(from) < 0.1) {
      return;
    }
    this.#run(
      element,
      [{ rotate: `${from}deg` }, { rotate: '0deg' }],
      { duration: TILT_MS, easing: MOVE_EASING },
      cardSubject(id),
    );
  }

  /**
   * Returns what turns a stage card just chosen in from edge-on, as if put down, its own transform
   * measured when called, before the start runs: lifted, it settles flat (lifts), unless it slides
   * or settles meanwhile, which plays on the same scale property.
   */
  #turnIn(root: HTMLElement, id: string, lifts: boolean): Start {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element) {
      return START_NOTHING;
    }
    // An exhausted card's tilt turns with it.
    const own = ownTransform(element);
    return () => {
      const turned = `${FLIP_PERSPECTIVE} rotateY(90deg) scale(1.05) ${own}`.trimEnd();
      const turn = this.#run(
        element,
        [{ transform: turned }, { transform: own || 'none' }],
        { duration: TURN_IN_MS, easing: MOVE_EASING },
        cardSubject(id),
        true,
      );
      if (turn) {
        this.#turning.set(turn, id);
      }
      if (lifts) {
        this.#lift(element, 'down', { duration: TURN_IN_MS }, cardSubject(id));
      }
    };
  }

  /**
   * Turns a card over around its vertical axis: a copy of its old side turns
   * away to edge-on, then the card, drawn with its new side, turns back flat.
   * Without an old side (a hidden card come onto the table, or one taken face
   * down into the hand), only the second half plays. An exhausted card keeps
   * its tilt; a hand card keeps its place. A table card is lifted as it turns,
   * highest edge-on (lifts), unless it slides or settles meanwhile, which
   * plays on the same scale property. Its own transform is measured when
   * called, before the start runs; the start returned turns it. A hand
   * card's turn and its slot on the fan (its --x transition) share the
   * transform property: should its --x change while it turns, the turn
   * holds its old place until it ends. A card taken face down into the
   * hand is a new element there: this does not happen in the usual case.
   */
  #flip(root: HTMLElement, id: string, oldSide: HTMLElement | undefined, lifts: boolean): Start {
    const onTable = root.querySelector<HTMLElement>(tableCard(id));
    const element = onTable ?? root.querySelector<HTMLElement>(handCard(id));
    if (!element || typeof element.animate !== 'function') {
      return START_NOTHING;
    }
    const own = ownTransform(element);
    return () => {
      // A table card's tilt turns with it; a hand card turns about its middle (its transform-origin).
      const turned = (angle: string) => `${FLIP_PERSPECTIVE} rotateY(${angle}) ${own}`.trimEnd();
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
        if (onTable && lifts) {
          this.#lift(oldSide, 'up', { duration: half, fill: 'forwards' }, cardSubject(id));
        }
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
      const turn = this.#run(
        element,
        keyframes,
        { duration: oldSide ? FLIP_MS : half },
        cardSubject(id),
      );
      if (turn && onTable) {
        this.#turning.set(turn, id);
      }
      if (onTable && lifts) {
        const lift = oldSide ? 'upAndDown' : 'down';
        this.#lift(element, lift, { duration: oldSide ? FLIP_MS : half }, cardSubject(id));
      }
    };
  }

  /**
   * Lifts a table card off the table, or sets it back down, as it turns: its scale and its
   * shade's offset (LIFT_SCALE, LIFT_SHADE), apart from the transform the turn plays on. Rising, it
   * eases out; coming down, it eases in, put down.
   */
  #lift(
    element: HTMLElement,
    lift: Lift,
    options: KeyframeAnimationOptions,
    subject: Subject,
  ): void {
    this.#run(element, liftFrames('scale', lift), options, subject);
    const shade = element.querySelector<HTMLElement>(':scope > .shade');
    if (shade) {
      this.#run(shade, liftFrames('translate', lift), options, subject);
    }
  }

  /**
   * Settles the viewer's own drop on the table, from its ghost held up where it was let go: it
   * comes down from its lift, dipping a little below its size before it rests, its shadow back
   * under it, and upright from the angle its ghost swayed to (swayed, in degrees). No other
   * animation plays on a card just dropped on the table: it already lies where it went.
   */
  #settle(root: HTMLElement, id: string, swayed: number): void {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element) {
      return;
    }
    const subject = cardSubject(id);
    const options = { duration: SETTLE_MS };
    this.#run(
      element,
      [
        { scale: `${LIFT_SCALE}`, easing: 'ease-in' },
        { scale: `${SETTLE_DIP}`, offset: SETTLE_DIPS_AT, easing: 'ease-out' },
        { scale: '1' },
      ],
      options,
      subject,
    );
    const shade = element.querySelector<HTMLElement>(':scope > .shade');
    if (shade) {
      this.#run(
        shade,
        [
          { translate: LIFT_SHADE, easing: 'ease-in' },
          { translate: '0px 0px', offset: SETTLE_DIPS_AT },
          { translate: '0px 0px' },
        ],
        options,
        subject,
      );
    }
    if (Math.abs(swayed) >= 0.1) {
      this.#run(
        element,
        [{ rotate: `${swayed}deg` }, { rotate: '0deg' }],
        { ...options, easing: 'ease-out' },
        subject,
      );
    }
  }

  /**
   * Measures the viewer's own drop in dock mode in its slot, and returns what lands it there from
   * its ghost, held up where it was let go (from): it slides to its slot (MOVE_MS), coming upright
   * from the angle its ghost swayed to (lean, in degrees), and half way through the slide
   * (LAND_SETTLES_AT) it starts to settle as #settle does. It plays even onto a slot under its
   * ghost, where only the settle shows. The start returns the slide, which the arrows follow.
   */
  #slideAndSettle(
    root: HTMLElement,
    id: string,
    from: Measured | undefined,
    zoom: number,
    lean: number,
  ): Start<Animation | null> {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element || !from) {
      return () => null;
    }
    const placed = placedAt(element, zoom);
    const shade = element.querySelector<HTMLElement>(':scope > .shade');
    return () => {
      const { dx, dy, size } = wayFrom(placed, from);
      const settleMs = MOVE_MS * LAND_SETTLES_AT;
      const duration = settleMs + SETTLE_MS;
      const slid = MOVE_MS / duration;
      const settles = settleMs / duration;
      const dips = settles + (SETTLE_DIPS_AT * SETTLE_MS) / duration;
      const subject = cardSubject(id);
      const options = { duration };
      // One property per animation, each keyframe's easing playing from it to the next one.
      const slide = this.#run(
        element,
        [
          { translate: `${dx}px ${dy}px`, easing: MOVE_EASING },
          { translate: '0px 0px', offset: slid },
          { translate: '0px 0px' },
        ],
        options,
        subject,
        true,
      );
      this.#run(
        element,
        [
          { scale: `${size}` },
          { scale: `${size}`, offset: settles, easing: 'ease-in' },
          { scale: `${SETTLE_DIP}`, offset: dips, easing: 'ease-out' },
          { scale: '1' },
        ],
        options,
        subject,
      );
      if (shade) {
        this.#run(
          shade,
          [
            { translate: LIFT_SHADE },
            { translate: LIFT_SHADE, offset: settles, easing: 'ease-in' },
            { translate: '0px 0px', offset: dips },
            { translate: '0px 0px' },
          ],
          options,
          subject,
        );
      }
      if (Math.abs(lean) >= 0.1) {
        this.#run(
          element,
          [
            { rotate: `${lean}deg`, easing: 'ease-out' },
            { rotate: '0deg', offset: slid },
            { rotate: '0deg' },
          ],
          options,
          subject,
        );
      }
      return slide;
    };
  }

  /**
   * The new top card of a side deck turns face up on its pile, as a hidden
   * card come onto the table does: the second half of a flip, from edge-on.
   */
  #reveal(root: HTMLElement, id: string): Animation | null {
    const art = root.querySelector<HTMLElement>(`${tablePile(id)} .art`);
    if (!art) {
      return null;
    }
    return this.#run(
      art,
      [
        { transform: `${FLIP_PERSPECTIVE} rotateY(90deg)` },
        { transform: `${FLIP_PERSPECTIVE} rotateY(0deg)` },
      ],
      { duration: FLIP_MS / 2 },
      pileSubject(id),
    );
  }

  /** Reads the player's colour, and returns what flashes it around the card. */
  #glow(root: HTMLElement, id: string, color: number): Start {
    const element = root.querySelector<HTMLElement>(tableCard(id));
    if (!element) {
      return START_NOTHING;
    }
    const glow = playerColor(color);
    return () => {
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
    };
  }

  /**
   * A riffle: copies of the pile split left and right, then
   * riffle back into it, after delay (ms): once the cards flying into it land.
   * Returns the animations it plays.
   */
  #riffle(root: HTMLElement, id: string, delay: number): Animation[] {
    const pile = root.querySelector<HTMLElement>(tablePile(id));
    const art = pile?.querySelector('.art');
    if (!pile || !art || typeof pile.animate !== 'function') {
      return [];
    }
    const animations: Animation[] = [];
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
      const reach = 21 + Math.floor(i / 2) * 8;
      const animation = this.#run(
        copy,
        [
          { transform: 'translate(0, 0) rotate(0deg)', visibility: 'visible' },
          {
            transform: `translate(${side * reach}px, ${-3 - i}px) rotate(${side * (6 + i * 2)}deg)`,
            offset: 0.45,
          },
          { transform: `translate(${side * 3}px, -2px) rotate(${side * 2}deg)`, offset: 0.8 },
          { transform: 'translate(0, 0) rotate(0deg)', visibility: 'visible' },
        ],
        { duration: RIFFLE_MS, delay: delay + i * RIFFLE_STAGGER_MS, easing: RIFFLE_EASING },
        pileSubject(id),
      );
      const remove = () => {
        copy.remove();
        this.#copies.delete(copy);
      };
      if (animation) {
        animation.finished.then(remove, remove);
        animations.push(animation);
      }
    }
    // The copies live in the pile's stacking context, so the pile itself rises over its neighbours (all at
    // level 0) while they fan out, then drops back to its stylesheet level.
    const rise = this.#run(
      pile,
      [{ zIndex: 1 }, { zIndex: 1 }],
      { duration: RIFFLE_SPAN_MS, delay },
      pileSubject(id),
    );
    const bounce = this.#run(
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
    for (const animation of [rise, bounce]) {
      if (animation) {
        animations.push(animation);
      }
    }
    return animations;
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
      fades: pile.matches(PILE_CHIP),
      delay: 0,
    };
  }

  /**
   * A drawn card's copy, from its pile to its slot in the hand: in dock mode, the hand sheet's
   * carousel, drawn over the sheet, or the sheet's hand size when that slot lies out of sight. With
   * no hand showing it, it flies to the dock in dock mode
   * (#dockFlight); else, or with nothing there to land on, it leaves the pile as another player's
   * draw does.
   */
  #drawFlight(
    root: HTMLElement,
    anim: Extract<Anim, { kind: 'draw' }>,
    from: Measured,
    card: CardView,
    piles: ReadonlyMap<string, PileView>,
    after: TableView | undefined,
    zoom: number,
  ): Flight {
    // In dock mode the hand card is the hand sheet's, which shows it no more as it slides away.
    const element = root.matches('.dock-mode')
      ? shownElement(root, handCard(anim.id))
      : root.querySelector<HTMLElement>(handCard(anim.id));
    if (!element) {
      return (
        this.#dockFlight(
          root,
          { card, pile: anim.fromPile, from, faceUp: anim.faceUp },
          after,
          zoom,
        ) ?? this.#awayFlight(anim.fromPile, from, anim.faceUp ? card : undefined, piles)
      );
    }
    const copy = {
      kind: 'draw' as const,
      key: ++this.#nextKey,
      card,
      faceUp: anim.faceUp,
      pile: anim.fromPile,
      from,
      overSheet: element.closest('.sheet') !== null,
      delay: 0,
    };
    // Into a carousel slot out of sight, it would fly off the screen over the sheet.
    const intoCount =
      root.matches('.dock-mode') && outOfCarousel(element) ? sheetCountLanding(element) : null;
    if (intoCount) {
      return { ...copy, ...intoCount, angle: 0 };
    }
    const { slot, angle } = measureSlot(element);
    return { ...copy, to: slot, angle, dock: null };
  }

  /**
   * In dock mode, a copy of a card come into the viewer's hand, out of its pile or off the table
   * (no pile), flying to where the dock or the hero selector shows its hand (dockLanding); null out
   * of dock mode, or with nothing there to land on.
   */
  #dockFlight(
    root: HTMLElement,
    copy: Pick<DrawFlight, 'card' | 'pile' | 'from' | 'faceUp'>,
    after: TableView | undefined,
    zoom: number,
  ): DrawFlight | null {
    if (!root.matches('.dock-mode')) {
      return null;
    }
    const seat = handSeatOf(after, copy.card.id);
    if (seat === null) {
      return null;
    }
    const landing = dockLanding(root, copy.card.id, seat, zoom);
    if (!landing) {
      return null;
    }
    return { kind: 'draw', key: ++this.#nextKey, ...copy, ...landing, angle: 0, delay: 0 };
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

  /**
   * The copy reached where it went: its card shows there from now on. On the dock or a hero
   * selector entry, the avatar it landed on pulses.
   */
  #land(flight: Flight): void {
    // stop() has already cleared away a flight it cancelled.
    if (!this.flights.some((f) => f.key === flight.key)) {
      return;
    }
    this.flights = this.flights.filter((f) => f.key !== flight.key);
    this.#release([flight]);
    const pulse = flight.kind === 'draw' ? flight.dock?.pulse : undefined;
    if (pulse?.isConnected) {
      this.#run(pulse, PULSE_FRAMES, { duration: PULSE_MS, easing: 'ease-out' }, null);
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
      this.#cardsMoving = true;
      this.#countFrames();
    }
    const done = () => {
      this.#running.delete(animation);
      this.#moving.delete(animation);
      this.#turning.delete(animation);
      this.#cardsMoving = this.#moving.size > 0;
    };
    animation.finished.then(done, done);
    return animation;
  }

  /**
   * Counts frames until the last moving card has stopped, one frame past it, while an effect reads
   * them (#followFrames).
   */
  #countFrames(): void {
    if (this.#raf !== 0 || !this.#framesFollowed || this.#moving.size === 0) {
      return;
    }
    const step = () => {
      this.#frame += 1;
      this.#raf = this.#moving.size > 0 ? requestAnimationFrame(step) : 0;
    };
    this.#raf = requestAnimationFrame(step);
  }
}

export const motion = new TableMotion();
