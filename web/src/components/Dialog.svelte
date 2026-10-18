<!--
  The shell of the app's own dialogs: a backdrop, a box titled by its first
  line, and the focus kept inside it. Escape or a click outside cancels.
  While it is shown, a modal counts as open (see modal.svelte.ts).
-->
<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte';
  import { openModal } from './modal.svelte';

  let {
    title,
    role = 'dialog',
    oncancel,
    onkeydown,
    children,
  }: {
    title: string;
    /** An alertdialog asks to confirm something. */
    role?: 'dialog' | 'alertdialog';
    oncancel: () => void;
    /** Keys pressed inside the box, after the shell has handled Tab. */
    onkeydown?: (event: KeyboardEvent) => void;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;

  let box = $state<HTMLElement>();

  // Counted at once, not in an effect: whoever checks right after the dialog
  // is shown must see it open.
  onDestroy(openModal());

  // The focus goes back where it was when the dialog closes.
  const focusedBefore =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  onDestroy(() => focusedBefore?.focus());

  onMount(() => {
    // The content may have focused one of its own elements already (autofocus).
    if (!box?.contains(document.activeElement)) {
      focusables()[0]?.focus();
    }
  });

  function focusables(): HTMLElement[] {
    const selector = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]';
    return [...(box?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(
      (element) => element.tabIndex >= 0,
    );
  }

  /** Tab and Shift + Tab cycle through the dialog only. */
  function trapTab(event: KeyboardEvent): void {
    const all = focusables();
    const first = all[0];
    const last = all.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onBoxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      trapTab(event);
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

  function onBackdrop(event: PointerEvent): void {
    if (event.target === event.currentTarget) {
      oncancel();
    }
  }
</script>

<!-- On the window: Escape must work wherever the focus is. -->
<svelte:window onkeydown={onWindowKeydown} />

<div class="backdrop" role="presentation" onpointerdown={onBackdrop}>
  <div
    class="box"
    {role}
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    bind:this={box}
    onkeydown={onBoxKeydown}
  >
    <b id={titleId}>{title}</b>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 5600;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #05080f99;
    animation: fadein 0.12s ease-out;
  }

  @keyframes fadein {
    from {
      opacity: 0;
    }
  }

  .box {
    width: min(360px, calc(100vw - 32px));
    padding: 16px;
    background: var(--panel);
    border: 1px solid #3a4870;
    border-radius: 14px;
    box-shadow: 0 20px 50px #000c;
  }

  .box:focus {
    outline: none;
  }

  b {
    display: block;
    font-size: 16px;
  }
</style>
