<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { playerName } from '../lib/names';
  import { GameSession } from '../lib/session.svelte';
  import Table from '../table/Table.svelte';
  import Ended from './Ended.svelte';
  import Lobby from './Lobby.svelte';

  // The parent keys this component on the game id: one instance, and one session, per game.
  let { id }: { id: string } = $props();

  // Read once, on purpose: a new id is a new instance.
  const session = new GameSession(
    untrack(() => id),
    playerName(),
  );

  onMount(() => {
    session.connect();
    return () => {
      session.close();
    };
  });

  // Also covers the gap between the socket opening and the first view.
  const waiting = $derived(
    session.status !== 'closed' && (session.status !== 'open' || !session.view),
  );
  const notFound = $derived(session.status === 'closed' && session.lastError?.code === 'notFound');
</script>

{#if notFound}
  <Ended caption="Game not found" text="This game doesn't exist or has expired." />
{:else}
  {#if waiting}
    <p class="status" role="status">
      {session.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
    </p>
  {/if}
  {#if session.view}
    {#if session.view.phase === 'lobby'}
      <Lobby {session} view={session.view} />
    {:else if session.view.phase === 'playing'}
      <Table {session} view={session.view} />
    {:else}
      <Ended
        caption="Game over"
        title="THIS GAME HAS ENDED"
        text="Start a new one from the home screen."
      />
    {/if}
  {/if}
{/if}

<style>
  .status {
    position: fixed;
    top: 12px;
    margin: 0;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 14px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
    /* In the lobby, over the top bar (100) and under the dialogs (5600). The table's .app is fixed,
       a stacking context of its own, so the pill shows over the whole table, its dialogs and sheets
       included. */
    z-index: 200;
  }
</style>
