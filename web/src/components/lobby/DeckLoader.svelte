<script lang="ts">
  import { onMount } from 'svelte';
  import { swapFade } from '../../lib/motion';
  import type { DeckView, UnsupportedCard } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import DeckNames from './DeckNames.svelte';
  import HeroThumb from './HeroThumb.svelte';

  /**
   * One deck slot of the viewer. `number` is the 1-based number shown when the
   * player has several decks, null with a single one; `onremove` is given only
   * when the slot can be removed. `autofocus` focuses the deck link as the slot
   * mounts. `loading` tells that the slot's deck load is in flight: the form
   * then waits for its answer. `locked` tells that a deck load is in flight,
   * this slot's or another's, so it is set whenever `loading` is: meanwhile
   * the slot can neither start a load nor be removed, and only the loading
   * slot shows the load. `loaded` counts the
   * loads the server confirmed while this slot is the one loading, and is
   * undefined for the other slots: each new one closes a Change in progress
   * and clears the field, which shows a reload of the same deck, whose view
   * looks as before.
   */
  let {
    deck,
    number,
    deckError,
    error,
    onload,
    onremove,
    autofocus = false,
    loading = false,
    locked = false,
    loaded,
  }: {
    deck: DeckView;
    number: number | null;
    deckError: UnsupportedCard[] | null;
    error: string | null;
    onload: (url: string) => void;
    onremove?: () => void;
    autofocus?: boolean;
    loading?: boolean;
    locked?: boolean;
    loaded?: number;
  } = $props();

  const inputId = $props.id();

  let url = $state('');
  let input = $state<HTMLInputElement>();
  // The deck being replaced after Change: the form shows until another deck arrives.
  let changingFrom = $state<string | null>(null);

  const label = $derived(number === null ? 'Deck link' : `Deck ${number} link`);
  const placeholder = $derived(
    number === null ? 'Paste a deck link…' : `Paste deck ${number} link…`,
  );
  const loadLabel = $derived(number === null ? 'Load' : `Load deck ${number}`);
  const removeLabel = $derived(number === null ? 'Remove this deck' : `Remove deck ${number}`);
  const changeLabel = $derived(number === null ? 'Change deck' : `Change deck ${number}`);
  const signature = $derived(JSON.stringify([deck.hero, deck.deckName]));
  const showForm = $derived(!deck.ready || changingFrom === signature);
  const unsupportedCount = $derived(deckError?.reduce((sum, card) => sum + card.qty, 0) ?? 0);
  const unsupportedText = $derived(
    unsupportedCount === 1
      ? "1 card isn't supported."
      : `${unsupportedCount} cards aren't supported.`,
  );

  onMount(() => {
    if (autofocus) {
      input?.focus();
    }
  });

  // The confirmed count last seen, undefined while another slot is the loading one. Only a count
  // that grows while this slot stays the loading one tells of a load that went through.
  let seenLoaded: number | undefined;
  $effect(() => {
    if (loaded !== undefined && seenLoaded !== undefined && loaded > seenLoaded) {
      changingFrom = null;
      url = '';
    }
    seenLoaded = loaded;
  });

  function load(event: SubmitEvent): void {
    event.preventDefault();
    const link = url.trim();
    if (link !== '' && !locked) {
      onload(link);
    }
  }

  function removeSlot(): void {
    if (!locked) {
      onremove?.();
    }
  }
</script>

<!-- The form and the loaded deck cross-fade in place, one over the other, as a deck loads or the
     player changes it. Both are one line of the same height, so that nothing under the slot moves;
     only an error adds lines under the form. -->
