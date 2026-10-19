<!--
  "How many cards?": the app's own dialog for a number of cards, instead of
  the browser's prompt. − value + (5 by default): the value is not typed but
  stepped, with the buttons or the keys (arrows, + and −, Home and End).
  Enter confirms; Escape, Cancel or a click outside cancels.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../components/Dialog.svelte';

  let {
    title,
    question,
    max,
    ok,
    onconfirm,
    oncancel,
  }: {
    title: string;
    question: string;
    /** The most cards there are; the answer is between 1 and max. */
    max: number;
    /** The label of the confirm button. */
    ok: string;
    onconfirm: (n: number) => void;
    oncancel: () => void;
  } = $props();

  // The default is only the starting value: a changed max does not reset the chosen one.
  // svelte-ignore state_referenced_locally
  let count = $state(Math.max(1, Math.min(5, max)));

  // A max that drops below the value (the pile shrank) lowers it; one that rises leaves it.
  $effect(() => {
    const limit = max;
    untrack(() => {
      if (count > limit) {
        count = Math.max(1, limit);
      }
    });
  });

  /** Sets the value, kept between 1 and max. */
  function setCount(n: number): void {
    count = Math.max(1, Math.min(max, n));
  }

  function step(by: number): void {
    setCount(count + by);
  }

  function confirm(): void {
    onconfirm(count);
  }

  // The keys of a spin button (WAI-ARIA), plus + and −; they work wherever the focus is in the box.
  const KEY_STEPS: Record<string, number> = {
    ArrowUp: 1,
    ArrowRight: 1,
    '+': 1,
    '=': 1,
    ArrowDown: -1,
    ArrowLeft: -1,
    '-': -1,
    '−': -1,
  };

  function onKeydown(event: KeyboardEvent): void {
    const by = KEY_STEPS[event.key];
    // Enter on a button presses that button (Cancel, − or +), as the browser has it.
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      confirm();
    } else if (by !== undefined) {
      event.preventDefault();
      step(by);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setCount(event.key === 'Home' ? 1 : max);
    }
  }

  // The value has the focus as the box opens: the keys change it at once.
  function focusOnOpen(element: HTMLElement): void {
    element.focus();
  }

  /** Quick clicks on − and + never start a text selection. */
  function noSelection(event: MouseEvent): void {
    event.preventDefault();
  }
</script>

<Dialog {title} {oncancel} onkeydown={onKeydown}>
  <p>{question}</p>
  <div class="row">
    <button
      type="button"
      class="step"
      aria-label="One less"
      disabled={count <= 1}
      onmousedown={noSelection}
      onclick={() => step(-1)}>−</button
    >
    <div
      class="value"
      role="spinbutton"
      tabindex="0"
      aria-label="Number of cards"
      aria-valuenow={count}
      aria-valuemin={1}
      aria-valuemax={max}
      {@attach focusOnOpen}
    >
      {count}
    </div>
    <button
      type="button"
      class="step"
      aria-label="One more"
      disabled={count >= max}
      onmousedown={noSelection}
      onclick={() => step(1)}>+</button
    >
  </div>
  <div class="buttons">
    <button type="button" onclick={oncancel}>Cancel</button>
    <button type="button" class="btn-primary compact" onclick={confirm}>{ok}</button>
  </div>
</Dialog>

<style>
  p {
    margin: 6px 0 12px;
    color: var(--muted);
    font-size: 13px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  /* Read only, as the token pill's value: nothing in it to select. */
  .value {
    min-width: 64px;
    text-align: center;
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 8px 0;
    border-radius: 10px;
    background: var(--bg);
    user-select: none;
    -webkit-user-select: none;
  }

  .value:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: 2px;
  }

  .step {
    width: 40px;
    height: 40px;
    font-weight: 700;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  .buttons button:not(.btn-primary) {
    height: 40px;
    padding: 0 20px;
  }
</style>
