<script lang="ts">
  import { onMount } from 'svelte';
  import DeckLoader from '../components/lobby/DeckLoader.svelte';
  import Icon from '../components/Icon.svelte';
  import ScenarioPicker from '../components/lobby/ScenarioPicker.svelte';
  import Seats from '../components/lobby/Seats.svelte';
  import Tooltip from '../components/Tooltip.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { loadIndex } from '../lib/catalog';
  import { playerColorVar } from '../lib/playerColor';
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

  const MAX_DECKS = 4;

  const hostName = $derived(view.players.find((p) => p.host)?.name ?? 'the host');
  const me = $derived(
    view.you.role === 'player' ? view.players.find((p) => p.color === view.you.color) : undefined,
  );
  const deckCount = $derived(view.players.reduce((sum, p) => sum + p.decks.length, 0));
  // "your deck", "Sam's deck", "Jo's 2 decks": one phrase per player still missing a deck.
  const missingDecks = $derived(
    view.players.flatMap((p) => {
      const missing = p.decks.filter((deck) => !deck.ready).length;
      if (missing === 0) {
        return [];
      }
      const owner = p.color === me?.color ? 'your' : `${p.name}'s`;
      return [missing === 1 ? `${owner} deck` : `${owner} ${missing} decks`];
    }),
  );
  // A scenario that recommends no modular set, like Wrecking Crew, may start without one. While the
  // index is unknown, the scenario is taken to need one.
  const chosenScenario = $derived(index?.scenarios.find((s) => s.id === view.config.scenario));
  // A self-contained scenario never takes one.
  const needsModular = $derived(
    chosenScenario === undefined ||
      (!chosenScenario.selfContained && chosenScenario.recommended.length > 0),
  );
  const missingModular = $derived(needsModular && view.config.modulars.length === 0);
  const canStart = $derived(
    missingDecks.length === 0 && view.config.scenario !== '' && !missingModular,
  );

  const reason = $derived.by(() => {
    if (missingDecks.length > 0) {
      return `Waiting for ${new Intl.ListFormat('en').format(missingDecks)}.`;
    }
    if (view.config.scenario === '') {
      return view.you.host
        ? 'Choose a scenario first.'
        : `Waiting for ${hostName} to choose a scenario.`;
    }
    if (missingModular) {
      return view.you.host
        ? 'Choose at least one modular set.'
        : `Waiting for ${hostName} to choose at least one modular set.`;
    }
    return view.you.host
      ? 'Everyone is ready.'
      : `Everyone is ready: waiting for ${hostName} to set up the table.`;
  });

  const intro = $derived.by(() => {
    if (view.you.host) {
      return 'You are the host: you choose the scenario, and everyone sees it. Each player brings their own deck.';
    }
    if (view.you.role === 'spectator') {
      return `You are watching: ${hostName} chooses the scenario, and each player brings their own deck.`;
    }
    return `${hostName} is the host: they choose the scenario, and everyone sees it. Bring your own deck.`;
  });

  // A failed deck import shows under the field of the slot it was loading; anything else in the start bar.
  const deckLoadError = $derived(session.deckLoadError?.message ?? null);
  const otherError = $derived(session.lastError?.message ?? null);
  // The slot whose load is under way or failed, null before any load. A removal shifts the slots,
  // so it starts over, and an error goes to the first slot.
  let loadingSlot = $state<number | null>(null);

  function loadDeck(slot: number, url: string): void {
    loadingSlot = slot;
    session.lobby('setDeck', { url, deck: slot });
  }

  // The own slot count when the viewer asked for one more deck. The view that shows that many plus
  // one has the new slot last, and its deck link takes the focus as it mounts. The slots remount
  // only when their count changes, so the value can stay once the slot is there.
  let addingFrom = $state<number | null>(null);
  const focusSlot = $derived(
    addingFrom !== null && me?.decks.length === addingFrom + 1 ? addingFrom : null,
  );

  // A failed Add a deck brings no new slot.
  $effect(() => {
    if (session.lastError !== null) {
      addingFrom = null;
    }
  });

  // While a deck load is in flight, the slots stay as they are: none is added nor removed, so that
  // none remounts or shifts under the load.
  function addDeck(): void {
    if (session.deckLoading) {
      return;
    }
    if (me && session.lobby('addDeck')) {
      addingFrom = me.decks.length;
    }
  }

  function removeDeck(slot: number): void {
    addingFrom = null;
    loadingSlot = null;
    session.lobby('removeDeck', { deck: slot });
  }
</script>

