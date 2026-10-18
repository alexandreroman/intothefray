<script lang="ts">
  import { onMount } from 'svelte';
  import DeckLoader from '../components/lobby/DeckLoader.svelte';
  import ScenarioPicker from '../components/lobby/ScenarioPicker.svelte';
  import Seats from '../components/lobby/Seats.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { loadIndex } from '../lib/catalog';
  import type { GameSession } from '../lib/session.svelte';
  import type { Index, View } from '../lib/types';

  let { session, view }: { session: GameSession; view: View } = $props();

  let index = $state.raw<Index | null>(null);
  let indexError = $state(false);

  onMount(() => {
    loadIndex()
      .then((loaded) => (index = loaded))
      .catch(() => (indexError = true));
  });

  const hostName = $derived(view.players.find((p) => p.host)?.name ?? 'the host');
  const me = $derived(
    view.you.role === 'player' ? view.players.find((p) => p.color === view.you.color) : undefined,
  );
  const missingDecks = $derived(
    view.players.filter((p) => !p.ready).map((p) => (p.color === me?.color ? 'you' : p.name)),
  );
  const canStart = $derived(missingDecks.length === 0 && view.config.scenario !== '');

  const reason = $derived.by(() => {
    if (missingDecks.length > 0) {
      return `Waiting for a deck from ${missingDecks.join(' and ')}.`;
    }
    if (view.config.scenario === '') {
      return view.you.host
        ? 'Choose a scenario first.'
        : `Waiting for ${hostName} to choose a scenario.`;
    }
    return view.you.host
      ? 'Everyone is ready.'
      : `Everyone is ready — waiting for ${hostName} to set up the table.`;
  });

  // A failed deck import shows under the deck field; anything else in the start bar.
  const deckLoadError = $derived(session.deckLoadError?.message ?? null);
  const otherError = $derived(session.lastError?.message ?? null);
</script>

<div class="screen">
  <TopBar spectators={view.spectators} />

  <main class="lobby">
    {#if index}
      <ScenarioPicker
        {view}
        {index}
        onconfigure={(config) => session.lobby('configure', { config })}
      />
    {:else}
      <section class="card-box">
        <div class="bhead"><b>Scenario</b></div>
        <div class="sect">
          <p class="aside">
            {indexError
              ? 'The scenarios could not be loaded. Reload the page.'
              : 'Loading scenarios…'}
          </p>
        </div>
      </section>
    {/if}

    <div class="column">
      <Seats
        {view}
        onremove={(color) => session.lobby('removePlayer', { color })}
        onleave={() => session.lobby('leave')}
        ontakeseat={() => session.lobby('takeSeat')}
      />
      {#if me}
        <DeckLoader
          {me}
          deckError={session.deckError}
          error={deckLoadError}
          onload={(url) => session.lobby('setDeck', { url })}
        />
      {/if}
    </div>
  </main>

  <div class="startbar">
    {#if otherError}
      <span class="why error" role="alert">{otherError}</span>
    {:else}
      <span class="why">{reason}</span>
    {/if}
    {#if view.you.host}
      <button class="go" disabled={!canStart} onclick={() => session.lobby('start')}
        >Set up the table</button
      >
    {/if}
  </div>
</div>

<style>
  .screen {
    min-height: 100vh;
  }

  .lobby {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px 16px 120px;
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 860px) {
    .lobby {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .column {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Box primitives shared by the lobby components. */
  .lobby :global(.card-box) {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
  }

  .lobby :global(.bhead) {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 14px 16px 0;
  }

  .lobby :global(.bhead b) {
    font-size: 16px;
  }

  .lobby :global(.aside) {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }

  .lobby :global(.sect) {
    padding: 12px 16px 16px;
  }

  .lobby :global(.sect + .sect) {
    border-top: 1px solid var(--line);
  }

  .lobby :global(.lbl) {
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: baseline;
    gap: 4px 8px;
    flex-wrap: wrap;
  }

  .lobby :global(.hint) {
    color: var(--muted);
    font-size: 12px;
    margin-top: 8px;
  }

  p {
    margin: 0;
  }

  .startbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #171e2ef2;
    border-top: 1px solid var(--line);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    backdrop-filter: blur(6px);
  }

  .why {
    color: var(--muted);
    font-size: 13px;
  }

  .why.error {
    color: #ffb3c0;
  }

  .go {
    background: #23406a;
    border-color: var(--sel);
    font-weight: 700;
    font-size: 15px;
    padding: 10px 22px;
    border-radius: 10px;
  }
</style>
