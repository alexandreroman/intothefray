// Table zoom: a per-viewer display setting. Card positions stay in table
// units; the screen shows them multiplied by the zoom.

import { getPref, setPref } from '../lib/prefs';

const ZOOM_KEY = 'itf-zoom';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
// Ten steps of 10 % per 100 %.
const STEPS_PER_UNIT = 10;
export const ZOOM_STEP = 1 / STEPS_PER_UNIT;

/** Keeps a zoom within 50–200 %, on a 10 % step. */
export function clampZoom(zoom: number): number {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  // Rounding also absorbs float drift such as 0.7 - 0.1 = 0.6000000000000001.
  return Math.round(clamped * STEPS_PER_UNIT) / STEPS_PER_UNIT;
}

/** The stored zoom, 1 when none (or no valid one) is stored. */
export function storedZoom(): number {
  const stored = Number.parseFloat(getPref(ZOOM_KEY) ?? '');
  return Number.isFinite(stored) ? clampZoom(stored) : 1;
}

export function saveZoom(zoom: number): void {
  setPref(ZOOM_KEY, String(zoom));
}
