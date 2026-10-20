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
    <span class="caption">Game not found</span>
    <p>This game doesn't exist or has expired.</p>
    <a class="btn-primary" href={href('/')}>Back to home</a>
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
    gap: 16px;
    padding: 24px 16px;
    text-align: center;
  }

  p {
    margin: 0;
  }

  .message p {
    color: var(--muted);
    font-size: 16px;
  }

  /* A link drawn as the primary button. */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  .status {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 14px;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
    /* Over the top bar, which may float over the page (100), under the dialogs (5600). */
    z-index: 200;
  }
</style>
