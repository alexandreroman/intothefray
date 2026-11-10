<script lang="ts">
  import { onMount } from 'svelte';
  import DeckLoader from '../components/lobby/DeckLoader.svelte';
  import Icon from '../components/Icon.svelte';
  import ScenarioPicker from '../components/lobby/ScenarioPicker.svelte';
  import Seats from '../components/lobby/Seats.svelte';
  import TopBar from '../components/TopBar.svelte';
  import { loadIndex } from '../lib/catalog';
  import type { GameSession } from '../lib/session.svelte';
  import { hostName, type DeckView, type Index, type View } from '../lib/types';
  import type { Rect } from '../lib/rect';
  import type { SlotRemoval } from '../lib/slotKeys';

  let { session, view }: { session: GameSession; view: View } = $props();

  let index = $state.raw<Index | null>(null);
  let indexError = $state(false);

  onMount(() => {
    loadIndex()
      .then((loaded) => (index = loaded))
      .catch(() => (indexError = true));
  });

  const me = $derived(
    view.you.role === 'player' ? view.players.find((p) => p.color === view.you.color) : undefined,
  );
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
  const chosenScenario = $derived(index?.scenarios.find((s) => s.id === view.config.scenario));
  // A scenario played with main scheme sets, like a Fear No Evil Underling, needs one: it is the
  // scenario.
  const mainSchemes = $derived(chosenScenario?.mainSchemes ?? []);
  const missingMainScheme = $derived(
    mainSchemes.length > 0 && !view.config.modulars.some((code) => mainSchemes.includes(code)),
  );
  // Such a scenario recommends no modular set, yet needs one besides its main scheme set. Any other
  // scenario that recommends none, like Wrecking Crew, may start without one. While the index is
  // unknown, the scenario is taken to need one. A self-contained scenario never takes one.
  const needsModular = $derived(
    chosenScenario === undefined ||
      mainSchemes.length > 0 ||
      (!chosenScenario.selfContained && chosenScenario.recommended.length > 0),
  );
  const missingModular = $derived(needsModular && chosenModularCount() === 0);

  /** The number of chosen modular sets. Beside a main scheme set, only a set of kind modular counts. */
  function chosenModularCount(): number {
    if (mainSchemes.length === 0) {
      return view.config.modulars.length;
    }
    return view.config.modulars.filter(
      (code) => index?.sets.find((s) => s.code === code)?.kind === 'modular',
    ).length;
  }

  const canStart = $derived(
    missingDecks.length === 0 &&
      view.config.scenario !== '' &&
      !missingModular &&
      !missingMainScheme,
  );

  const reason = $derived.by(() => {
    if (missingDecks.length > 0) {
      return `Waiting for ${new Intl.ListFormat('en').format(missingDecks)}.`;
    }
    if (view.config.scenario === '') {
      return view.you.host
        ? 'Choose a scenario first.'
        : `Waiting for ${hostName(view)} to choose a scenario.`;
    }
    if (missingMainScheme) {
      return view.you.host
        ? 'Choose a main scheme set.'
        : `Waiting for ${hostName(view)} to choose a main scheme set.`;
    }
    if (missingModular) {
      return view.you.host
        ? 'Choose at least one modular set.'
        : `Waiting for ${hostName(view)} to choose at least one modular set.`;
    }
    return view.you.host
      ? 'Everyone is ready.'
      : `Everyone is ready: waiting for ${hostName(view)} to set up the table.`;
  });

  // A failed deck import shows under the field of the slot it was loading; anything else in the start area.
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
  // one has the new slot last, and its deck link takes the focus as it mounts. Only a new slot
  // mounts, so the value can stay once the slot is there.
  let addingFrom = $state<number | null>(null);
  // The own slot the viewer asked to remove, with their slot count then: the view that shows one
  // fewer drops that slot, and the seats keep the others as they are (Seats).
  let removing = $state<SlotRemoval | null>(null);
  const focusSlot = $derived(
    addingFrom !== null && me?.decks.length === addingFrom + 1 ? addingFrom : null,
  );

  // A failed Add a deck brings no new slot, nor a failed Remove deck one fewer.
  $effect(() => {
    if (session.lastError !== null) {
      addingFrom = null;
      removing = null;
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
      removing = null;
    }
  }

  let topBar = $state<HTMLElement>();

  // The room the scenario's Add a set menu stays within: the window, less what the top bar covers
  // at the top, or once it is slid or scrolled away, the status bar's room (--status-room,
  // tokens.css), which the bar pads its top by (TopBar.svelte).
  function menuRoom(): Rect {
    const header = topBar?.firstElementChild;
    const topBarBottom = header?.getBoundingClientRect().bottom ?? 0;
    const topInset = header ? parseFloat(getComputedStyle(header).paddingTop) || 0 : 0;
    return {
      left: 0,
      top: Math.max(topInset, topBarBottom),
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }

  function removeDeck(slot: number): void {
    addingFrom = null;
    loadingSlot = null;
    removing = me ? { slot, from: me.decks.length } : null;
    session.lobby('removeDeck', { deck: slot });
  }
</script>

<div class="screen screen-page">
  <div class="topbar" bind:this={topBar}>
    <TopBar
      spectators={view.spectators}
      onend={view.you.host ? () => session.lobby('end') : undefined}
      endLabel="Close the lobby"
      endQuestion="Close the lobby?"
      endDetail="This ends the game for everyone."
    />
  </div>

  <main class="lobby screen-column">
    <header class="heading">
      <span class="caption">Lobby</span>
      <h1 class="display">ASSEMBLE YOUR TEAM</h1>
    </header>

    <Seats
      {view}
      onremove={(color) => session.lobby('removePlayer', { color })}
      onleave={() => session.lobby('leave')}
      ontakeseat={() => session.lobby('takeSeat')}
      onadddeck={addDeck}
      addLocked={session.deckLoading}
      ownRemoval={removing}
      {ownSlot}
    />

    {#if index}
      <ScenarioPicker
        {view}
        {index}
        onconfigure={(config) => session.lobby('configure', { config })}
        room={menuRoom}
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

    <div class="start">
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
  </main>
</div>

<!-- One of the viewer's deck slots, inside their player card. -->
{#snippet ownSlot(deck: DeckView, slot: number)}
  {@const several = (me?.decks.length ?? 0) > 1}
  <!-- The seats key each slot (Seats): a slot keeps its DeckLoader as long as it stays, under a
       new index once an earlier one is removed, and the removed slot's goes with it. -->
  <DeckLoader
    {deck}
    number={several ? slot + 1 : null}
    deckError={slot === (loadingSlot ?? 0) ? session.deckError : null}
    error={slot === (loadingSlot ?? 0) ? deckLoadError : null}
    loading={session.deckLoading && slot === loadingSlot}
    locked={session.deckLoading}
    loaded={slot === loadingSlot ? session.deckLoaded : undefined}
    onload={(url) => loadDeck(slot, url)}
    onremove={several ? () => removeDeck(slot) : undefined}
    autofocus={slot === focusSlot}
  />
{/snippet}

<style>
  /*
    One column of areas, its width and gutter shared with the top bar: the whole window with 16px
    gutters on a phone, 860px with 24px from a 600px window, 1120px with 32px from 1100px. The page
    scrolls as a whole.
  */
  .screen {
    --content-max: 100%;
    --content-gutter: 16px;
  }

  @media (min-width: 600px) {
    .screen {
      --content-max: 860px;
      --content-gutter: 24px;
    }
  }

  @media (min-width: 1100px) {
    .screen {
      --content-max: 1120px;
      --content-gutter: 32px;
    }
  }

  /* Holds the top bar only to reach its box: it has none of its own, so the bar stays sticky to
     the screen on a small one. */
  .topbar {
    display: contents;
  }

  /* The last area stays clear of the home indicator. Every box pads its sides by --box-pad, so a
     box's title, its controls and its content share one left and one right edge. */
  .lobby {
    --box-pad: 18px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-block: 16px max(24px, env(safe-area-inset-bottom));
  }

  @media (min-width: 600px) {
    .lobby {
      --box-pad: 22px;
      gap: 18px;
      padding-block: 24px max(28px, env(safe-area-inset-bottom));
    }
  }

  .heading {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .heading .caption {
    flex: none;
  }

  h1 {
    font-size: 28px;
  }

  @media (min-width: 600px) {
    h1 {
      font-size: 36px;
    }
  }

  /* Box primitives shared by the lobby components. */
  .lobby :global(.card-box) {
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .lobby :global(.bhead) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 50px;
    padding: 14px var(--box-pad) 0;
  }

  .lobby :global(.bhead h2) {
    margin: 0;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 19px;
  }

  .lobby :global(.aside) {
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }

  .lobby :global(.sect) {
    padding: 12px var(--box-pad) 18px;
  }

  @media (min-width: 600px) {
    .lobby :global(.bhead) {
      padding: 16px var(--box-pad) 0;
    }

    .lobby :global(.sect) {
      padding: 14px var(--box-pad) 22px;
    }
  }

  .lobby :global(.lbl) {
    display: block;
    margin-bottom: 8px;
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

  /* The start area ends the column: the readiness line, and the host's button beside it, or
     under it on a phone, as wide as the box. */
  .start {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px 20px;
    padding: 14px var(--box-pad);
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--bg);
  }

  @media (min-width: 600px) {
    .start {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding: 16px var(--box-pad);
    }
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

  .go {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .go :global(svg) {
    width: 18px;
    height: 18px;
    stroke-width: 2.4;
  }
</style>
