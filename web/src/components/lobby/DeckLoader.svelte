<script lang="ts">
  import type { DeckView, UnsupportedCard } from '../../lib/types';
  import HeroThumb from './HeroThumb.svelte';

  /**
   * One deck slot of the viewer. `slot` is the 1-based number shown when the
   * player has several decks, null with a single one; `onremove` is given only
   * when the slot can be removed.
   */
  let {
    deck,
    slot,
    deckError,
    error,
    onload,
    onremove,
  }: {
    deck: DeckView;
    slot: number | null;
    deckError: UnsupportedCard[] | null;
    error: string | null;
    onload: (url: string) => void;
    onremove?: () => void;
  } = $props();

  const inputId = $props.id();

  let url = $state('');
  // The deck being replaced after Change: the form shows until another deck arrives.
  let changingFrom = $state<string | null>(null);

  const label = $derived(slot === null ? 'Deck link' : `Deck ${slot} link`);
  const removeLabel = $derived(slot === null ? 'Remove this deck' : `Remove deck ${slot}`);
  const signature = $derived(JSON.stringify([deck.hero, deck.deckName]));
  const showForm = $derived(!deck.ready || changingFrom === signature);
  const unsupportedCount = $derived(deckError?.reduce((sum, card) => sum + card.qty, 0) ?? 0);
  const unsupportedText = $derived(
    unsupportedCount === 1
      ? "1 card isn't supported."
      : `${unsupportedCount} cards aren't supported.`,
  );

  function load(event: SubmitEvent): void {
    event.preventDefault();
    const link = url.trim();
    if (link !== '') {
      onload(link);
    }
  }
</script>

<div class="sect slot">
  {#if showForm}
    <div class="lblrow">
      <label class="lbl" for={inputId}>{label}</label>
      {@render remove()}
    </div>
    <form class="row" onsubmit={load}>
      <input id={inputId} type="text" placeholder="Paste a deck link…" bind:value={url} />
      <button class="btn" type="submit" disabled={url.trim() === ''}>Load</button>
      {#if changingFrom !== null}
        <button class="btn" type="button" onclick={() => (changingFrom = null)}>Cancel</button>
      {/if}
    </form>
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
      <HeroThumb image={deck.heroImage} name={deck.heroName} large />
      <div class="info">
        <b>{deck.heroName}</b>
        <!-- The view carries no card count for a deck, so none is shown. -->
        <span>{deck.deckName}</span>
      </div>
      <button class="btn" onclick={() => (changingFrom = signature)}>Change</button>
      {@render remove()}
    </div>
  {/if}
</div>

{#snippet remove()}
  {#if onremove}
    <button
      class="btn-ghost remove"
      data-tip={removeLabel}
      aria-label={removeLabel}
      onclick={onremove}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
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

  .loaded {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .info b {
    display: block;
    font-size: 17px;
  }

  .info span {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .remove {
    flex: none;
    width: 32px;
    height: 32px;
    margin-top: -8px;
    padding: 0;
    color: var(--faint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loaded .remove {
    margin-top: 0;
  }

  .remove svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  .err {
    margin: 10px 0 0;
    border: 1px solid #6a2e3a;
    background: #2a1520;
    color: #ffb3c0;
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
