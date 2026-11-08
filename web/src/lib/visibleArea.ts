// The part of the window the user sees. A phone's or a tablet's on-screen keyboard shrinks only the
// visual viewport, on iOS Safari as on Android Chrome: 100dvh, a fixed layer with inset: 0 and
// window.innerHeight keep the full height, and run under the keyboard. What must stay in sight
// above it (the dialogs, the lobby's Add a set menu) follows the visual viewport instead.

import type { Rect } from './rect';

// How long the window's scroll offset is put back after a text field loses the focus: the keyboard
// closes meanwhile, and iOS may scroll the window again as it does.
const RESTORE_MS = 1000;

// Input types that take text, and so bring up the keyboard.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** The part of the window the user sees, in the window's (layout viewport) coordinates. */
export function visibleRect(): Rect {
  const viewport = window.visualViewport;
  if (!viewport) {
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  }
  return {
    left: viewport.offsetLeft,
    top: viewport.offsetTop,
    right: viewport.offsetLeft + viewport.width,
    bottom: viewport.offsetTop + viewport.height,
  };
}

/** The part of a room the user sees: empty, never inverted, when none of it is. */
export function withinVisible(room: Rect): Rect {
  const visible = visibleRect();
  const left = Math.max(room.left, visible.left);
  const top = Math.max(room.top, visible.top);
  return {
    left,
    top,
    right: Math.max(left, Math.min(room.right, visible.right)),
    bottom: Math.max(top, Math.min(room.bottom, visible.bottom)),
  };
}

/**
 * Calls the listener whenever the part of the window the user sees changes: a keyboard shows or
 * hides, a pinch zoom, a pan. Returns the function that stops it.
 */
export function onVisibleAreaChange(listener: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => {};
  }
  viewport.addEventListener('resize', listener);
  viewport.addEventListener('scroll', listener);
  return () => {
    viewport.removeEventListener('resize', listener);
    viewport.removeEventListener('scroll', listener);
  };
}

/** Whether the element brings up the keyboard when it has the focus. */
function isTextField(element: EventTarget | null): boolean {
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly;
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/** Whether the page is kept from scrolling: the table, or any page under a dialog. */
function pageCannotScroll(): boolean {
  const classes = document.documentElement.classList;
  return classes.contains('fixed-screen') || classes.contains('scroll-locked');
}

/**
 * Writes where the visual viewport is for the stylesheets, as --visible-top and --visible-height
 * on the root element. They are left out while the page is pinch-zoomed: the fixed layers then
 * keep the whole window, rather than shrink into the zoomed part.
 */
function writeVisibleVars(viewport: VisualViewport): void {
  const style = document.documentElement.style;
  if (Math.abs(viewport.scale - 1) > 0.01) {
    style.removeProperty('--visible-top');
    style.removeProperty('--visible-height');
    return;
  }
  style.setProperty('--visible-top', `${viewport.offsetTop}px`);
  style.setProperty('--visible-height', `${viewport.height}px`);
}

/**
 * Puts back the window's scroll offset that iOS leaves on a page that cannot scroll. To bring a
 * focused text field above the keyboard, iOS scrolls the window even under overflow: hidden, and
 * leaves it scrolled once the keyboard is gone: the whole page stays shifted. The offset is noted
 * as a text field takes the focus, the first one while the focus goes from field to field, and put
 * back when the focus leaves the text fields, then again as the keyboard closes. A page that
 * scrolls on its own is left alone. Returns the function that stops it.
 */
function restoreScrollAfterKeyboard(viewport: VisualViewport | undefined): () => void {
  let saved: { x: number; y: number } | null = null;
  let forgetTimer: ReturnType<typeof setTimeout> | undefined;

  function restore(): void {
    if (saved !== null && (window.scrollX !== saved.x || window.scrollY !== saved.y)) {
      window.scrollTo(saved.x, saved.y);
    }
  }

  function leaveTextFields(): void {
    if (saved === null || forgetTimer !== undefined) {
      return;
    }
    restore();
    forgetTimer = setTimeout(() => {
      saved = null;
      forgetTimer = undefined;
    }, RESTORE_MS);
  }

  function onFocusIn(event: FocusEvent): void {
    if (!isTextField(event.target)) {
      // A focused field that is removed (its dialog closed) fires no focusout in some browsers.
      leaveTextFields();
      return;
    }
    // Back in a field while the keyboard closes: it shows again, and the first offset still holds.
    clearTimeout(forgetTimer);
    forgetTimer = undefined;
    if (saved === null && pageCannotScroll()) {
      saved = { x: window.scrollX, y: window.scrollY };
    }
  }

  function onFocusOut(event: FocusEvent): void {
    if (!isTextField(event.relatedTarget)) {
      leaveTextFields();
    }
  }

  function onViewportResize(): void {
    if (forgetTimer !== undefined) {
      restore();
    }
  }

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  viewport?.addEventListener('resize', onViewportResize);
  return () => {
    clearTimeout(forgetTimer);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    viewport?.removeEventListener('resize', onViewportResize);
  };
}

/**
 * Keeps the page in step with the part of the window the user sees, for the page's whole life:
 * the stylesheets' --visible-top and --visible-height, and the scroll offset iOS leaves behind a
 * closed keyboard. Returns the function that undoes it.
 */
export function installVisibleArea(): () => void {
  const viewport = window.visualViewport ?? undefined;
  let stopVars = (): void => {};
  if (viewport) {
    const write = (): void => writeVisibleVars(viewport);
    write();
    stopVars = onVisibleAreaChange(write);
  }
  const stopRestore = restoreScrollAfterKeyboard(viewport);
  return () => {
    stopVars();
    stopRestore();
    document.documentElement.style.removeProperty('--visible-top');
    document.documentElement.style.removeProperty('--visible-height');
  };
}
