// The page in fullscreen (the Fullscreen API, standard or WebKit-prefixed),
// and Escape in it. A browser in fullscreen takes Escape to leave it: an open
// dialog or menu then stays open. Where the Keyboard
// Lock API exists (Chromium), Escape is locked while in fullscreen: a short
// press then reaches the page, which leaves fullscreen itself unless a layer
// took the key (preventDefault), and a long press still leaves it natively.
// Firefox and Safari have no such API: Escape keeps leaving fullscreen there.

import { on } from 'svelte/events';

// iPad and older Safari only have the WebKit-prefixed Fullscreen API, whose
// calls may return nothing rather than a promise.
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

// The Keyboard Lock API, which TypeScript's DOM library does not describe.
interface KeyboardLock {
  lock?: (keyCodes?: string[]) => Promise<void>;
  unlock?: () => void;
}
type KeyboardNavigator = Navigator & { keyboard?: KeyboardLock };

function webkitDocument(): WebkitDocument {
  return document as WebkitDocument;
}

function root(): WebkitElement {
  return document.documentElement as WebkitElement;
}

function keyboard(): KeyboardLock | undefined {
  return (navigator as KeyboardNavigator).keyboard;
}

/** Whether the page can go fullscreen: iPhone Safari has neither API. */
export function canFullscreen(): boolean {
  return Boolean(root().requestFullscreen ?? root().webkitRequestFullscreen);
}

/** The element shown fullscreen, if any. */
export function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? webkitDocument().webkitFullscreenElement ?? null;
}

export function isFullscreen(): boolean {
  return fullscreenElement() !== null;
}

/** Leaves fullscreen; a refusal changes nothing. */
export function exitFullscreen(): void {
  ignoreRefusal(document.exitFullscreen?.() ?? webkitDocument().webkitExitFullscreen?.());
}

/** Shows the whole page fullscreen, or leaves fullscreen. */
export function toggleFullscreen(): void {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    ignoreRefusal(root().requestFullscreen?.() ?? root().webkitRequestFullscreen?.());
  }
}

/**
 * A request can be refused (no user gesture, a policy of the embedding page):
 * nothing changes then.
 */
function ignoreRefusal(result: Promise<void> | void): void {
  void Promise.resolve(result).catch(() => {});
}

/**
 * Locks Escape while the page is fullscreen, and leaves fullscreen on an
 * Escape that no layer took. Installed once for the page; returns what
 * uninstalls it.
 */
export function installEscapeLock(): () => void {
  // The lock is held: it resolved, and the page has not left fullscreen since.
  let locked = false;

  function syncLock(): void {
    if (!isFullscreen()) {
      locked = false;
      keyboard()?.unlock?.();
      return;
    }
    const lock = keyboard()?.lock?.(['Escape']);
    if (lock === undefined) {
      return;
    }
    // The page may have left fullscreen before the lock resolved.
    lock.then(
      () => {
        locked = isFullscreen();
      },
      () => {}, // Refused: Escape stays the browser's.
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    // An IME composition takes the Escape that ends it.
    if (event.key !== 'Escape' || event.repeat || event.isComposing || !locked) {
      return;
    }
    // Only once the event went through every listener does defaultPrevented
    // tell whether a layer closed on it. Microtasks run between listeners, so
    // a task, not a microtask, waits for that.
    setTimeout(() => {
      if (!event.defaultPrevented && isFullscreen()) {
        exitFullscreen();
      }
    }, 0);
  }

  // Older Safari only fires the WebKit-prefixed event: both are listened to.
  const offStandard = on(document, 'fullscreenchange', syncLock);
  const offWebkit = on(document, 'webkitfullscreenchange', syncLock);
  // In the capture phase: a layer that stops the event's propagation must not hide it.
  const offKeydown = on(window, 'keydown', onKeydown, { capture: true });
  return () => {
    offStandard();
    offWebkit();
    offKeydown();
    // Unconditionally: a lock still pending would otherwise outlive the install.
    locked = false;
    keyboard()?.unlock?.();
  };
}
