<!--
  A bottom sheet, the touch screens' modal layer: a veil that dims the page,
  and a panel that slides up from the bottom edge with a grab handle on top.
  A tap on the veil, a swipe down on the handle or Escape closes it. Like a
  dialog (Dialog.svelte), it counts as a modal while shown (see
  modal.svelte.ts), keeps the focus inside and gives it back when it closes.
  A sheet that is not modal (the hand's) leaves the table live, so that a
  press inside it can start a drag onto the table, and the page unlocked.
  Above 600 px wide, the panel is at most 480 px wide and centred. In dock
  mode (a phone, spec 3.4) it spans the whole width and may take the whole
  height but the top safe area; its content decides its height below that,
  and reads the room it has in --sheet-room.
  It leaves sliding down as its veil fades out, however its caller removes it
  (global transitions); as it starts leaving, it lets the page go and gives
  the focus back, and takes no more taps or keys.
-->
<script module lang="ts">
  import { prefersReducedMotion } from 'svelte/motion';

  /**
   * How long a motion of the sheet or of what it holds lasts, in ms: no time
   * under reduced motion, nor where the browser has no Web Animations, which
   * Svelte's transitions play on (jsdom), so that every change is instant.
   */
  export function motionMs(ms: number): number {
    if (prefersReducedMotion.current || typeof Element.prototype.animate !== 'function') {
      return 0;
    }
    return ms;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack, type Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { lastPressByPointer, openModal } from './modal.svelte';

  let {
    label,
    onclose,
    maxHeight = '92%',
    modal = true,
    dock = false,
    children,
  }: {
    /** The sheet's accessible name. */
    label: string;
    onclose: () => void;
    /** The panel's height limit, as a CSS length (a percentage of the window's height). */
    maxHeight?: string;
    /** Whether the sheet freezes the table while shown (modal.svelte.ts). */
    modal?: boolean;
    /** A phone's sheet (dock mode): the whole screen is its room; maxHeight does not apply. */
    dock?: boolean;
    children: Snippet;
  } = $props();

  /** How far down the handle must be dragged, in px, for the sheet to close. */
  const CLOSE_DISTANCE = 60;

  /** How long the sheet takes to slide down as it leaves, in ms. */
  const LEAVE_MS = 240;

  let panel: HTMLElement | undefined = $state();

  // Counted at once, not in an effect: whoever checks right after the sheet
  // is shown must see it open. Read once: a sheet does not change its kind.
  const releaseModal = untrack(() => modal) ? openModal() : undefined;

  const focusedBefore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const openedByPointer = lastPressByPointer();

  let leaving = false;

  /**
   * Lets the page go as the sheet starts sliding down, rather than once it is
   * gone, so that the table answers at once: the sheet takes no more taps,
   * the modal count drops, and the focus goes back where it was, without a
   * focus ring when the sheet was opened by the pointer, as for a dialog.
   * Once, as it starts leaving or, without an outro, as it is destroyed.
   */
  function leave(): void {
    if (leaving) {
      return;
    }
    leaving = true;
    // Set by hand: the effects of a leaving sheet are paused, its attributes no longer follow its state.
    if (panel) {
      panel.inert = true;
    }
    releaseModal?.();
    if (openedByPointer) {
      focusedBefore?.focus({ focusVisible: false });
    } else {
      focusedBefore?.focus();
    }
  }

  onDestroy(leave);

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
    if (event.key === 'Escape' && !leaving) {
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
    // A closing swipe leaves the sheet where the finger let go: it slides down on from there.
    if (distance >= CLOSE_DISTANCE) {
      onclose();
    } else {
      offset = 0;
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
<div
  class="veil"
  role="presentation"
  onclick={onclose}
  out:fade|global={{ duration: motionMs(LEAVE_MS), easing: cubicOut }}
></div>

<div
  class="sheet"
  class:dock
  role="dialog"
  aria-modal={modal}
  aria-label={label}
  tabindex="-1"
  style:max-height={dock ? undefined : maxHeight}
  style:transform={offset > 0 ? `translateY(${offset}px)` : undefined}
  bind:this={panel}
  onkeydown={onPanelKeydown}
  onoutrostart={leave}
  out:fly|global={{ y: '100%', opacity: 1, duration: motionMs(LEAVE_MS), easing: cubicOut }}
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
    A phone's sheet: the whole width, and up to the whole height under the top
    safe area. --sheet-room is the height its content may take: the panel's
    less the handle (28 px) and the bottom padding.
  */
  .sheet.dock {
    --sheet-max: calc(100dvh - env(safe-area-inset-top));
    --sheet-room: calc(var(--sheet-max) - 40px - env(safe-area-inset-bottom));
    max-width: none;
    max-height: var(--sheet-max);
    margin-inline: 0;
    padding: 0 calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom))
      calc(12px + env(safe-area-inset-left));
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
