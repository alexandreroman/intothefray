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
 * To call on a press that cancels its pointerdown (no text selection, no native
 * image drag): that also cancels the browser's focus move, so the control
 * clicked last, a top bar button say, keeps the focus. The first key of the
 * table then shows its focus ring, and Space or Enter activate it again.
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
