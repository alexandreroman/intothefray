let openDialogs = $state(0);

/**
 * Whether one of the app's dialogs is open. While one is, the table is
 * frozen: its keys, hover, presses and drags do nothing, and the dialog has
 * the keyboard. The page does not scroll either (see lockPageScroll).
 */
export const modal = {
  get open(): boolean {
    return openDialogs > 0;
  },
};

/** Counts a dialog as open until the returned function is called. */
export function openModal(): () => void {
  openDialogs++;
  if (openDialogs === 1) {
    lockPageScroll();
  }
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      openDialogs--;
      if (openDialogs === 0) {
        unlockPageScroll();
      }
    }
  };
}

/**
 * Stops the page behind the dialogs from scrolling: wheel, touch, keys and
 * scrollbar drags (.scroll-locked in tokens.css). The page keeps its scroll
 * offset, so nothing jumps and no scroll event fires (the compact top bar's
 * auto-hide listens to them). The lists of a dialog scroll on their own.
 */
function lockPageScroll(): void {
  const page = document.documentElement;
  // A classic scrollbar (not an overlay one) takes room from the page: hidden
  // with the overflow, it would let the content widen under the dialog. Its
  // room is kept instead, and only for such a scrollbar: kept on a page without
  // one, it would narrow the content.
  const scrollbarWidth = window.innerWidth - page.clientWidth;
  if (scrollbarWidth > 0) {
    page.classList.add('scroll-locked-gutter');
  }
  page.classList.add('scroll-locked');
}

function unlockPageScroll(): void {
  document.documentElement.classList.remove('scroll-locked', 'scroll-locked-gutter');
}

// Whether the last press was the pointer's (mouse, pen, touch) rather than a
// key's. Listened to on the window, before anything else handles the press,
// from the start: whoever opened a dialog is known as it opens.
let pointerPressedLast = false;

window.addEventListener(
  'pointerdown',
  () => {
    pointerPressedLast = true;
  },
  { capture: true },
);

window.addEventListener(
  'keydown',
  () => {
    pointerPressedLast = false;
  },
  { capture: true },
);

/** Whether the last press was the pointer's rather than a key's: a click opening a dialog, as it opens. */
export function lastPressByPointer(): boolean {
  return pointerPressedLast;
}

/** The elements inside `root` that Tab reaches, in document order. */
export function focusables(root: HTMLElement | undefined): HTMLElement[] {
  const selector = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]';
  return [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(
    (element) => element.tabIndex >= 0,
  );
}

/** Tab and Shift + Tab cycle through the elements of `root` only: a dialog's box, a sheet's panel. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | undefined): void {
  const all = focusables(root);
  const first = all[0];
  const last = all.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  // The root itself has the focus after a click on its text: Tab would leave from there.
  if (!all.some((element) => element === document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
