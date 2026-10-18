<script lang="ts">
  import NamePrompt from '../components/NamePrompt.svelte';
  import { getPref, setPref } from '../lib/prefs';
  import { GameSession } from '../lib/session.svelte';
  import Ended from './Ended.svelte';
  import Lobby from './Lobby.svelte';
  import TablePlaceholder from './TablePlaceholder.svelte';

  // The parent keys this component on the game id: one instance per game.
  let { id }: { id: string } = $props();

  let name = $state(getPref('itf-name')?.trim() ?? '');
  let session = $state.raw<GameSession | null>(null);

  // The session is created only once the viewer has a name to join with.
  $effect(() => {
    if (name === '') {
      return;
    }
    const created = new GameSession(id, name);
    session = created;
    created.connect();
    return () => {
      created.close();
    };
  });

  function onNameChosen(chosen: string): void {
    setPref('itf-name', chosen);
    name = chosen;
  }

  // Also covers the gap between the socket opening and the first view.
  const waiting = $derived(
    session?.status !== 'closed' && (session?.status !== 'open' || !session.view),
  );
  const notFound = $derived(session?.status === 'closed' && session.lastError?.code === 'notFound');
</script>

{#if name === ''}
  <NamePrompt onsubmit={onNameChosen} />
{:else if notFound}
  <div class="message table-bg">
    <p>This game doesn't exist or has expired.</p>
    <a href="#/">Back to home</a>
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
      <TablePlaceholder view={session.view} />
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