<div class="screen">
  <TopBar
    spectators={view.spectators}
    onend={view.you.host ? () => session.lobby('end') : undefined}
    endLabel="Close the lobby"
    endQuestion="Close the lobby?"
    endDetail="This ends the game for everyone."
  />

  <main class="lobby">
    <header class="intro">
      <div class="heading">
        <span class="caption">Lobby</span>
        <h1 class="display">ASSEMBLE YOUR TEAM</h1>
      </div>
      <p>{intro}</p>
    </header>

    <div class="columns">
      <div class="wide">
        {#if index}
          <ScenarioPicker
            {view}
            {index}
            onconfigure={(config) => session.lobby('configure', { config })}
          />
        {:else}
          <section class="card-box">
            <div class="bhead"><h2>Scenario</h2></div>
            <div class="sect">
              <p class="aside">
                {indexError
                  ? 'The scenarios could not be loaded. Reload the page.'
                  : 'Loading scenarios…'}
              </p>
            </div>
          </section>
        {/if}
      </div>

      <div class="narrow">
        <Seats
          {view}
          onremove={(color) => session.lobby('removePlayer', { color })}
          onleave={() => session.lobby('leave')}
          ontakeseat={() => session.lobby('takeSeat')}
        />
        {#if me}
          {@const several = me.decks.length > 1}
          <section class="card-box decks" style:--pc={playerColorVar(me.color)}>
            <div class="bhead"><h2>Your decks</h2></div>
            <!-- The slots have no identity but their index: a new slot count remounts them, so that
                 a link typed for a removed deck does not stay in the slot that takes its place. -->
            {#key me.decks.length}
              {#each me.decks as deck, slot (slot)}
                <DeckLoader
                  {deck}
                  slot={several ? slot + 1 : null}
                  deckError={slot === (loadingSlot ?? 0) ? session.deckError : null}
                  error={slot === (loadingSlot ?? 0) ? deckLoadError : null}
                  loading={session.deckLoading && slot === loadingSlot}
                  locked={session.deckLoading}
                  loaded={slot === loadingSlot ? session.deckLoaded : undefined}
                  onload={(url) => loadDeck(slot, url)}
                  onremove={several ? () => removeDeck(slot) : undefined}
                  autofocus={slot === focusSlot}
                />
              {/each}
            {/key}
            {#if deckCount < MAX_DECKS}
              <div class="sect add-deck">
                <button class="btn add" aria-disabled={session.deckLoading} onclick={addDeck}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  Add a deck
                </button>
              </div>
            {/if}
          </section>
        {/if}
      </div>
    </div>
  </main>

  <div class="startbar">
    <div class="startbar-inner">
      {#if otherError}
        <span class="why error" role="alert">{otherError}</span>
      {:else}
        <span class="why" class:ready={canStart}><i></i>{reason}</span>
      {/if}
      {#if view.you.host}
        <button class="btn-primary go" disabled={!canStart} onclick={() => session.lobby('start')}>
          Set up the table
          <Icon name="arrow-right" />
        </button>
      {/if}
    </div>
  </div>
</div>

<Tooltip />

<style>
  /*
    The start bar sticks to the bottom of the window, at the end of a full-height column. The
    column's width and gutter are shared with the top bar.
  */
  .screen {
    --content-max: 1200px;
    --content-gutter: 24px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--table-bg);
  }

  .lobby {
    flex: 1;
    width: 100%;
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 36px var(--content-gutter) 48px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px 32px;
  }

  .heading {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .intro p {
    max-width: 420px;
    color: var(--muted);
    line-height: 1.5;
  }

  /*
    One column on a narrow window. Two side by side once the content is 944px wide (560px for the
    scenario, the gap, 360px for the players), that is from a 992px window with its gutters: both
    stretch to the taller one, the scenario box fills its column, and its villain list takes the
    room left. The list shows at least --villain-rows rows of tiles (ScenarioPicker): two when
    stacked, which is then its height, one side by side. One media query sets both the layout and
    the row count, so they always agree.
  */
  .columns {
    --villain-rows: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }

  @media (min-width: 992px) {
    .columns {
      --villain-rows: 1;
      grid-template-columns: minmax(0, 1fr) 360px;
    }
  }

  .wide {
    display: flex;
    flex-direction: column;
  }

  .wide > :global(.card-box) {
    flex-grow: 1;
  }

  .narrow {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  @media (max-width: 600px) {
    .screen {
      --content-gutter: 16px;
    }

    .lobby {
      padding-top: 24px;
      padding-bottom: 32px;
    }

    h1 {
      font-size: 44px;
    }
  }

  /* Box primitives shared by the lobby components. */
  .lobby :global(.card-box) {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 18px;
  }

  .lobby :global(.bhead) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 22px 0;
  }

  .lobby :global(.bhead h2) {
    margin: 0;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 20px;
  }

  .lobby :global(.aside) {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }

  .lobby :global(.sect) {
    padding: 16px 22px 22px;
  }

  .lobby :global(.sect + .sect) {
    border-top: 1px solid var(--panel-2);
  }

  /*
    Deck slots sit closer together than plain sections. The first slot keeps the section's top
    padding under the heading, a last slot its bottom padding at the foot of the box, and the
    Add a deck section its own top padding, so the button stands a little apart from the slots.
    That section draws no line above it: the button belongs to the slots it adds to.
  */
  .decks :global(.slot + .slot) {
    padding-top: 9px;
  }

  .decks :global(.slot:not(:last-child)) {
    padding-bottom: 9px;
  }

  .decks .sect.add-deck {
    border-top: 0;
  }

  .lobby :global(.lbl) {
    display: block;
    margin-bottom: 10px;
    color: var(--muted);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .lobby :global(.hint) {
    color: var(--muted);
    font-size: 12px;
    margin-top: 10px;
  }

  .lobby :global(input[type='text']) {
    height: 44px;
    padding: 0 14px;
    background: var(--table-bg);
  }

  /* A secondary button as tall as a field. */
  .lobby :global(.btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 44px;
    padding: 0 16px;
  }

  p {
    margin: 0;
  }

  .startbar {
    position: sticky;
    bottom: 0;
    background: #0d111beb;
    border-top: 1px solid var(--panel-2);
    backdrop-filter: blur(10px);
  }

  .startbar-inner {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 14px var(--content-gutter);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 12px 24px;
  }

  .why {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-soft);
  }

  .why i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warn);
  }

  .why.ready i {
    background: var(--ok);
  }

  .why.error {
    color: var(--error-text);
  }

  .add svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .go :global(svg) {
    width: 18px;
    height: 18px;
    stroke-width: 2.4;
  }
</style>
