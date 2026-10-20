let openDialogs = $state(0);

/**
 * Whether one of the app's dialogs is open. While one is, the table is
 * frozen: its keys, hover, presses and drags do nothing, and the dialog has
 * the keyboard.
 */
export const modal = {
  get open(): boolean {
    return openDialogs > 0;
  },
};

/** Counts a dialog as open until the returned function is called. */
export function openModal(): () => void {
  openDialogs++;
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      openDialogs--;
    }
  };
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
