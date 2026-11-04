// The sway of a dragged card (DragLayer.svelte): it leans with the pointer's horizontal speed, as a
// card held by its top swings behind the hand, through a spring that brings it back upright once the
// pointer rests. Angles are in degrees, clockwise (the CSS rotate property): moving right leans it
// right. Times are in ms, all from the same clock (performance.now()).

/** The most a dragged card leans either way. */
export const MAX_SWAY_DEG = 6;
/** The lean the pointer's speed asks for, per px/s: the card leans all the way at 500 px/s. */
const DEG_PER_PX_S = 0.012;
/** The spring, slightly underdamped: a card stopping short wobbles once, faintly, then rests. */
const STIFFNESS = 300;
const DAMPING = 22;
/** The longest step one frame integrates: after a stall (a hidden tab), the spring does not leap. */
const MAX_STEP_MS = 32;
/** The pointer's speed follows its moves smoothed over about this time: one jerky move barely shows. */
const SPEED_SMOOTHING_MS = 50;
/** No move for this long: the pointer rests, and its speed dies away over about REST_DECAY_MS. */
const REST_AFTER_MS = 50;
const REST_DECAY_MS = 60;
/** Below these, the card is upright and still: the spring is at rest. */
const REST_DEG = 0.01;
const REST_DEG_S = 0.05;
const REST_PX_S = 1;

/** The lean a pointer moving at that horizontal speed (px/s) asks for, within MAX_SWAY_DEG. */
export function swayTarget(speed: number): number {
  return withinSway(speed * DEG_PER_PX_S);
}

function withinSway(angle: number): number {
  return Math.max(-MAX_SWAY_DEG, Math.min(MAX_SWAY_DEG, angle));
}

/** The spring's state: its angle and how fast it turns, in degrees per second. */
export interface Spring {
  angle: number;
  spin: number;
}

/**
 * The spring pulled towards target for dt ms (at most MAX_STEP_MS), with semi-implicit Euler: the
 * spin first, then the angle from the new spin, which stays stable at frame steps.
 */
export function stepSpring(spring: Spring, target: number, dt: number): Spring {
  const seconds = Math.min(Math.max(dt, 0), MAX_STEP_MS) / 1000;
  const pull = STIFFNESS * (target - spring.angle) - DAMPING * spring.spin;
  const spin = spring.spin + pull * seconds;
  return { angle: spring.angle + spin * seconds, spin };
}

/** A dragged card's sway: fed the pointer's moves, stepped once per frame. */
export class Sway {
  #spring: Spring = { angle: 0, spin: 0 };
  /** The pointer's horizontal speed, smoothed, in px/s. */
  #speed = 0;
  /** The last move counted. */
  #pointer: { x: number; at: number } | null = null;
  /** The time of the last frame. */
  #frame: number | null = null;

  /** Upright, still, and asked for no lean: nothing changes until the pointer moves again. */
  get resting(): boolean {
    return (
      Math.abs(this.#spring.angle) < REST_DEG &&
      Math.abs(this.#spring.spin) < REST_DEG_S &&
      Math.abs(this.#speed) < REST_PX_S
    );
  }

  /** Upright and still, for a new drag. */
  reset(): void {
    this.#spring = { angle: 0, spin: 0 };
    this.#speed = 0;
    this.#pointer = null;
    this.#frame = null;
  }

  /** The pointer moved to x (px) at that time. */
  moved(x: number, at: number): void {
    const last = this.#pointer;
    if (last === null) {
      this.#pointer = { x, at };
      return;
    }
    const dt = at - last.at;
    // Moves reported at the same time count with the next one, over the time between them.
    if (dt < 1) {
      return;
    }
    const measured = ((x - last.x) / dt) * 1000;
    this.#speed += (measured - this.#speed) * (1 - Math.exp(-dt / SPEED_SMOOTHING_MS));
    this.#pointer = { x, at };
  }

  /**
   * Steps the spring to that time, the time of a frame, and returns the lean. The spring may
   * overshoot a full lean a little: the card never leans past MAX_SWAY_DEG.
   */
  step(at: number): number {
    const dt = this.#frame === null ? 0 : at - this.#frame;
    this.#frame = at;
    if (this.#pointer === null || at - this.#pointer.at > REST_AFTER_MS) {
      this.#speed *= Math.exp(-Math.max(dt, 0) / REST_DECAY_MS);
    }
    this.#spring = stepSpring(this.#spring, swayTarget(this.#speed), dt);
    if (this.resting) {
      this.#spring = { angle: 0, spin: 0 };
      this.#speed = 0;
    }
    return withinSway(this.#spring.angle);
  }
}
