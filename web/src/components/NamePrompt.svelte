<script lang="ts">
  // Without `oncancel` the dialog is mandatory.
  let {
    onsubmit,
    oncancel,
    initial = '',
  }: { onsubmit: (name: string) => void; oncancel?: () => void; initial?: string } = $props();

  // `initial` only seeds the field; later changes of the prop are ignored on purpose.
  // svelte-ignore state_referenced_locally
  let value = $state(initial);
  const name = $derived(value.trim());

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (name !== '') {
      onsubmit(name);
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && oncancel) {
      oncancel();
    }
  }
</script>

<div class="backdrop" role="presentation" onkeydown={onKeydown}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="name-prompt-title">
    <form onsubmit={submit}>
      <b id="name-prompt-title">Choose a name</b>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        bind:value
        maxlength="24"
        placeholder="e.g. Alex"
        aria-label="Name"
        autofocus
      />
      <div class="buttons">
        {#if oncancel}
          <button type="button" onclick={oncancel}>Cancel</button>
        {/if}
        <button type="submit" class="primary" disabled={name === ''}>OK</button>
      </div>
    </form>
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
    z-index: 10;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
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

  .primary {
    padding: 8px 20px;
    background: #23406a;
    border-color: var(--sel);
    font-weight: 600;
  }
</style>
