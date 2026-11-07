<!--
  The shell of every dialog of the app, the one modal layer: a backdrop that
  dims the page under it, a box titled by its first line, and the focus moved
  into it and kept there. Escape, or a click on the backdrop, cancels; the
  click does nothing else. While it is shown, a modal counts as open (see
  modal.svelte.ts): the page does not scroll, the table keys, hover and drags
  stop. A wide box (the card boxes, the shortcuts sheet) draws its own heading
  and spacing. The box is centred unless `at` places it; a box that fills
  takes the whole screen, within its safe areas (a card box on a phone).
-->
<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { focusables, lastPressByPointer, openModal, trapTab } from './modal.svelte';

  let {
    title,
    role = 'dialog',
    oncancel,
    onkeydown,
    wide = false,
    fill = false,
    at,
    width,
    describedby,
    box = $bindable(),
    heading,
    children,
  }: {
    /** The box's name; shown as its heading unless a heading is given. */
    title: string;
    /** An alertdialog asks to confirm something. */
    role?: 'dialog' | 'alertdialog';
    oncancel: () => void;
    /** Keys pressed inside the box, after the shell has handled Tab. */
    onkeydown?: (event: KeyboardEvent) => void;
    /** The card boxes' size, as wide as the window allows, without padding. */
    wide?: boolean;
    /** The box takes the whole screen, within its safe areas, with no margin. */
    fill?: boolean;
    /** Where the box's top left corner goes, in px from the window's; centred without it. */
    at?: { top: number; left: number };
    /** A width of its own (any CSS length), rather than its kind's. */
    width?: string;
    /** The id of the element of the content that describes the box, read after its name. */
    describedby?: string;
    /** The box, for whoever places it. */
    box?: HTMLElement;
    /** Draws the heading instead of the title; the element it gives the id to names the box. */
    heading?: Snippet<[string]>;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;

  // Counted at once, not in an effect: whoever checks right after the dialog
  // is shown must see it open.
  onDestroy(openModal());

  // The focus goes back where it was when the dialog closes. A dialog opened by
  // the pointer gives it back without a focus ring: browsers would draw one on
  // the button that opened it once a text field of the box (the card boxes'
  // name filter) has had the focus. Opened from the keyboard, the ring shows
  // where the focus lands, as the browser decides.
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
    // The content may have focused one of its own elements already (autofocus).
    if (!box?.contains(document.activeElement)) {
      focusables(box)[0]?.focus();
    }
  });

  function onBoxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      trapTab(event, box);
      return;
    }
    onkeydown?.(event);
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      oncancel();
    }
  }

  // A click cancels only when it starts on the backdrop too: a press inside the
  // box that ends outside it (a text selection, a card dragged out) does not.
  let pressedOnBackdrop = false;

  function onBackdropPointerDown(event: PointerEvent): void {
    pressedOnBackdrop = event.target === event.currentTarget;
  }

  function onBackdropClick(event: MouseEvent): void {
    if (pressedOnBackdrop && event.target === event.currentTarget) {
      oncancel();
    }
    pressedOnBackdrop = false;
  }
</script>

<!-- On the window: Escape must work wherever the focus is. -->
<svelte:window onkeydown={onWindowKeydown} />

<!-- The backdrop is a pointer target only: the keyboard closes the dialog with Escape. -->
<div
  class="backdrop"
  class:fill
  role="presentation"
  onpointerdown={onBackdropPointerDown}
  onclick={onBackdropClick}
>
  <div
    class="box"
    class:wide
    class:fill
    class:placed={at !== undefined}
    style:top={at ? `${at.top}px` : undefined}
    style:left={at ? `${at.left}px` : undefined}
    style:width
    {role}
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={describedby}
    tabindex="-1"
    bind:this={box}
    onkeydown={onBoxKeydown}
  >
    {#if heading}
      {@render heading(titleId)}
    {:else}
      <b id={titleId}>{title}</b>
    {/if}
    {@render children()}
  </div>
</div>

<style>
  /* Over everything of the page but the tooltips (6000): the same dim for every dialog. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 5600;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--scrim);
    animation: fadein 0.12s ease-out;
  }

  .box {
    width: min(380px, calc(100vw - 32px));
    padding: 20px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 16px;
    box-shadow: 0 24px 60px #000c;
  }

  /* A wide box: a column whose middle part scrolls. */
  .box.wide {
    display: flex;
    flex-direction: column;
    width: min(920px, 100%);
    max-height: 88vh;
    padding: 0;
  }

  /* A flex row rather than a grid: the box's size is then the backdrop's, never its content's. */
  .backdrop.fill {
    display: flex;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }

  .box.fill {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 100%;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .box.placed {
    position: fixed;
  }

  .box:focus {
    outline: none;
  }

  b {
    display: block;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
    line-height: 1.25;
  }
</style>
