<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import Icon from './Icon.svelte';

  let {
    spectators,
    side,
    onend,
  }: {
    spectators: number;
    /** The side panel toggle, on the table only. */
    side?: { hidden: boolean; ontoggle: () => void };
    /** Ends the game for everyone, once confirmed. Given to the host only. */
    onend?: () => void;
  } = $props();

  const spectatorLabel = $derived(`${spectators} ${spectators === 1 ? 'spectator' : 'spectators'}`);

  let confirmingEnd = $state(false);

  function endGame(): void {
    confirmingEnd = false;
    onend?.();
  }

  const FALLBACK_CLASS = 'fs-fallback';

  let native = $state(Boolean(document.fullscreenElement));
  // On the body rather than in this component: the lobby and the table each
  // have their own top bar, and the fallback outlives either.
  let fallback = $state(document.body.classList.contains(FALLBACK_CLASS));
  const fullscreen = $derived(native || fallback);
  const fullscreenLabel = $derived(fullscreen ? 'Exit fullscreen' : 'Fullscreen');

  function syncFullscreen(): void {
    native = Boolean(document.fullscreenElement);
  }

  function setFallback(on: boolean): void {
    fallback = on;
    document.body.classList.toggle(FALLBACK_CLASS, on);
  }

  function toggleFullscreen(): void {
    if (fallback) {
      setFallback(false);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else if (document.documentElement.requestFullscreen) {
      // A request can be denied (no user gesture, a policy of the embedding page).
      void document.documentElement.requestFullscreen().catch(() => setFallback(true));
    } else {
      // Not every browser offers the Fullscreen API (iPhone Safari, some embedded views).
      setFallback(true);
    }
  }
</script>

<svelte:document onfullscreenchange={syncFullscreen} />

<header>
  <div class="logo">INTO <span>THE</span> FRAY</div>
  <div class="actions">
    {#if spectators > 0}
      <span class="pill" role="img" aria-label={spectatorLabel} title={spectatorLabel}>
        <Icon name="eye" />
        {spectators}
      </span>
    {/if}
    <button
      class="icon-button fullscreen"
      class:active={fullscreen}
      aria-label={fullscreenLabel}
      title={fullscreenLabel}
      onclick={toggleFullscreen}
    >
      <Icon name={fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
    </button>
    {#if onend}
      <button
        class="icon-button"
        aria-label="End game"
        title="End game"
        onclick={() => (confirmingEnd = true)}
      >
        <Icon name="power" />
      </button>
    {/if}
    {#if side}
      <button
        class="icon-button"
        aria-label="Preview and history"
        aria-pressed={!side.hidden}
        title={side.hidden ? 'Show the preview and history' : 'Hide the preview and history'}
        onclick={side.ontoggle}
      >
        <!-- A window with its right pane, filled while the panel shows. -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path
            class="pane"
            class:filled={!side.hidden}
            d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4z"
            fill="currentColor"
            stroke="none"
          />
          <path d="M15 4v16" />
        </svg>
      </button>
    {/if}
  </div>
</header>

{#if confirmingEnd}
  <ConfirmDialog
    question="End this game for everyone?"
    confirmLabel="End game"
    danger
    onconfirm={endGame}
    oncancel={() => (confirmingEnd = false)}
  />
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .logo {
    font-weight: 800;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .logo span {
    color: var(--accent);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  /* Buttons in the row share one height: the pill matches them. */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 33px;
    padding: 0 12px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
  }

  .pill :global(svg) {
    width: 17px;
    height: 17px;
  }

  .actions button {
    height: 33px;
  }

  .icon-button {
    flex: none;
    width: 33px;
    padding: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button :global(svg) {
    width: 19px;
    height: 19px;
    display: block;
  }

  .pane {
    fill-opacity: 0;
    transition: fill-opacity 0.25s;
  }

  .pane.filled {
    fill-opacity: 0.35;
  }

  /*
   * A narrow bar drops its least useful items first: Fullscreen, then the
   * spectator count. End game and the side panel toggle always stay. Fullscreen
   * stays while active, or the fallback could not be left.
   */
  @media (max-width: 600px) {
    .fullscreen:not(.active) {
      display: none;
    }
  }

  @media (max-width: 400px) {
    .pill {
      display: none;
    }
  }
</style>
