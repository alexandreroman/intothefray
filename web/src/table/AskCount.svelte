<!--
  "How many cards?": the app's own dialog for a number of cards, instead of
  the browser's prompt. − value + (5 by default), Enter confirms, Escape or
  a click outside cancels.
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

  // The default is only the starting value: a changed max does not reset what was typed.
  // svelte-ignore state_referenced_locally
  let text = $state(String(Math.min(5, max)));

  // A max that drops below the value (the pile shrank) lowers it; one that rises leaves it.
  $effect(() => {
    const limit = max;
    untrack(() => {
      if ((parseInt(text, 10) || 0) > limit) {
        text = String(limit);
      }
    });
  });

  /** The typed value, kept between 1 and max. */
  function value(): number {
    const typed = parseInt(text, 10) || 0;
    return Math.max(1, Math.min(max, typed));
  }

  function step(by: number): void {
    text = String(Math.max(1, Math.min(max, value() + by)));
  }

  function confirm(): void {
    onconfirm(value());
  }

  // Digits only, three at most: no pile holds a thousand cards.
  function onInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    text = input.value.replace(/\D/g, '').slice(0, 3);
    input.value = text;
  }

  function onKeydown(event: KeyboardEvent): void {
    // Enter on a button presses that button (Cancel, − or +), as the browser has it.
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      confirm();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(event.key === 'ArrowUp' ? 1 : -1);
    }
  }

  function selectAll(input: HTMLInputElement): void {
    input.focus();
    input.select();
  }
</script>

<Dialog {title} {oncancel} onkeydown={onKeydown}>
  <p>{question}</p>
  <div class="row">
    <button type="button" class="step" aria-label="One less" onclick={() => step(-1)}>−</button>
    <input type="text" inputmode="numeric" value={text} oninput={onInput} {@attach selectAll} />
    <button type="button" class="step" aria-label="One more" onclick={() => step(1)}>+</button>
  </div>
  <div class="buttons">
    <button type="button" onclick={oncancel}>Cancel</button>
    <button type="button" class="ok" onclick={confirm}>{ok}</button>
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

  /* More specific than the app's input[type='text'], which spans the whole width. */
  .row input {
    width: 64px;
    text-align: center;
    background: #0c111b;
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    font:
      700 16px system-ui,
      sans-serif;
    padding: 6px 0;
  }

  .row input:focus {
    outline: 2px solid var(--sel);
    border-color: transparent;
  }

  .step {
    width: 34px;
    font-weight: 700;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .ok {
    border-color: var(--sel);
    background: #23406a;
    font-weight: 700;
  }
</style>