<div class="slot">
  {#if showForm}
    <div class="pane" transition:swapFade>
      <!-- Busy, the form leaves out the status line below: a busy region may hold back what it
           announces. The field's name is for screen readers only: its placeholder says it all. -->
      <form class="form" onsubmit={load} aria-busy={loading || undefined}>
        <label class="sr-only" for={inputId}>{label}</label>
        <input
          id={inputId}
          type="text"
          {placeholder}
          readonly={loading}
          bind:value={url}
          bind:this={input}
        />
        <!-- A square as tall as the field; while its load is in flight, the spinner takes the
             icon's place. aria-disabled rather than disabled meanwhile: the button keeps the
             focus. -->
        <button
          class="btn load"
          type="submit"
          data-tip={loadLabel}
          aria-label={loadLabel}
          disabled={url.trim() === ''}
          aria-disabled={locked}
        >
          {#if loading}
            <span class="spinner"></span>
          {:else}
            <Icon name="arrow-right" />
          {/if}
        </button>
        {#if changingFrom !== null}
          <button
            class="btn-ghost tool"
            type="button"
            data-tip="Cancel"
            aria-label="Cancel"
            disabled={loading}
            onclick={() => (changingFrom = null)}
          >
            <Icon name="undo" />
          </button>
        {:else if !deck.ready}
          {@render remove()}
        {/if}
      </form>
      <!-- Always there while the form shows: a live region must exist before what it announces.
           Only screen readers get it; the spinner in Load shows the load. -->
      <p class="sr-only" role="status">
        {#if loading}Loading the deck…{/if}
      </p>
      {#if deckError && deckError.length > 0}
        <div class="err" role="alert">
          <b>This deck can't be used yet: {unsupportedText}</b>
          <ul>
            {#each deckError as card (card.code)}
              <li>
                <!-- The server names only the first cards; the others have just a code. -->
                <span class="q">{card.qty}×</span>{card.name || card.code}
                {#if card.pack}<span class="pk">{card.pack}</span>{/if}
              </li>
            {/each}
          </ul>
          <p>
            Remove {unsupportedCount === 1 ? 'it' : 'them'} from the deck, or pick another deck.
          </p>
        </div>
      {:else if error}
        <p class="err" role="alert">{error}</p>
      {/if}
    </div>
  {:else}
    <div class="pane loaded" transition:swapFade>
      <HeroThumb image={deck.heroImage} name={deck.heroName} />
      <!-- The view carries no card count for a deck, so none is shown. -->
      <DeckNames heroName={deck.heroName ?? ''} deckName={deck.deckName ?? ''} />
      <div class="tools">
        <button
          class="btn-ghost tool"
          data-tip={changeLabel}
          aria-label={changeLabel}
          onclick={() => (changingFrom = signature)}
        >
          <Icon name="pencil" />
        </button>
        {@render remove()}
      </div>
    </div>
  {/if}
</div>

{#snippet remove()}
  {#if onremove}
    <button
      class="btn-ghost tool"
      type="button"
      data-tip={removeLabel}
      aria-label={removeLabel}
      aria-disabled={locked}
      onclick={removeSlot}
    >
      <Icon name="trash" />
    </button>
  {/if}
{/snippet}

<style>
  /* Both panes share the one cell, at its top, while one fades out as the other fades in. */
  .slot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }

  .pane {
    grid-area: 1 / 1;
    align-self: start;
    min-width: 0;
  }

  /*
    One 44px line at every width: the field, then the Load, Cancel and remove icon buttons. The
    field stands further from Load than Load from the next icon: 12px, clear of the focus outline.
  */
  .form {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
  }

  .form input {
    flex: 1;
    min-width: 0;
    margin-right: 4px;
  }

  /* `.btn.load` outweighs the lobby's `.btn` padding. */
  .form .btn.load {
    flex: none;
    width: 44px;
    padding: 0;
  }

  .load :global(svg) {
    width: 18px;
    height: 18px;
    stroke-width: 2;
  }

  /* A ring with one side left open, turning. */
  .spinner {
    flex: none;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  /* Without motion, the ring stands still and slowly fades in and out. */
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: pulse 1.6s ease-in-out infinite alternate;
    }
  }

  @keyframes pulse {
    to {
      opacity: 0.4;
    }
  }

  /* As tall as the form, so that the slot keeps its height as a deck loads or is changed. */
  .loaded {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 44px;
    min-width: 0;
  }

  /* The slot's icon buttons, change and remove, side by side, reaching into the card's padding by
     their own (8px): their 16px icons end on its edge, as the Load button does. */
  .tools {
    flex: none;
    display: flex;
    gap: 2px;
    margin-right: -8px;
  }

  .tool {
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    color: var(--muted);
    display: grid;
    place-items: center;
  }

  .tool :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }

  /* In the form too, the icon button reaches into the card's padding by its own. */
  .form .tool {
    margin-right: -8px;
  }

  .err {
    margin: 10px 0 0;
    border: 1px solid #6a2e3a;
    background: #2a1520;
    color: var(--error-text);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .err b {
    display: block;
    margin-bottom: 4px;
  }

  /* A long list scrolls. */
  .err ul {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 120px;
    overflow-y: auto;
  }

  .err li {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    border-top: 1px solid #4a2230;
  }

  .err li:first-child {
    border-top: 0;
  }

  .err .q {
    color: #ff8fa3;
    flex: none;
    min-width: 22px;
  }

  .err .pk {
    margin-left: auto;
    color: #c9808f;
    flex: none;
  }

  .err p {
    margin: 6px 0 0;
    color: #c9808f;
  }
</style>
