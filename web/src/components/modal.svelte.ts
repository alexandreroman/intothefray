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
