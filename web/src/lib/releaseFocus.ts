// The open dialogs and menus (components/Dialog, table/ContextMenu): a focus
// inside one belongs to it.
const DIALOG_OR_MENU = '[aria-modal="true"], [role="dialog"], [role="menu"]';

/** Whether that target is a field the viewer types in: its keys are theirs. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  );
}

/**
 * A control clicked last, a top bar button say, keeps the focus. The first key
 * of the table then shows its focus ring, and Space or Enter activate it again.
 * To call on a press that cancels its pointerdown (no text selection, no native
 * image drag), which also cancels the browser's focus move, with the pressed
 * element; and on a table shortcut (table/keys), with null.
 * Blurs that control, unless the viewer types in it, it belongs to an open
 * dialog or menu, or it lies inside the pressed element.
 */
export function releaseFocus(pressed: EventTarget | null): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) {
    return;
  }
  if (isTyping(active) || active.closest(DIALOG_OR_MENU) !== null) {
    return;
  }
  if (pressed instanceof Node && pressed.contains(active)) {
    return;
  }
  active.blur();
}

/**
 * Svelte attachment for a chrome button outside dialogs and menus (the top bar, the zoom control,
 * the history's toggles): clicked with the pointer, it lets go of the focus at once, so that no
 * later key shows its ring or activates it again. Activated from the keyboard, it keeps the
 * focus, for the keyboard navigation to go on from there.
 */
export function pointerBlur(node: HTMLElement): () => void {
  // A click's detail counts the pointer's presses: 0 for Enter or Space.
  function blurAfterPointer(event: MouseEvent): void {
    if (event.detail > 0) {
      node.blur();
    }
  }

  node.addEventListener('click', blurAfterPointer);
  return () => {
    node.removeEventListener('click', blurAfterPointer);
  };
}
