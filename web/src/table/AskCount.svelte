<!--
  "How many cards?": the app's own dialog for a number of cards, instead of
  the browser's prompt. − value + (5 by default): the value is stepped with
  the buttons or the keys (arrows, + and −, Home and End), or typed with the
  digit keys anywhere in the box. The first digit replaces the value, the next
  ones append to it, Backspace removes the last one. A typed value stays
  between 1 and max: one above max shows max. A step starts from the typed
  value, and the next digit replaces it again. There is no text field, so a
  touch screen shows no keyboard. Enter confirms; Escape, Cancel or a click
  outside cancels.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from '../components/Dialog.svelte';
  import { focusOnOpen } from '../components/modal.svelte';

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

  // Whether the digits typed append to the value; the first one replaces it.
  let typing = false;

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
    typing = false;
  }

  function typeDigit(digit: string): void {
    if (typing) {
      setCount(Number(String(count) + digit));
    } else if (digit === '0') {
      // No leading zero: the value waits for its first digit.
      return;
    } else {
      setCount(Number(digit));
    }
    typing = true;
  }

  // The last digit goes; without one left, the value is 1 and the next digit replaces it.
  function eraseDigit(): void {
    const digits = String(count);
    if (digits.length > 1) {
      setCount(Number(digits.slice(0, -1)));
      typing = true;
    } else {
      setCount(1);
      typing = false;
    }
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

  /** A digit key, of the main row or the numeric keypad, with no shortcut modifier. */
  function isDigit(event: KeyboardEvent): boolean {
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    return /^[0-9]$/.test(event.key) && !modified && !event.isComposing;
  }

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
      typing = false;
    } else if (isDigit(event)) {
      event.preventDefault();
      typeDigit(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      eraseDigit();
    }
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
    <!-- The value has the focus as the box opens: the keys change it at once. -->
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

  /* Not a text field, as the token pill's value: nothing in it to select. */
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
    gap: 16px;
    margin-top: 20px;
  }

  .buttons button:not(.btn-primary) {
    height: 40px;
    padding: 0 20px;
  }
</style>
