import { describe, expect, it } from 'vitest';
import { doubleTapZoom, holdPhase, isDoubleTap, pinchZoom } from './gestures';

describe('holdPhase', () => {
  it('waits while the press is short and still', () => {
    expect(holdPhase(100, 3)).toBe('waiting');
  });

  it('arms once the press lasted HOLD_MS', () => {
    expect(holdPhase(300, 4)).toBe('armed');
  });

  it('scrolls when the finger moved past HOLD_SLOP before arming', () => {
    expect(holdPhase(120, 11)).toBe('scroll');
  });

  it('still waits at exactly HOLD_SLOP just before HOLD_MS', () => {
    expect(holdPhase(299, 10)).toBe('waiting');
  });

  it('arms at exactly HOLD_MS and HOLD_SLOP', () => {
    expect(holdPhase(300, 10)).toBe('armed');
  });

  it('scrolls just past HOLD_SLOP just before HOLD_MS', () => {
    expect(holdPhase(299, 10.01)).toBe('scroll');
  });
});

describe('isDoubleTap', () => {
  it('accepts a second tap soon and close', () => {
    expect(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 250, x: 20, y: 18 })).toBe(true);
  });

  it('rejects a second tap after DOUBLE_TAP_MS', () => {
    expect(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 301, x: 10, y: 10 })).toBe(false);
  });

  it('rejects a second tap farther than DOUBLE_TAP_SLOP', () => {
    expect(isDoubleTap({ t: 0, x: 0, y: 0 }, { t: 100, x: 31, y: 0 })).toBe(false);
  });

  it('rejects a first tap', () => {
    expect(isDoubleTap(null, { t: 0, x: 0, y: 0 })).toBe(false);
  });
});

describe('doubleTapZoom', () => {
  it('goes from the readable zoom to the close-up zoom', () => {
    expect(doubleTapZoom(1)).toBe(1.5);
  });

  it('goes from the close-up zoom back to the readable zoom', () => {
    expect(doubleTapZoom(1.5)).toBe(1);
  });

  it('goes to the close-up zoom from any other zoom', () => {
    expect(doubleTapZoom(0.6)).toBe(1.5);
  });

  it('goes back to the readable zoom within 5 % of the close-up zoom', () => {
    expect(doubleTapZoom(1.45)).toBe(1);
  });
});

describe('pinchZoom', () => {
  it('zooms in as the fingers spread', () => {
    expect(pinchZoom(0.5, 100, 200)).toBe(1);
  });

  it('zooms out as the fingers close', () => {
    expect(pinchZoom(1, 200, 100)).toBe(0.5);
  });

  it('keeps the start zoom when the fingers started together', () => {
    expect(pinchZoom(0.8, 0, 50)).toBe(0.8);
  });
});
