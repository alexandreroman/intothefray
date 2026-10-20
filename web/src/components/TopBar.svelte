<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { on } from 'svelte/events';
  import { MediaQuery } from 'svelte/reactivity';
  import Icon from './Icon.svelte';
  import Icons from '../table/Icons.svelte';
  import Logo from './Logo.svelte';
  import { href } from '../lib/router.svelte';
  import Segmented from './Segmented.svelte';
  import { overflowTip } from '../lib/overflowTip';
  import { COMPACT_QUERY, ScrollAutoHide } from '../lib/autoHide.svelte';

  let {
    spectators = 0,
    crumbs = [],
    onback,
    onend,
    endLabel = 'End game',
    endQuestion = 'End this game for everyone?',
    viewMode,
    onviewmode,
    readyAll,
    scroller,
    hidden = $bindable(false),
  }: {
    spectators?: number;
    /** Where the viewer is, after the logo: the first part stands out, the rest is dimmed. */
    crumbs?: string[];
    /** Goes back, from a back arrow before the logo. */
    onback?: () => void;
    /** Ends the game for everyone, once confirmed. Given to the host only. */
    onend?: () => void;
    /** The end button's name, tooltip and confirmation, and the question it asks. */
    endLabel?: string;
    endQuestion?: string;
    /** What the table shows, on the table only: every row, or the villain's and one player's. */
    viewMode?: 'all' | 'focus';
    onviewmode?: (mode: 'all' | 'focus') => void;
    /** Readies every card of the player's that can be: on the table, for players only. */
    readyAll?: { disabled: boolean; run: () => void };
    /** What scrolls under the bar, when not the window: on a compact screen, the bar hides as it scrolls down. */
    scroller?: HTMLElement;
    /** Whether the bar is slid out of view, for a screen whose layout follows it. */
    hidden?: boolean;
  } = $props();

  const VIEW_MODES = [
    { value: 'all', label: 'All', icon: 'rows-all' },
    { value: 'focus', label: 'Villain + player', icon: 'rows-focus' },
  ] as const;

  const spectatorLabel = $derived(`${spectators} ${spectators === 1 ? 'spectator' : 'spectators'}`);
  const [crumbHead, ...crumbRest] = $derived(crumbs);

  let confirmingEnd = $state(false);

  // On a compact screen the bar slides away as the page scrolls down. It stays while it is in
  // use: keyboard focus inside it, or the dialog it opened. The focus a tap or a click leaves
  // behind does not count, or the bar would never hide again after a use.
  const compact = new MediaQuery(COMPACT_QUERY);
  let focusWithin = $state(false);
  const autoHide = new ScrollAutoHide({
    source: () => scroller ?? window,
    enabled: () => compact.current,
    pinned: () => focusWithin || confirmingEnd,
  });

  $effect(() => {
    hidden = autoHide.hidden;
  });

  function focusEntered(event: FocusEvent): void {
    if (!(event.target as Element).matches(':focus-visible')) {
      return;
    }
    // Brought back by a keyboard focus, the bar keeps the page where the reader left it.
    autoHide.keepPlace();
    focusWithin = true;
  }

  // As :focus-within: focus leaving for another of the bar's controls stays within.
  function focusLeft(event: FocusEvent): void {
    const header = event.currentTarget as HTMLElement;
    focusWithin = header.contains(event.relatedTarget as Node | null);
  }

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

<!-- Hidden, it stays focusable: a tab into it brings it back. -->
<header
  class:auto-hide={compact.current}
  class:hidden
  onfocusin={focusEntered}
  onfocusout={focusLeft}
>
  <div class="bar">
    {#if onback}
      <button class="icon-button" aria-label="Back" title="Back" onclick={onback}>
        <Icon name="back" />
      </button>
    {/if}
    <!-- Plain left clicks navigate in place: the router handles every link to an app route. -->
    <a class="home" href={href('/')} aria-label="Into The Fray: home"><Logo /></a>
    {#if crumbHead !== undefined}
      <span class="divider" aria-hidden="true"></span>
      <span class="crumbs" use:overflowTip>
        <b>{crumbHead}</b>{#each crumbRest as crumb, i (i)}<span class="rest">{` / ${crumb}`}</span
          >{/each}
      </span>
    {/if}
    <div class="actions">
      <!-- The spectator count leads the actions on every screen. -->
      {#if spectators > 0}
        <span class="pill" role="img" aria-label={spectatorLabel} title={spectatorLabel}>
          <Icon name="eye" />
          {spectators}
        </span>
      {/if}
      {#if viewMode && onviewmode}
        <Segmented options={VIEW_MODES} value={viewMode} onchange={onviewmode} label="Table view" />
      {/if}
      {#if readyAll}
        <!-- aria-disabled rather than disabled, so that the tooltip still shows. -->
        <button
          class="icon-button"
          aria-label="Ready all cards"
          data-tip="Ready all cards"
          data-kbd="⇧ Space"
          aria-keyshortcuts="Shift+Space"
          aria-disabled={readyAll.disabled}
          onclick={() => {
            if (!readyAll.disabled) {
              readyAll.run();
            }
          }}
        >
          <!-- The action bar's family: Exhaust, the other way round. -->
          <Icons name="ready-all" />
        </button>
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
          aria-label={endLabel}
          title={endLabel}
          onclick={() => (confirmingEnd = true)}
        >
          <Icon name="cross" />
        </button>
      {/if}
    </div>
  </div>
</header>

{#if confirmingEnd}
  <ConfirmDialog
    question={endQuestion}
    confirmLabel={endLabel}
    danger
    onconfirm={endGame}
    oncancel={() => (confirmingEnd = false)}
  />
{/if}

<style>
  /* The background and the border span the window. The height is TOP_BAR_HEIGHT (lib/autoHide). */
  header {
    height: 56px;
    background: var(--bg);
    border-bottom: 1px solid var(--panel-2);
  }

  /*
   * On a compact screen it sticks to the top of a scrolling page, over the content but under the
   * connection status (Game.svelte, 200), the dialogs (5600) and the tooltips (6000), and slides
   * out of view while the page scrolls down:
   * its border box, border included, goes. The content scrolls into the room it leaves.
   */
  header.auto-hide {
    position: sticky;
    top: 0;
    z-index: 100;
    transition: transform 0.2s ease;
  }

  header.auto-hide.hidden {
    transform: translateY(-100%);
  }

  @media (prefers-reduced-motion: reduce) {
    header.auto-hide {
      transition: none;
    }
  }

  /*
   * The bar follows the screen's content column: its first and last items line up with the
   * column's edges. Each screen sets the column's width and gutter on its root element, and
   * may give the end its own gutter.
   */
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100%;
    max-width: var(--content-max, none);
    margin: 0 auto;
    padding-inline: var(--content-gutter, 24px) var(--bar-gutter-end, var(--content-gutter, 24px));
  }

  /* As the logo alone: no underline, no box of its own but the focus ring. */
  .home {
    flex: none;
    display: inline-flex;
    color: inherit;
    text-decoration: none;
    border-radius: 6px;
  }

  .home:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: 4px;
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

  /* The view switch is as tall as the buttons of the row, on their surface. */
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    --segmented-height: 38px;
    --segmented-bg: var(--panel);
    --segmented-pad: 12px;
    --segmented-weight: 600;
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
   * The breakpoint is COMPACT_QUERY (lib/autoHide), on which the bar hides on scroll.
   */
  @media (max-width: 600px) {
    .bar {
      gap: 12px;
    }

    /* The icons say it: the view labels go. */
    .actions {
      --segmented-label-display: none;
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
