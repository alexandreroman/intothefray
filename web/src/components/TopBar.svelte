<script lang="ts">
  import type { Snippet } from 'svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let {
    spectators,
    side,
    onend,
    children,
  }: {
    spectators: number;
    /** The side panel toggle, on the table only. */
    side?: { hidden: boolean; ontoggle: () => void };
    /** Ends the game for everyone, once confirmed. Given to the host only. */
    onend?: () => void;
    children?: Snippet;
  } = $props();

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
    <span class="pill">
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {spectators}
      {spectators === 1 ? 'spectator' : 'spectators'}
    </span>
    <button onclick={toggleFullscreen}>⛶ {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
    {#if side}
      <button
        class="side-toggle"
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
    {#if onend}
      <button onclick={() => (confirmingEnd = true)}>End game</button>
    {/if}
    {@render children?.()}
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
    flex-wrap: wrap;
    padding: 8px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }

  .logo {
    font-weight: 800;
    letter-spacing: 0.5px;
  }

  .logo span {
    color: var(--accent);
  }

  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
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

  .actions :global(button) {
    height: 33px;
  }

  .side-toggle {
    width: 33px;
    padding: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .side-toggle svg {
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
</style>
