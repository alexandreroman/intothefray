<script lang="ts">
  import { createGame } from '../lib/api';
  import { playerName } from '../lib/names';
  import { setToken } from '../lib/prefs';
  import { go } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';

  let starting = $state(false);
  let error = $state('');

  async function startGame(name: string): Promise<void> {
    starting = true;
    error = '';
    try {
      const game = await createGame(name);
      setToken(game.id, game.token);
      go(`/g/${encodeURIComponent(game.id)}`);
    } catch (e) {
      error = `Could not start a game: ${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      starting = false;
    }
  }

  function onStart(): void {
    void startGame(playerName());
  }
</script>

<div class="home table-bg">
  <section>
    <div>
      <h1>INTO <span>THE</span> FRAY</h1>
      <p class="tagline">A Marvel Champions table in your browser</p>
    </div>
    <nav>
      <button class="primary" disabled={starting} onclick={onStart}>
        <Icon name="cards" />Start a game
      </button>
      <button onclick={() => go('/options')}><Icon name="sliders" />Options</button>
    </nav>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </section>
</div>

<style>
  .home {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px 16px;
  }

  section {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    animation: rise 0.25s ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  h1 {
    margin: 0;
    font-weight: 800;
    letter-spacing: 2px;
    font-size: clamp(30px, 8vw, 44px);
    text-align: center;
    line-height: 1.1;
  }

  h1 span {
    color: var(--accent);
  }

  .tagline {
    margin: 8px 0 0;
    color: var(--muted);
    text-align: center;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(280px, 100%);
  }

  nav button {
    padding: 12px 16px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  nav button :global(svg) {
    width: 20px;
    height: 20px;
    color: var(--muted);
  }

  nav .primary {
    background: #23406a;
    border-color: var(--sel);
  }

  nav .primary :global(svg) {
    color: var(--text);
  }

  .error {
    margin: 0;
    color: var(--accent);
    text-align: center;
  }
</style>
