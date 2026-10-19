<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { on } from 'svelte/events';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  let {
    spectators = 0,
    crumbs = [],
    onback,
    onend,
    viewMode,
    onviewmode,
  }: {
    spectators?: number;
    /** Where the viewer is, after the logo: the first part stands out, the rest is dimmed. */
    crumbs?: string[];
    /** Goes back, from a back arrow before the logo. */
    onback?: () => void;
    /** Ends the game for everyone, once confirmed. Given to the host only. */
    onend?: () => void;
    /** What the table shows, on the table only: every row, or the villain's and one player's. */
    viewMode?: 'all' | 'focus';
    onviewmode?: (mode: 'all' | 'focus') => void;
  } = $props();

  const VIEW_MODES = [
    { mode: 'all', label: 'All', icon: 'rows-all' },
    { mode: 'focus', label: 'Villain + player', icon: 'rows-focus' },
  ] as const;

  // The highlight behind the chosen view, placed over its button. It slides to the other one
  // when the view changes, but not into its first place.
  let views = $state<HTMLElement>();
  let viewsWidth = $state(0);
  let thumb = $state<{ left: number; width: number } | null>(null);
  let thumbSlides = $state(false);

  $effect(() => {
    // Placed again when the view changes, or the labels come and go with the width.
    void [viewMode, viewsWidth];
    const chosen = views?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!chosen) {
      return;
    }
    thumb = { left: chosen.offsetLeft, width: chosen.offsetWidth };
    if (!thumbSlides) {
      // From the next frame on: the first place is taken without sliding.
      const frame = requestAnimationFrame(() => (thumbSlides = true));
      return () => cancelAnimationFrame(frame);
    }
  });

  const spectatorLabel = $derived(`${spectators} ${spectators === 1 ? 'spectator' : 'spectators'}`);
  const [crumbHead, ...crumbRest] = $derived(crumbs);

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
  {#if onback}
    <button class="icon-button" aria-label="Back" title="Back" onclick={onback}>
      <Icon name="back" />
    </button>
  {/if}
  <Logo />
  {#if crumbHead !== undefined}
    <span class="divider" aria-hidden="true"></span>
    <span class="crumbs">
      <b>{crumbHead}</b>{#each crumbRest as crumb, i (i)}<span class="rest">{` / ${crumb}`}</span
        >{/each}
    </span>
  {/if}
  <div class="actions">
    {#if viewMode && onviewmode}
      <div
        class="views"
        role="group"
        aria-label="Table view"
        bind:this={views}
        bind:clientWidth={viewsWidth}
      >
        {#if thumb}
          <span
            class="thumb"
            class:slides={thumbSlides}
            style:left="{thumb.left}px"
            style:width="{thumb.width}px"
            aria-hidden="true"
          ></span>
        {/if}
        {#each VIEW_MODES as choice (choice.mode)}
          <button
            class="btn-ghost"
            type="button"
            aria-label={choice.label}
            title={choice.label}
            aria-pressed={viewMode === choice.mode}
            onclick={() => onviewmode(choice.mode)}
          >
            <Icon name={choice.icon} />
            <span>{choice.label}</span>
          </button>
        {/each}
      </div>
    {/if}
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
        <Icon name="cross" />
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
    gap: 16px;
    height: 56px;
    padding: 0 16px 0 18px;
    background: var(--bg);
    border-bottom: 1px solid var(--panel-2);
  }

  .divider {
    flex: none;
    width: 1px;
    height: 24px;
    background: var(--line);
  }

  /* A long crumb gives way to the actions: it is cut short, never wrapped. */
  .crumbs {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 700;
  }

  .crumbs .rest {
    color: var(--muted);
    font-weight: 500;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  /* A segmented control: the chosen view is lit. */
  .views {
    position: relative;
    display: flex;
    height: 38px;
    padding: 3px;
    gap: 2px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
  }

  .views button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: none;
    border-radius: 999px;
    color: var(--muted);
    font-size: 13px;
  }

  .views button[aria-pressed='true'] {
    color: var(--text);
  }

  /* Behind the labels, the height of the buttons. */
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 999px;
    background: var(--panel-2);
  }

  .thumb.slides {
    transition:
      left 0.2s ease-out,
      width 0.2s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb.slides {
      transition: none;
    }
  }

  .views :global(svg) {
    width: 16px;
    height: 16px;
  }

  /* Buttons in the row share one height: the pill matches them. */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 13px;
    background: var(--panel);
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

  .icon-button {
    flex: none;
    width: 38px;
    height: 38px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--panel);
    border-color: var(--line);
    color: #c9cfdf;
  }

  .icon-button.active {
    color: var(--sel);
  }

  .icon-button :global(svg) {
    width: 18px;
    height: 18px;
    display: block;
  }

  /*
   * A narrow bar drops its least useful items first: the crumb, Fullscreen,
   * then the spectator count. The logo and End game always stay. Fullscreen
   * stays while active, or a viewer without an Escape key could not leave it.
   */
  @media (max-width: 600px) {
    header {
      gap: 12px;
      padding: 0 12px;
    }

    /* The icons say it: the labels go. */
    .views span {
      display: none;
    }

    .divider,
    .crumbs,
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
