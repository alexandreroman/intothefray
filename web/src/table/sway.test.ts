import { MAX_SWAY_DEG, stepSpring, Sway, swayTarget, type Spring } from './sway';

/** Steps the sway at 60 frames a second from `from` (ms) for `ms`, returning the angles. */
function frames(sway: Sway, from: number, ms: number): number[] {
  const angles: number[] = [];
  for (let at = from; at <= from + ms; at += 16) {
    angles.push(sway.step(at));
  }
  return angles;
}

/** Drags the pointer at that speed (px/s) from 0 ms for `ms`, a move and a frame every 16 ms. */
function drag(sway: Sway, speed: number, ms: number): number[] {
  const angles: number[] = [];
  for (let at = 0; at <= ms; at += 16) {
    sway.moved((speed * at) / 1000, at);
    angles.push(sway.step(at));
  }
  return angles;
}

describe('swayTarget', () => {
  it('leans with the speed, clockwise to the right, within the limit', () => {
    expect(swayTarget(0)).toBe(0);
    expect(swayTarget(250)).toBeCloseTo(3);
    expect(swayTarget(-250)).toBeCloseTo(-3);
    expect(swayTarget(5000)).toBe(MAX_SWAY_DEG);
    expect(swayTarget(-5000)).toBe(-MAX_SWAY_DEG);
  });
});

describe('stepSpring', () => {
  it('reaches its target, overshooting it a little on the way', () => {
    let spring: Spring = { angle: 0, spin: 0 };
    let highest = 0;
    for (let i = 0; i < 120; i++) {
      spring = stepSpring(spring, 4, 16);
      highest = Math.max(highest, spring.angle);
    }
    expect(spring.angle).toBeCloseTo(4, 2);
    expect(highest).toBeGreaterThan(4);
    expect(highest).toBeLessThan(5);
  });

  it('takes no leap over a long gap between frames', () => {
    const after = stepSpring({ angle: 0, spin: 0 }, 6, 5000);
    expect(after).toEqual(stepSpring({ angle: 0, spin: 0 }, 6, 32));
  });

  it('stays put over no time', () => {
    expect(stepSpring({ angle: 2, spin: 0 }, 6, -10)).toEqual({ angle: 2, spin: 0 });
  });
});

describe('Sway', () => {
  it('rests upright before the pointer moves', () => {
    const sway = new Sway();
    expect(frames(sway, 0, 200).every((angle) => angle === 0)).toBe(true);
    expect(sway.resting).toBe(true);
  });

  it('leans right as the pointer moves right, left as it moves left', () => {
    expect(drag(new Sway(), 300, 400).at(-1)).toBeGreaterThan(2);
    expect(drag(new Sway(), -300, 400).at(-1)).toBeLessThan(-2);
  });

  it('never leans past the limit, however fast the pointer', () => {
    const angles = drag(new Sway(), 20000, 600);
    expect(Math.max(...angles)).toBeLessThanOrEqual(MAX_SWAY_DEG);
    expect(angles.at(-1)).toBeCloseTo(MAX_SWAY_DEG, 0);
  });

  it('comes back upright and rests once the pointer stops', () => {
    const sway = new Sway();
    drag(sway, 400, 300);
    expect(sway.resting).toBe(false);

    // No move from 300 ms on: the speed dies away, the spring settles.
    const angles = frames(sway, 316, 1500);
    expect(angles.at(-1)).toBe(0);
    expect(sway.resting).toBe(true);
  });

  it('counts moves reported at the same time with the next one', () => {
    const sway = new Sway();
    sway.moved(0, 0);
    sway.moved(5, 16);
    sway.moved(10, 16);
    sway.moved(15, 32);
    const lean = sway.step(32);
    const steady = new Sway();
    steady.moved(0, 0);
    steady.moved(5, 16);
    steady.moved(15, 32);
    expect(lean).toBe(steady.step(32));
  });

  it('starts over upright after a reset', () => {
    const sway = new Sway();
    drag(sway, 400, 300);
    sway.reset();
    expect(sway.resting).toBe(true);
    expect(sway.step(1000)).toBe(0);
  });
});
