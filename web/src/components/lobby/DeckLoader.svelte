<script lang="ts">
  import type { PlayerView, UnsupportedCard } from '../../lib/types';
  import HeroThumb from './HeroThumb.svelte';

  let {
    me,
    deckError,
    error,
    onload,
  }: {
    me: PlayerView;
    deckError: UnsupportedCard[] | null;
    error: string | null;
    onload: (url: string) => void;
  } = $props();

  const inputId = $props.id();

  let url = $state('');
  // The deck being replaced after Change: the form shows until another deck arrives.
  let changingFrom = $state<string | null>(null);

  const signature = $derived(JSON.stringify([me.hero, me.deckName]));
  const showForm = $derived(!me.ready || changingFrom === signature);
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

<section class="card-box" style:--pc="var(--p{me.color + 1})">
  <div class="bhead"><h2>Your deck</h2></div>
  <div class="sect">
    {#if showForm}
      <label class="lbl" for={inputId}>Deck link</label>
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
        <HeroThumb image={me.heroImage} name={me.heroName} large />
        <div class="info">
          <b>{me.heroName}</b>
          <!-- The view carries no card count for a deck, so none is shown. -->
          <span>{me.deckName}</span>
        </div>
        <button class="btn" onclick={() => (changingFrom = signature)}>Change</button>
      </div>
    {/if}
  </div>
</section>

<style>
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
