// Table zoom: a per-viewer display setting. Card positions stay in table
// units; the screen shows them multiplied by the zoom. Until the viewer
// chooses a zoom, a phone fits the table's content to its width (fitZoom);
// a wider screen shows it at 100 %.

import { getPref, removePref, setPref } from '../lib/prefs';

const ZOOM_KEY = 'itf-zoom';

export const ZOOM_MIN = 0.5;
/** A phone (600 px wide or less) zooms further out, so that more of a row fits across it. */
export const ZOOM_MIN_SMALL = 0.3;
export const ZOOM_MAX = 2;
// Ten steps of 10 % per 100 %.
const STEPS_PER_UNIT = 10;
export const ZOOM_STEP = 1 / STEPS_PER_UNIT;

/** Keeps a zoom within `min`–200 %, on a 10 % step. */
export function clampZoom(zoom: number, min: number = ZOOM_MIN): number {
  const clamped = Math.min(ZOOM_MAX, Math.max(min, zoom));
  // Rounding also absorbs float drift such as 0.7 - 0.1 = 0.6000000000000001.
  return Math.round(clamped * STEPS_PER_UNIT) / STEPS_PER_UNIT;
}

/**
 * The zoom the viewer chose, null when they never did (or no valid one is
 * stored). Kept within the lowest minimum of any screen: the table clamps it
 * to its own.
 */
export function storedZoom(): number | null {
  const stored = Number.parseFloat(getPref(ZOOM_KEY) ?? '');
  return Number.isFinite(stored) ? clampZoom(stored, ZOOM_MIN_SMALL) : null;
}

export function saveZoom(zoom: number): void {
  setPref(ZOOM_KEY, String(zoom));
}

/** Forgets the viewer's zoom: the table shows the screen's default zoom again. */
export function forgetZoom(): void {
  removePref(ZOOM_KEY);
}

/**
 * The zoom that brings `content` table units across `room` px, never above
 * 100 % nor below `min`. Rounded down to a whole percent, so that the label
 * tells it exactly and the content still fits. 100 % while either is unknown
 * (nothing measured yet, an empty table).
 */
export function fitZoom(content: number, room: number, min: number): number {
  if (content <= 0 || room <= 0) {
    return 1;
  }
  const fit = Math.floor((room / content) * 100) / 100;
  return Math.min(1, Math.max(min, fit));
}
