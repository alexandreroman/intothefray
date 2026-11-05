import { touchZoom, type TouchZoomOptions } from './touchZoom';

type Point = { x: number; y: number };

/** Options with a zoom and a fit zoom, a spy for setZoom, and every spot empty unless told otherwise. */
function options(overrides: Partial<TouchZoomOptions> = {}): TouchZoomOptions {
  return {
    enabled: () => true,
    zoom: () => 0.5,
    fit: () => 0.5,
    setZoom: vi.fn(),
    isEmptySpot: () => true,
    ...overrides,
  };
}

/** Attaches the touch zoom to a new scroller and returns it, with the attachment's teardown. */
function attach(opts: TouchZoomOptions): { scroller: HTMLElement; detach: () => void } {
  const scroller = document.createElement('div');
  document.body.append(scroller);
  const cleanup = touchZoom(opts)(scroller);
  return {
    scroller,
    detach: () => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    },
  };
}

/**
 * Dispatches a touch event on `target`. jsdom has no Touch, so the touch lists are plain arrays of points
 * with client coordinates; `changed` defaults to `touches`, and `t` is the event's time stamp.
 */
function touch(
  target: EventTarget,
  type: string,
  touches: Point[],
  t = 0,
  changed: Point[] = touches,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const toList = (points: Point[]) => points.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(event, 'touches', { value: toList(touches) });
  Object.defineProperty(event, 'changedTouches', { value: toList(changed) });
  Object.defineProperty(event, 'timeStamp', { value: t });
  target.dispatchEvent(event);
  return event;
}

/** A one-finger tap at `p`, down at `t` and up 50 ms later; returns the touchend. */
function tap(target: EventTarget, p: Point, t: number): Event {
  touch(target, 'touchstart', [p], t);
  return touch(target, 'touchend', [], t + 50, [p]);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('touchZoom pinch', () => {
  it('zooms by the ratio of the finger distances, around their midpoint', () => {
    const opts = options({ zoom: () => 0.5 });
    const { scroller } = attach(opts);

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller, 'touchmove', [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]);

    expect(opts.setZoom).toHaveBeenCalledWith(1, 150, 100);
  });

  it('prevents the scroll of a two-finger move (pinch_prevents_scroll)', () => {
    const { scroller } = attach(options());

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    const move = touch(scroller, 'touchmove', [
      { x: 90, y: 100 },
      { x: 210, y: 100 },
    ]);

    expect(move.defaultPrevented).toBe(true);
  });

  it('prevents the touchstart of a second finger, so no native pan starts before the pinch', () => {
    const { scroller } = attach(options());

    const first = touch(scroller, 'touchstart', [{ x: 100, y: 100 }]);
    const second = touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);

    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(true);
  });

  it('pans the scroller with the midpoint of the fingers', () => {
    const { scroller } = attach(options());
    scroller.scrollLeft = 300;
    scroller.scrollTop = 300;

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    // The midpoint moves 20 px right and 10 px up: the table follows the fingers.
    touch(scroller, 'touchmove', [
      { x: 120, y: 90 },
      { x: 220, y: 90 },
    ]);

    expect(scroller.scrollLeft).toBe(280);
    expect(scroller.scrollTop).toBe(310);
  });

  it('leaves a one-finger move alone (one_finger_untouched)', () => {
    const opts = options();
    const { scroller } = attach(opts);

    touch(scroller, 'touchstart', [{ x: 100, y: 100 }]);
    const move = touch(scroller, 'touchmove', [{ x: 160, y: 100 }]);

    expect(move.defaultPrevented).toBe(false);
    expect(opts.setZoom).not.toHaveBeenCalled();
  });

  it('does not take the finger left after a pinch for a tap', () => {
    const opts = options();
    const { scroller } = attach(opts);

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    touch(scroller, 'touchend', [{ x: 100, y: 100 }], 100, [{ x: 200, y: 100 }]);
    touch(scroller, 'touchend', [], 150, [{ x: 100, y: 100 }]);
    tap(scroller, { x: 100, y: 100 }, 200);

    expect(opts.setZoom).not.toHaveBeenCalled();
  });
});

