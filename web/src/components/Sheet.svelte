<!--
  A bottom sheet, the touch screens' modal layer: a veil that dims the page,
  and a panel that slides up from the bottom edge with a grab handle on top.
  A tap on the veil, a swipe down on the handle or Escape closes it. Like a
  dialog (Dialog.svelte), it counts as a modal while shown (see
  modal.svelte.ts), keeps the focus inside and gives it back when it closes.
  Above 600 px wide, the panel is at most 480 px wide and centred.
-->
<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { lastPressByPointer, openModal } from './modal.svelte';

  let {
    label,
    onclose,
    maxHeight = '92%',
    children,
  }: {
    /** The sheet's accessible name. */
    label: string;
    onclose: () => void;
    /** The panel's height limit, as a CSS length (a percentage of the window's height). */
    maxHeight?: string;
    children: Snippet;
  } = $props();

  /** How far down the handle must be dragged, in px, for the sheet to close. */
  const CLOSE_DISTANCE = 60;

  let panel: HTMLElement | undefined = $state();

  // Counted at once, not in an effect: whoever checks right after the sheet
  // is shown must see it open.
  onDestroy(openModal());

  // The focus goes back where it was, without a focus ring when the sheet was
  // opened by the pointer, as for a dialog.
  const focusedBefore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const openedByPointer = lastPressByPointer();
  onDestroy(() => {
    if (openedByPointer) {
      focusedBefore?.focus({ focusVisible: false });
    } else {
      focusedBefore?.focus();
    }
  });

  onMount(() => {
    // The panel itself takes the focus, not its first button: on a touch
    // screen, a ring on a button nobody chose would only be noise.
    if (!panel?.contains(document.activeElement)) {
      panel?.focus({ focusVisible: false });
    }
  });

  function focusables(): HTMLElement[] {
    const selector = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]';
    return [...(panel?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(
      (element) => element.tabIndex >= 0,
    );
  }

  /** Tab and Shift + Tab cycle through the sheet only. */
  function trapTab(event: KeyboardEvent): void {
    const all = focusables();
    const first = all[0];
    const last = all.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
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

  function onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      trapTab(event);
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Prevented, so that a browser in fullscreen keeps it.
      event.preventDefault();
      onclose();
    }
  }

  // The swipe on the handle: the pointer that pressed it, where it pressed,
  // and how far down the panel follows it. Followed on the window, so that the
  // swipe goes on wherever the finger goes.
  let swipe: { pointerId: number; startY: number } | null = null;
  let offset = $state(0);

  function onGrabPointerDown(event: PointerEvent): void {
    swipe = { pointerId: event.pointerId, startY: event.clientY };
    offset = 0;
  }

  function onWindowPointerMove(event: PointerEvent): void {
    if (swipe && event.pointerId === swipe.pointerId) {
      offset = Math.max(0, event.clientY - swipe.startY);
    }
  }

  function onWindowPointerUp(event: PointerEvent): void {
    if (!swipe || event.pointerId !== swipe.pointerId) {
      return;
    }
    const distance = event.clientY - swipe.startY;
    swipe = null;
    offset = 0;
    if (distance >= CLOSE_DISTANCE) {
      onclose();
    }
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    if (swipe && event.pointerId === swipe.pointerId) {
      swipe = null;
      offset = 0;
    }
  }
</script>

<!-- On the window: Escape must work wherever the focus is, and a swipe goes on outside the handle. -->
<svelte:window
  onkeydown={onWindowKeydown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={onWindowPointerCancel}
/>

<!-- The veil is a pointer target only: the keyboard closes the sheet with Escape. -->
<div class="veil" role="presentation" onclick={onclose}></div>

<div
  class="sheet"
  role="dialog"
  aria-modal="true"
  aria-label={label}
  tabindex="-1"
  style:max-height={maxHeight}
  style:transform={offset > 0 ? `translateY(${offset}px)` : undefined}
  bind:this={panel}
  onkeydown={onPanelKeydown}
>
  <div class="grab" aria-hidden="true" onpointerdown={onGrabPointerDown}></div>
  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  /* Under the dialogs (5600), which a sheet may open, and the tooltips (6000). */
  .veil {
    position: fixed;
    inset: 0;
    z-index: 5500;
    background: #07090fa6;
    animation: fadein 0.26s ease-out;
  }

  .sheet {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5500;
    display: flex;
    flex-direction: column;
    width: 100%;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-bottom: none;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -12px 40px #0009;
    animation: slideup 0.26s ease-out;
  }

  .sheet:focus {
    outline: none;
  }

  @media (min-width: 601px) {
    .sheet {
      max-width: 480px;
      margin-inline: auto;
    }
  }

  /*
    A full-width strip with a short bar drawn in its middle. It reaches 16 px
    above the panel (::after), so that it is 44 px high to the finger.
  */
  .grab {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    height: 28px;
    cursor: grab;
    touch-action: none;
  }

  .grab::after {
    content: '';
    position: absolute;
    inset: -16px 0 0;
  }

  .grab::before {
    content: '';
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @keyframes fadein {
    from {
      opacity: 0;
    }
  }

  @keyframes slideup {
    from {
      transform: translateY(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .veil,
    .sheet {
      animation: none;
    }
  }
</style>
