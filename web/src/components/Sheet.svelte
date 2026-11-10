<!--
  A bottom sheet, the touch screens' modal layer: a veil that dims the page,
  and a panel that slides up from the bottom edge with a grab handle on top.
  A tap on the veil, a swipe down or Escape closes it. Like a
  dialog (Dialog.svelte), it counts as a modal while shown (see
  modal.svelte.ts) and keeps the focus inside; closed from the keyboard, it
  gives the focus back to its opener, closed by the pointer, to the page.
  A sheet that is not modal (the hand's) leaves the table live, so that a
  press inside it can start a drag onto the table, and the page unlocked.
  Above 600 px wide, the panel is at most 480 px wide and centred; a wide one
  (the inspector's on a tablet) at most 760 px, and never nearer than 16 px to
  the window's sides; a wide one that fits its content is as wide as the
  content lays itself out, within the same 16 px. In dock
  mode (a phone) it spans the whole width and may take the whole
  height but the top safe area; its content decides its height below that,
  and reads the room it has in --sheet-room.
  The swipe: a mouse or a pen drags the handle down; a finger drags the whole
  sheet, from anywhere on it, once it has moved 10 px mostly downward (a
  shorter press is a tap), unless the area under it is scrolled down, which
  scrolls back up first. A sideways or upward move is the content's: a
  carousel's scroll, a hand card's drag. Let go past 60 px or flung down, the
  sheet closes; else it springs back.
  It leaves sliding down as its veil fades out, however its caller removes it
  (global transitions); as it starts leaving, it lets the page go and the
  focus move on, and takes no more taps or keys.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack, type Snippet } from 'svelte';
  import { on } from 'svelte/events';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { motionMs } from '../lib/motion';
  import { lastPressByPointer, openModal, trapTab } from './modal.svelte';

  let {
    label,
    onclose,
    maxHeight = '92%',
    modal = true,
    dock = false,
    wide = false,
    fit = false,
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
    /** Outside dock mode, a panel of up to 760 px wide rather than 480 px, for content laid out side by side. */
    wide?: boolean;
    /** A wide panel as wide as its content, up to the window less 16 px a side, rather than 760 px at most. */
    fit?: boolean;
    children: Snippet;
  } = $props();

  /** How far down the sheet must be dragged, in px, for it to close. */
  const CLOSE_DISTANCE = 60;

  /** How far a finger must move, in px, before it may drag the sheet: a shorter press is a tap. */
  const TOUCH_SLOP = 10;

  /** How fast a finger letting go must move down, in px/ms, to fling the sheet shut however short its swipe. */
  const FLING_SPEED = 0.5;

  /** How far back the finger's speed is measured as it lets go, in ms. */
  const FLING_WINDOW_MS = 100;

  /** How long the sheet takes to slide down as it leaves, in ms. */
  const LEAVE_MS = 240;

  let panel: HTMLElement | undefined = $state();

  // Counted at once, not in an effect: whoever checks right after the sheet
  // is shown must see it open. Read once: a sheet does not change its kind.
  const releaseModal = untrack(() => modal) ? openModal() : undefined;

  const focusedBefore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let leaving = false;

  /**
   * Lets the page go as the sheet starts sliding down, rather than once it is
   * gone, so that the table answers at once: the sheet takes no more taps,
   * the modal count drops, and the focus moves on (giveFocusBack).
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
    giveFocusBack();
  }

  /**
   * Closed from the keyboard (Escape, a button pressed with Enter), the sheet
   * gives the focus back to its opener, ring and all, for the keyboard
   * navigation to go on from there. Closed by the pointer (a swipe, a tap on
   * the veil or on an action), it lets the focus go to the page instead: the
   * opener, a dock button say, would keep a focus nobody gave it, which a
   * later Space or Enter would activate again (pointerBlur, lib/releaseFocus).
   */
  function giveFocusBack(): void {
    if (!lastPressByPointer()) {
      focusedBefore?.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && panel?.contains(active)) {
      active.blur();
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

  function onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      trapTab(event, panel);
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !leaving) {
      // Prevented, so that a browser in fullscreen keeps it.
      event.preventDefault();
      onclose();
    }
  }

  // How far down the panel follows the swipe, and whether it follows it now (no glide back then).
  let offset = $state(0);
  let dragging = $state(false);

  /** Puts the panel back where it rests, gliding there (the sheet's transition). */
  function springBack(): void {
    dragging = false;
    offset = 0;
  }

  /** Ends a swipe let go `distance` px down: past CLOSE_DISTANCE, or flung, it closes the sheet. */
  function release(distance: number, flung = false): void {
    // A closing swipe leaves the sheet where the finger let go: it slides down on from there.
    if (distance >= CLOSE_DISTANCE || flung) {
      dragging = false;
      onclose();
    } else {
      springBack();
    }
  }

  // The swipe of a mouse or a pen on the handle: the pointer that pressed it and where it pressed.
  // Followed on the window, so that the swipe goes on wherever the pointer goes. A finger's is
  // the touch swipe below, from anywhere on the sheet, the handle too.
  let handleSwipe: { pointerId: number; startY: number } | null = null;

  function onGrabPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      return;
    }
    handleSwipe = { pointerId: event.pointerId, startY: event.clientY };
    offset = 0;
    dragging = true;
  }

  function onWindowPointerMove(event: PointerEvent): void {
    if (handleSwipe && event.pointerId === handleSwipe.pointerId) {
      offset = Math.max(0, event.clientY - handleSwipe.startY);
    }
  }

  function onWindowPointerUp(event: PointerEvent): void {
    if (!handleSwipe || event.pointerId !== handleSwipe.pointerId) {
      return;
    }
    const distance = event.clientY - handleSwipe.startY;
    handleSwipe = null;
    release(distance);
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    if (handleSwipe && event.pointerId === handleSwipe.pointerId) {
      handleSwipe = null;
      springBack();
    }
  }

  /** Where the finger was, and when (the event's timeStamp, in ms). */
  type Sample = { y: number; at: number };

  // The swipe of a finger on the sheet: the touch, where it pressed, and once it drags the sheet,
  // where that drag began and its last moves, which measure its speed as it lets go. Touch
  // events rather than pointer ones: only a touchmove can be prevented, to keep the browser from
  // scrolling the content under a finger that drags the sheet, and decided only past the slop.
  let touchSwipe: {
    id: number;
    startX: number;
    startY: number;
    drag: { startY: number; samples: Sample[] } | null;
  } | null = null;

  /** The finger of the touch swipe among the event's changed touches, if it is one of them. */
  function swipingTouch(event: TouchEvent): Touch | null {
    if (!touchSwipe) {
      return null;
    }
    const id = touchSwipe.id;
    return [...event.changedTouches].find((touch) => touch.identifier === id) ?? null;
  }

  /** Whether an area the finger pressed in, up to the panel, is scrolled down from its top. */
  function scrolledDown(target: EventTarget | null): boolean {
    let element = target instanceof Element ? target : null;
    while (element && panel?.contains(element)) {
      if (element.scrollTop > 0) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  function onTouchStart(event: TouchEvent): void {
    // A second finger is a pinch or a mistake: no swipe of the sheet.
    if (event.touches.length > 1) {
      if (touchSwipe?.drag) {
        springBack();
      }
      touchSwipe = null;
      return;
    }
    const touch = event.changedTouches[0];
    if (leaving || !touch || scrolledDown(event.target)) {
      return;
    }
    touchSwipe = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY, drag: null };
  }

  function onTouchMove(event: TouchEvent): void {
    const touch = swipingTouch(event);
    if (!touchSwipe || !touch) {
      return;
    }
    if (!touchSwipe.drag) {
      const dx = touch.clientX - touchSwipe.startX;
      const dy = touch.clientY - touchSwipe.startY;
      if (Math.hypot(dx, dy) < TOUCH_SLOP) {
        return;
      }
      // Past the slop, only a move mostly down drags the sheet, and only while the browser has not
      // begun scrolling (the move is still cancelable); any other is the content's to the end.
      if (dy <= Math.abs(dx) || !event.cancelable) {
        touchSwipe = null;
        return;
      }
      touchSwipe.drag = { startY: touch.clientY, samples: [] };
      dragging = true;
    }
    event.preventDefault();
    offset = Math.max(0, touch.clientY - touchSwipe.drag.startY);
    remember(touchSwipe.drag.samples, { y: touch.clientY, at: event.timeStamp });
  }

  /** Keeps the finger's moves of the last FLING_WINDOW_MS, the latest one last. */
  function remember(samples: Sample[], sample: Sample): void {
    samples.push(sample);
    while (samples[0] && sample.at - samples[0].at > FLING_WINDOW_MS) {
      samples.shift();
    }
  }

  /** The finger's speed down over its last moves, in px/ms: none for a finger held still. */
  function speedDown(samples: Sample[]): number {
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last || last.at <= first.at) {
      return 0;
    }
    return (last.y - first.y) / (last.at - first.at);
  }

  function onTouchEnd(event: TouchEvent): void {
    const touch = swipingTouch(event);
    const drag = touchSwipe?.drag;
    if (!touch) {
      return;
    }
    touchSwipe = null;
    if (!drag) {
      return;
    }
    // A drag is no tap: no click on what the finger lets go of.
    if (event.cancelable) {
      event.preventDefault();
    }
    remember(drag.samples, { y: touch.clientY, at: event.timeStamp });
    release(touch.clientY - drag.startY, speedDown(drag.samples) > FLING_SPEED);
  }

  function onTouchCancel(event: TouchEvent): void {
    const touch = swipingTouch(event);
    if (!touch) {
      return;
    }
    if (touchSwipe?.drag) {
      springBack();
    }
    touchSwipe = null;
  }

  // Svelte makes `ontouchmove` passive: the sheet prevents the moves of the finger that drags it,
  // so it listens to them itself, not passive.
  onMount(() => {
    if (!panel) {
      return;
    }
    return on(panel, 'touchmove', onTouchMove, { passive: false });
  });
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
  class:wide={wide && !dock}
  class:fit={wide && fit && !dock}
  class:dragging
  role="dialog"
  aria-modal={modal}
  aria-label={label}
  tabindex="-1"
  style:max-height={dock ? undefined : maxHeight}
  style:transform={offset > 0 ? `translateY(${offset}px)` : undefined}
  bind:this={panel}
  onkeydown={onPanelKeydown}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  ontouchcancel={onTouchCancel}
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
    background: var(--scrim);
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
    /* The glide back after a swipe too short to close it. */
    transition: transform 0.16s ease-out;
  }

  /* Dragged: it follows the finger at once. */
  .sheet.dragging {
    transition: none;
  }

  .sheet:focus {
    outline: none;
  }

  @media (min-width: 601px) {
    .sheet {
      max-width: 480px;
      margin-inline: auto;
    }

    .sheet.wide {
      max-width: min(760px, calc(100% - 32px));
    }

    /* Centred by its auto margins, as the content's own width. */
    .sheet.wide.fit {
      width: fit-content;
      max-width: calc(100% - 32px);
    }
  }

  /*
    A phone's sheet: the whole width, and up to the whole height under the top
    safe area. --sheet-room is the height its content may take: the panel's
    less the handle (28 px) and the bottom padding.
  */
  .sheet.dock {
    --sheet-max: calc(100dvh - var(--status-room));
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

  @keyframes slideup {
    from {
      transform: translateY(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .veil,
    .sheet {
      animation: none;
      transition: none;
    }
  }
</style>
