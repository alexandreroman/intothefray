<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { on } from 'svelte/events';
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

  // iPad and older Safari only have the WebKit-prefixed Fullscreen API, whose
  // calls may return nothing rather than a promise.
  type WebkitDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  type WebkitElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  const webkitDocument = document as WebkitDocument;
  const root = document.documentElement as WebkitElement;

  // iPhone Safari has neither API: the button is not shown there.
  const fullscreenSupported = Boolean(root.requestFullscreen ?? root.webkitRequestFullscreen);

  function fullscreenElement(): Element | null {
    return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null;
  }

  let fullscreen = $state(fullscreenElement() !== null);
  const fullscreenLabel = $derived(fullscreen ? 'Exit fullscreen' : 'Fullscreen');

  function syncFullscreen(): void {
    fullscreen = fullscreenElement() !== null;
  }

  // The WebKit event has no <svelte:document> attribute, so both are listened to here.
  $effect(() => {
    const offStandard = on(document, 'fullscreenchange', syncFullscreen);
    const offWebkit = on(document, 'webkitfullscreenchange', syncFullscreen);
    return () => {
      offStandard();
      offWebkit();
    };
  });

  function toggleFullscreen(): void {
    const result = fullscreenElement()
      ? (document.exitFullscreen?.() ?? webkitDocument.webkitExitFullscreen?.())
      : (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    // A request can be refused (no user gesture, a policy of the embedding
    // page): nothing changes then.
    void Promise.resolve(result).catch(() => {});
  }
</script>

<header>
  <div class="logo">INTO <span>THE</span> FRAY</div>
  <div class="actions">
    {#if spectators > 0}
      <span class="pill" role="img" aria-label={spectatorLabel} title={spectatorLabel}>
        <Icon name="eye" />
        {spectators}
      </span>
    {/if}
    {#if fullscreenSupported}
      <button
        class="icon-button fullscreen"
        class:active={fullscreen}
        aria-label={fullscreenLabel}
        title={fullscreenLabel}
        onclick={toggleFullscreen}
      >
        <Icon name={fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
      </button>
    {/if}
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
   * stays while active, or a viewer without an Escape key could not leave it.
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
