<!--
  The side column: the history, newest first, and the Undo button under it.
  Collapsed, a slim strip holds only the buttons that expand it and undo.
  The preview of the hovered card floats over the table (Table.svelte).
-->
<script module lang="ts">
  /**
   * The Undo button's label: here, in the history sheet, in the dock, and on the narrow table's floating Undo
   * (Table.svelte).
   */
  export const UNDO_TIP = 'Undo last action';
  /** The tip of the Undo button when the viewer has nothing to undo. */
  export const NOTHING_TO_UNDO = 'Nothing of yours to undo';
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { pointerBlur } from '../lib/releaseFocus';
  import type { LogView } from '../lib/types';
  import { mergedLines } from './animate';
  import { historyLines, type NameOf } from './historyLines';
  import HistoryText from './HistoryText.svelte';
  import { interaction } from './interaction.svelte';

  let {
    log,
    canUndo = false,
    onundo,
    collapsed = false,
    ontoggle,
    controls,
    nameOf,
  }: {
    /** Oldest first, as the server sends it. */
    log: LogView[];
    canUndo?: boolean;
    onundo: () => void;
    /** Only a strip shows: the buttons to expand it and to undo. */
    collapsed?: boolean;
    /** Collapses or expands the panel. */
    ontoggle: () => void;
    /** The id of the element that collapses (aria-controls). */
    controls: string;
    /** The name of a face in the viewer's language; without it, or when unknown, the English text shows. */
    nameOf?: NameOf;
  } = $props();

  let collapseButton = $state<HTMLButtonElement>();
  let expandButton = $state<HTMLButtonElement>();

  // The button pressed goes with the side it was on: activated from the keyboard (a click of
  // detail 0), the focus moves to the one that takes its place. Clicked with the pointer, it lets
  // go of the focus (pointerBlur), and none comes back.
  async function toggle(event: MouseEvent): Promise<void> {
    const fromKeyboard = event.detail === 0;
    leaveLine();
    ontoggle();
    await tick();
    if (fromKeyboard) {
      (collapsed ? expandButton : collapseButton)?.focus();
    }
  }

  function undo(): void {
    if (canUndo) {
      onundo();
    }
  }

  // Lines added after a render slide in; the ones already there at load do not.
  // Not reactive on purpose: it only remembers how far the last render went.
  // svelte-ignore state_referenced_locally
  let seen = log.length;
  $effect(() => {
    seen = log.length;
  });

  // A line that a later change merged into (counters, flips) bumps.
  // From the empty end keyframe, the line goes back to its own background.
  const BUMP = [{ backgroundColor: '#2a3a66' }, {}];
  const BUMP_MS = 500;
  // svelte-ignore state_referenced_locally
  let drawnLog = log;
  let list = $state<HTMLUListElement>();
  $effect(() => {
    const merged = mergedLines(drawnLog, log);
    drawnLog = log;
    for (const index of merged) {
      const element = list?.querySelector<HTMLElement>(`[data-line="${index}"]`);
      // jsdom has no Web Animations API.
      element?.animate?.(BUMP, { duration: BUMP_MS, easing: 'ease-out' });
    }
  });

  const lines = $derived(
    historyLines(log, nameOf).map((line) => ({ ...line, isNew: line.key >= seen })),
  );

  // The line under the pointer, and the one whose full text floats over the
  // list (only a truncated line shows it).
  let hoveredLine = $state<number | null>(null);
  let expanded = $state<number | null>(null);

  function enterLine(event: PointerEvent, key: number, cards: string[] | undefined): void {
    hoveredLine = key;
    interaction.highlighted = new Set(cards ?? []);
    const text = (event.currentTarget as HTMLElement).querySelector('.txt');
    expanded = text && text.scrollWidth > text.clientWidth + 1 ? key : null;
  }

  function leaveLine(): void {
    hoveredLine = null;
    interaction.highlighted = new Set();
    expanded = null;
  }

  // A line removed from under the pointer gets no pointerleave: its ring would stay on.
  $effect(() => {
    if (hoveredLine !== null && !lines.some((line) => line.key === hoveredLine)) {
      leaveLine();
    }
  });
</script>

