<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, spectators, children }: { title: string; spectators: number; children?: Snippet } =
    $props();

  let fullscreen = $state(Boolean(document.fullscreenElement));

  function syncFullscreen(): void {
    fullscreen = Boolean(document.fullscreenElement);
  }

  function toggleFullscreen(): void {
    // Not every browser (or embedded view) offers the Fullscreen API, and a
    // request can be denied: the button then does nothing.
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }
</script>

<svelte:document onfullscreenchange={syncFullscreen} />

<header>
  <b class="title">{title}</b>
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
    {@render children?.()}
  </div>
</header>

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

  .title {
    font-weight: 800;
    letter-spacing: 0.5px;
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
</style>
