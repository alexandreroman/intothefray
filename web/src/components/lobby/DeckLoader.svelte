<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { DeckView, UnsupportedCard } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import DeckNames from './DeckNames.svelte';
  import HeroThumb from './HeroThumb.svelte';

  /**
   * One deck slot of the viewer. `slot` is the 1-based number shown when the
   * player has several decks, null with a single one; `onremove` is given only
   * when the slot can be removed. `autofocus` focuses the deck link as the slot
   * mounts. `loading` tells that the slot's deck load is in flight: the form
   * then waits for its answer. `locked` tells that a deck load is in flight,
   * this slot's or another's: meanwhile the slot can neither start a load nor
   * be removed, and only the loading slot shows the load. `loaded` counts the
   * loads the server confirmed while this slot is the one loading, and is
   * undefined for the other slots: each new one closes a Change in progress
   * and clears the field, which shows a reload of the same deck, whose view
   * looks as before.
   */
  let {
    deck,
    slot,
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
    slot: number | null;
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

  const label = $derived(slot === null ? 'Deck link' : `Deck ${slot} link`);
  const removeLabel = $derived(slot === null ? 'Remove this deck' : `Remove deck ${slot}`);
  const changeLabel = $derived(slot === null ? 'Change deck' : `Change deck ${slot}`);
  const signature = $derived(JSON.stringify([deck.hero, deck.deckName]));
  const showForm = $derived(!deck.ready || changingFrom === signature);
  const inFlight = $derived(loading || locked);
  const unsupportedCount = $derived(deckError?.reduce((sum, card) => sum + card.qty, 0) ?? 0);
  const unsupportedText = $derived(
    unsupportedCount === 1
      ? "1 card isn't supported."
      : `${unsupportedCount} cards aren't supported.`,
  );

  onMount(async () => {
    if (!autofocus) {
      return;
    }
    // The input shows once the first render settles.
    await tick();
    input?.focus();
    input?.select();
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
    if (link !== '' && !inFlight) {
      onload(link);
    }
  }

  function removeSlot(): void {
    if (!inFlight) {
      onremove?.();
    }
  }
</script>

<div class="sect slot">
  {#if showForm}
    <div class="lblrow">
      <label class="lbl" for={inputId}>{label}</label>
      {@render remove()}
    </div>
    <!-- Busy, the form leaves out the status line below: a busy region may hold back what it
         announces. -->
    <form class="row" onsubmit={load} aria-busy={loading || undefined}>
      <input
        id={inputId}
        type="text"
        placeholder="Paste a deck link…"
        readonly={loading}
        bind:value={url}
        bind:this={input}
      />
      <!-- aria-disabled rather than disabled while a load is in flight: the button keeps the focus. -->
      <button class="btn" type="submit" disabled={url.trim() === ''} aria-disabled={inFlight}>
        <!-- Both labels share one cell, so that the button keeps its width. Hidden, the other label
             is left out of the button's name too. -->
        <span class="labels">
          <span style:visibility={loading ? 'hidden' : undefined}>Load</span>
          <span class="busy" style:visibility={loading ? undefined : 'hidden'}>
            <span class="spinner"></span>Loading
          </span>
        </span>
      </button>
      {#if changingFrom !== null}
        <button class="btn" type="button" disabled={loading} onclick={() => (changingFrom = null)}>
          Cancel
        </button>
      {/if}
    </form>
    <!-- Always there while the form shows: a live region must exist before what it announces. Only
         screen readers get it; the Loading button shows the load. -->
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
  {:else}
    <div class="loaded">
      <HeroThumb image={deck.heroImage} name={deck.heroName} />
      <!-- The view carries no card count for a deck, so none is shown. -->
      <DeckNames heroName={deck.heroName ?? ''} deckName={deck.deckName ?? ''} />
      <div class="tools">
        <button
          class="btn-ghost tool change"
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
      class="btn-ghost tool remove"
      data-tip={removeLabel}
      aria-label={removeLabel}
      aria-disabled={inFlight}
      onclick={removeSlot}
    >
      <Icon name="cross" />
    </button>
  {/if}
{/snippet}

<style>
  /* The label shares its line with the remove button. */
  .lblrow {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .row button {
    flex: none;
  }

  /* The field stands further from Load than Load from Cancel: 12px, clear of the focus outline. */
  .row input {
    margin-right: 4px;
  }

  .labels {
    display: grid;
    justify-items: center;
  }

  .labels > * {
    grid-area: 1 / 1;
  }

  .busy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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

  .loaded {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  /* The names stand wider apart from the hero image than from the buttons. */
  .loaded > :global(.names) {
    margin-left: 6px;
  }

  /*
    The slot's icon buttons, change and remove, side by side. Their glyphs line up with the
    section's edge: the buttons reach into its padding by their own inset.
  */
  .tools {
    flex: none;
    display: flex;
    margin-right: -7px;
  }

  .tool {
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    color: var(--faint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* Alone beside the label, the remove button stays on the label's line. */
  .lblrow .tool {
    margin: -6px -7px 0 0;
  }

  /* Icon draws at 1.25em: a 15px pencil, beside the 14px cross. */
  .change {
    font-size: 12px;
  }

  .remove :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 2.2;
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
