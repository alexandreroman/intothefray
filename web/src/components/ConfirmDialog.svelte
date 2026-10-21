<!--
  The app's own confirmation dialog, instead of the browser's confirm().
  Escape, Cancel or a click outside cancels. A detail, when given, is read
  under the question.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';

  let {
    question,
    detail,
    confirmLabel,
    onconfirm,
    oncancel,
  }: {
    question: string;
    /** What confirming does, in a line under the question. */
    detail?: string;
    confirmLabel: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  const uid = $props.id();
  const detailId = `${uid}-detail`;
</script>

<Dialog title={question} role="alertdialog" describedby={detail ? detailId : undefined} {oncancel}>
  {#if detail}
    <p id={detailId}>{detail}</p>
  {/if}
  <div class="buttons">
    <!-- The safe choice has the focus. -->
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" onclick={oncancel} autofocus>Cancel</button>
    <button type="button" class="btn-primary compact" onclick={onconfirm}>{confirmLabel}</button>
  </div>
</Dialog>

<style>
  p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.4;
  }

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
