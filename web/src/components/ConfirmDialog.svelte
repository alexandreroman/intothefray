<!--
  The app's own confirmation dialog, instead of the browser's confirm().
  Escape, Cancel or a click outside cancels.
-->
<script lang="ts">
  let {
    question,
    confirmLabel,
    danger = false,
    onconfirm,
    oncancel,
  }: {
    question: string;
    confirmLabel: string;
    /** The confirmed action cannot be taken back: the button says so. */
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  function onKeydown(event: KeyboardEvent): void {
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
<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="presentation" onpointerdown={onBackdrop}>
  <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-question">
    <b id="confirm-question">{question}</b>
    <div class="buttons">
      <!-- The safe choice has the focus. -->
      <!-- svelte-ignore a11y_autofocus -->
      <button type="button" onclick={oncancel} autofocus>Cancel</button>
      <button type="button" class="ok" class:danger onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #000a;
    z-index: 4000;
  }

  .modal {
    width: min(340px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 24px 60px #000c;
  }

  b {
    font-size: 16px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  button {
    padding: 8px 20px;
    white-space: nowrap;
  }

  .ok {
    background: #23406a;
    border-color: var(--sel);
    font-weight: 600;
  }

  .ok.danger {
    background: #4a1c22;
    border-color: var(--accent);
  }
</style>
