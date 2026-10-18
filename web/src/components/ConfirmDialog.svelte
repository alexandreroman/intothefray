<!--
  The app's own confirmation dialog, instead of the browser's confirm().
  Escape, Cancel or a click outside cancels.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';

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
</script>

<Dialog title={question} role="alertdialog" {oncancel}>
  <div class="buttons">
    <!-- The safe choice has the focus. -->
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" onclick={oncancel} autofocus>Cancel</button>
    <button type="button" class="ok" class:danger onclick={onconfirm}>{confirmLabel}</button>
  </div>
</Dialog>

<style>
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
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
