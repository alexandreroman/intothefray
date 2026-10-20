import { clearPrefMemory } from '../lib/prefs';
import {
  clampZoom,
  fitZoom,
  forgetZoom,
  saveZoom,
  storedZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_MIN_SMALL,
} from './zoom';

afterEach(() => {
  localStorage.clear();
  clearPrefMemory();
});

describe('clampZoom', () => {
  it('keeps a zoom within the least zoom given and 200 %, on a 10 % step', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(0.1, ZOOM_MIN_SMALL)).toBe(ZOOM_MIN_SMALL);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0.7 - 0.1)).toBe(0.6);
    expect(clampZoom(0.67, ZOOM_MIN_SMALL)).toBe(0.7);
  });
});

describe('storedZoom', () => {
  it('is null until the viewer chooses a zoom, and again once it is forgotten', () => {
    expect(storedZoom()).toBeNull();
    saveZoom(1.5);
    expect(storedZoom()).toBe(1.5);
    forgetZoom();
    expect(storedZoom()).toBeNull();
    expect(localStorage.getItem('itf-zoom')).toBeNull();
  });

  it("keeps a phone's zoom, and ignores what is no zoom", () => {
    saveZoom(0.3);
    expect(storedZoom()).toBe(0.3);
    localStorage.setItem('itf-zoom', 'fit');
    clearPrefMemory();
    expect(storedZoom()).toBeNull();
  });
});

describe('fitZoom', () => {
  it('brings the content across the room, rounded down to a whole percent', () => {
    expect(fitZoom(1640, 940, ZOOM_MIN)).toBe(0.57);
    expect(fitZoom(1640, 940, ZOOM_MIN) * 1640).toBeLessThanOrEqual(940);
  });

  it('never goes over 100 %, nor under the least zoom', () => {
    expect(fitZoom(440, 940, ZOOM_MIN)).toBe(1);
    expect(fitZoom(1640, 330, ZOOM_MIN_SMALL)).toBe(ZOOM_MIN_SMALL);
    expect(fitZoom(1640, 330, ZOOM_MIN)).toBe(ZOOM_MIN);
  });

  it('is 100 % while nothing is measured, or for an empty table', () => {
    expect(fitZoom(1640, 0, ZOOM_MIN)).toBe(1);
    expect(fitZoom(1640, -60, ZOOM_MIN)).toBe(1);
    expect(fitZoom(0, 940, ZOOM_MIN)).toBe(1);
  });
});
