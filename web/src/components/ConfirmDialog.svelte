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
    margin-top: 20px;
  }

  button {
    height: 40px;
    padding: 0 20px;
    white-space: nowrap;
  }

  /* Paper for a confirmation, Fray red for an action that cannot be taken back. */
  .ok {
    background: var(--text);
    border-color: var(--text);
    color: var(--bg);
    font-weight: 800;
  }

  .ok.danger {
    background: var(--accent);
    border-color: var(--accent);
  }

  .ok:hover:not(:disabled) {
    background: #ffffff;
    border-color: #ffffff;
  }

  .ok.danger:hover:not(:disabled) {
    background: #ff5e52;
    border-color: #ff5e52;
  }
</style>