{#snippet panelIcon()}
  <!-- The panel's edge, and a chevron pushing it to the right (drawn flipped to expand). -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M15 4v16M8 9l3 3-3 3" />
  </svg>
{/snippet}

{#if collapsed}
  <div class="strip">
    <button
      class="btn-ghost toggle expand"
      aria-label="Expand history"
      data-tip="Expand history"
      aria-expanded="false"
      aria-controls={controls}
      bind:this={expandButton}
      onclick={toggle}
      {@attach pointerBlur}
    >
      {@render panelIcon()}
    </button>
    <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
    <div class="strip-undo">
      <button
        class="btn-ghost"
        aria-label={UNDO_TIP}
        data-tip={canUndo ? UNDO_TIP : NOTHING_TO_UNDO}
        aria-disabled={!canUndo}
        onclick={undo}
        {@attach pointerBlur}
      >
        <Icon name="undo" />
      </button>
    </div>
  </div>
{:else}
  <div class="loghead">
    <h2 id="history-title">History</h2>
    <button
      class="btn-ghost toggle"
      aria-label="Collapse history"
      data-tip="Collapse history"
      aria-expanded="true"
      aria-controls={controls}
      bind:this={collapseButton}
      onclick={toggle}
      {@attach pointerBlur}
    >
      {@render panelIcon()}
    </button>
  </div>

  <ul class="log" aria-labelledby="history-title" bind:this={list}>
    {#each lines as { key, entry, parts, time, isNew } (key)}
      <li
        class="e"
        data-line={key}
        class:undone={entry.undone}
        class:new={isNew}
        onpointerenter={(event) => enterLine(event, key, entry.cards)}
        onpointerleave={leaveLine}
      >
        <time class="t">{time}</time>
        <span class="txt"><HistoryText {entry} {parts} /></span>
        {#if expanded === key}
          <div class="full">
            <time class="t">{time}</time>
            <span class="whole"><HistoryText {entry} {parts} /></span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
  <div class="undo">
    <button
      aria-disabled={!canUndo}
      data-tip={canUndo ? undefined : NOTHING_TO_UNDO}
      onclick={undo}
      {@attach pointerBlur}
    >
      <Icon name="undo" />
      {UNDO_TIP}
    </button>
  </div>
{/if}

<style>
  h2 {
    margin: 0;
    font-stretch: 75%;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .loghead {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 6px 0 18px;
  }

  .toggle {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--muted);
  }

  .toggle svg {
    width: 18px;
    height: 18px;
  }

  /* The same icon, the other way round. */
  .toggle.expand svg {
    transform: scaleX(-1);
  }

  /* Collapsed: the expand button at the top, Undo at the bottom, on the expanded Undo's line. */
  .strip {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 10px;
  }

  .strip-undo {
    margin-top: auto;
    padding-bottom: calc(var(--edge-bottom) + 5px);
  }

  .strip-undo button {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--text-soft);
  }

  .strip-undo :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }

  /* A tablet: a finger needs 44 px targets; the collapsed strip is that wide, its 1 px border included
     (Table.svelte). */
  :global(.app.tablet) :is(.toggle, .strip-undo button) {
    width: 44px;
    height: 44px;
  }

  .log {
    /* A hovered line, and the full text of a truncated one, which must look the same. */
    --line-hover: #49c6ff14;
    overflow-y: auto;
    margin: 0;
    padding: 0 0 8px;
    list-style: none;
    flex: 1;
    min-height: 0;
  }

  .e,
  .full {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 8px 18px;
    font-size: 13px;
    line-height: 1.4;
  }

  .e {
    position: relative;
    cursor: pointer;
  }

  @media (hover: hover) {
    .e:hover {
      background: var(--line-hover);
    }
  }

  .e.new {
    animation: slidein 0.3s ease-out;
  }

  /* On the contents rather than the line: the full text must hide the lines below, and a
     strike-through does not reach it as it is out of flow. */
  .e.undone .t,
  .e.undone .txt,
  .e.undone .whole {
    opacity: 0.45;
    text-decoration: line-through;
  }

  .txt,
  .whole {
    flex: 1;
    min-width: 0;
  }

  .txt {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .t {
    flex: none;
    /* Snug around "00:00": tabular digits are each 1ch wide, the colon narrower. */
    width: 5ch;
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  /*
    The full text floats over the list, so nothing below it moves. It lies exactly on its line,
    with the same padding and hover tint, and only wraps further down. The tint is laid on the
    panel's ink so the lines below do not show through.
  */
  .full {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    background: linear-gradient(var(--line-hover), var(--line-hover)), var(--bg);
  }

  /* Its button's bottom edge on the zoom control's, across the table (--edge-bottom, focus.ts). */
  .undo {
    flex: none;
    padding: 14px 18px var(--edge-bottom);
    border-top: 1px solid var(--panel-2);
  }

  .undo button {
    width: 100%;
    height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: var(--panel);
    font-size: 13px;
  }

  /* A tablet: a finger needs a 44 px target. */
  :global(.app.tablet) .undo button {
    height: 44px;
  }

  .undo :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }

  @keyframes slidein {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
  }
</style>
