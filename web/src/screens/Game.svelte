<script lang="ts">
  import { playerName } from '../lib/names';
  import { href } from '../lib/router.svelte';
  import { GameSession } from '../lib/session.svelte';
  import Table from '../table/Table.svelte';
  import Ended from './Ended.svelte';
  import Lobby from './Lobby.svelte';

  // The parent keys this component on the game id: one instance per game.
  let { id }: { id: string } = $props();

  let session = $state.raw<GameSession | null>(null);

  $effect(() => {
    const created = new GameSession(id, playerName());
    session = created;
    created.connect();
    return () => {
      created.close();
    };
  });

  // Also covers the gap between the socket opening and the first view.
  const waiting = $derived(
    session?.status !== 'closed' && (session?.status !== 'open' || !session.view),
  );
  const notFound = $derived(session?.status === 'closed' && session.lastError?.code === 'notFound');
</script>

{#if notFound}
  <div class="message table-bg">
    <p>This game doesn't exist or has expired.</p>
    <a href={href('/')}>Back to home</a>
  </div>
{:else}
  {#if waiting}
    <p class="status" role="status">
      {session?.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
    </p>
  {/if}
  {#if session?.view}
    {#if session.view.phase === 'lobby'}
      <Lobby {session} view={session.view} />
    {:else if session.view.phase === 'playing'}
      <Table {session} view={session.view} />
    {:else}
      <Ended />
    {/if}
  {/if}
{/if}

<style>
  .message {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  p {
    margin: 0;
  }

  .status {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 14px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    z-index: 5;
  }

  a {
    color: var(--sel);
  }
</style>
