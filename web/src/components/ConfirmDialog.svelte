<!--
  The app's own confirmation dialog, instead of the browser's confirm().
  Escape, Cancel or a click outside cancels.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';

  let {
    question,
    confirmLabel,
    onconfirm,
    oncancel,
  }: {
    question: string;
    confirmLabel: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();
</script>

<Dialog title={question} role="alertdialog" {oncancel}>
  <div class="buttons">
    <!-- The safe choice has the focus. -->
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" onclick={oncancel} autofocus>Cancel</button>
    <button type="button" class="btn-primary compact" onclick={onconfirm}>{confirmLabel}</button>
  </div>
</Dialog>

<style>
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    margin-top: 20px;
  }

  button {
    height: 40px;
    padding: 0 20px;
    white-space: nowrap;
  }
</style>