describe('touchZoom double tap', () => {
  it('toggles the zoom around the tapped point on an empty spot', () => {
    const opts = options({ zoom: () => 0.53, fit: () => 0.53 });
    const { scroller } = attach(opts);

    tap(scroller, { x: 10, y: 10 }, 0);
    const second = tap(scroller, { x: 20, y: 18 }, 200);

    expect(opts.setZoom).toHaveBeenCalledExactlyOnceWith(1, 20, 18);
    expect(second.defaultPrevented).toBe(true);
  });

  it('ignores taps on a card (double_tap_on_card_ignored)', () => {
    const opts = options({ isEmptySpot: () => false });
    const { scroller } = attach(opts);

    tap(scroller, { x: 10, y: 10 }, 0);
    const second = tap(scroller, { x: 10, y: 10 }, 200);

    expect(opts.setZoom).not.toHaveBeenCalled();
    expect(second.defaultPrevented).toBe(false);
  });

  it('asks the empty spot check about the touched element', () => {
    const isEmptySpot = vi.fn(() => true);
    const { scroller } = attach(options({ isEmptySpot }));
    const card = document.createElement('div');
    scroller.append(card);

    tap(card, { x: 10, y: 10 }, 0);

    expect(isEmptySpot).toHaveBeenCalledWith(card);
  });

  it('ignores two taps too far apart in time', () => {
    const opts = options();
    const { scroller } = attach(opts);

    tap(scroller, { x: 10, y: 10 }, 0);
    tap(scroller, { x: 10, y: 10 }, 400);

    expect(opts.setZoom).not.toHaveBeenCalled();
  });

  it('does not count a swipe as a tap', () => {
    const opts = options();
    const { scroller } = attach(opts);

    touch(scroller, 'touchstart', [{ x: 10, y: 10 }], 0);
    touch(scroller, 'touchend', [], 50, [{ x: 10, y: 60 }]);
    tap(scroller, { x: 10, y: 60 }, 150);

    expect(opts.setZoom).not.toHaveBeenCalled();
  });

  it('needs two new taps after a double tap', () => {
    const opts = options();
    const { scroller } = attach(opts);

    tap(scroller, { x: 10, y: 10 }, 0);
    tap(scroller, { x: 10, y: 10 }, 200);
    tap(scroller, { x: 10, y: 10 }, 400);

    expect(opts.setZoom).toHaveBeenCalledTimes(1);
  });
});

describe('touchZoom', () => {
  it('prevents the page zoom of iOS (gesturestart_prevented)', () => {
    const { scroller } = attach(options());

    const gesture = new Event('gesturestart', { cancelable: true });
    scroller.dispatchEvent(gesture);

    expect(gesture.defaultPrevented).toBe(true);
  });

  it('does nothing while disabled', () => {
    const opts = options({ enabled: () => false });
    const { scroller } = attach(opts);

    const start = touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    const move = touch(scroller, 'touchmove', [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]);
    tap(scroller, { x: 10, y: 10 }, 1000);
    tap(scroller, { x: 10, y: 10 }, 1200);
    const gesture = new Event('gesturestart', { cancelable: true });
    scroller.dispatchEvent(gesture);

    expect(opts.setZoom).not.toHaveBeenCalled();
    expect(start.defaultPrevented).toBe(false);
    expect(move.defaultPrevented).toBe(false);
    expect(gesture.defaultPrevented).toBe(false);
  });

  it('removes its listeners on teardown', () => {
    const opts = options();
    const { scroller, detach } = attach(opts);
    detach();

    touch(scroller, 'touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    const move = touch(scroller, 'touchmove', [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]);
    const gesture = new Event('gesturestart', { cancelable: true });
    scroller.dispatchEvent(gesture);

    expect(opts.setZoom).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
    expect(gesture.defaultPrevented).toBe(false);
  });

  it('listens without the passive flag, so it can prevent the default', () => {
    const scroller = document.createElement('div');
    const add = vi.spyOn(scroller, 'addEventListener');

    touchZoom(options())(scroller);

    for (const call of add.mock.calls) {
      expect(call[2]).toEqual({ passive: false });
    }
    expect(add.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
        'gesturestart',
      ]),
    );
  });
});
