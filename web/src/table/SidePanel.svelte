<!--
  The side column: the preview of the hovered card, the history, newest
  first, and the Undo button under it.
-->
<script lang="ts">
  import type { LogView } from '../lib/types';
  import { mergedLines } from './animate';
  import CardPreview, { type Preview } from './CardPreview.svelte';
  import { interaction } from './interaction.svelte';

  let {
    preview,
    log,
    canUndo = false,
    onundo,
  }: {
    preview: Preview | null;
    /** Oldest first, as the server sends it. */
    log: LogView[];
    canUndo?: boolean;
    onundo: () => void;
  } = $props();

  interface Part {
    text: string;
    /** Bracketed details, dimmed. */
    aside: boolean;
  }

  /** Splits a line's text around its bracketed details. */
  function partsOf(text: string): Part[] {
    const parts: Part[] = [];
    let start = 0;
    for (const match of text.matchAll(/\([^()]*\)/g)) {
      parts.push({ text: text.slice(start, match.index), aside: false });
      parts.push({ text: match[0], aside: true });
      start = match.index + match[0].length;
    }
    parts.push({ text: text.slice(start), aside: false });
    return parts.filter((part) => part.text !== '');
  }

  /** The player colour; system lines (colour -1) keep the text colour. */
  function nameColor(entry: LogView): string | undefined {
    return entry.color >= 0 ? `var(--p${entry.color + 1})` : undefined;
  }

  function timeOf(at: string): string {
    // hh:mm, local time.
    return new Date(at).toTimeString().slice(0, 5);
  }

  // Lines added after a render slide in; the ones already there at load do not.
  // Not reactive on purpose: it only remembers how far the last render went.
  // svelte-ignore state_referenced_locally
  let seen = log.length;
  $effect(() => {
    seen = log.length;
  });

  // A line that a later change merged into (counters, flips) bumps, as in the prototype.
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

  // Keyed by their position from the oldest, which does not move when lines are added.
  const lines = $derived(
    log
      .map((entry, index) => ({
        key: index,
        entry,
        parts: partsOf(entry.text),
        time: timeOf(entry.at),
        isNew: index >= seen,
      }))
      .reverse(),
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

{#snippet lineText(entry: LogView, parts: Part[])}
  <!-- The line break between the name and the text renders as one space. -->
  <span class="w" style:color={nameColor(entry)}>{entry.who}</span>
  {#each parts as part, i (i)}{#if part.aside}<span class="aside">{part.text}</span
      >{:else}{part.text}{/if}{/each}
{/snippet}

<div class="preview">
  <h2>Preview</h2>
  <div class="frame">
    <CardPreview {preview} />
  </div>
</div>

<h2 class="loghead" id="history-title">History</h2>

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
      <span class="txt">{@render lineText(entry, parts)}</span>
      {#if expanded === key}
        <div class="full">
          <time class="t">{time}</time>
          <span class="whole">{@render lineText(entry, parts)}</span>
        </div>
      {/if}
    </li>
  {/each}
</ul>

<!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
<div class="undo">
  <button
    aria-disabled={!canUndo}
    data-tip={canUndo ? undefined : 'Nothing of yours to undo'}
    onclick={() => {
      if (canUndo) {
        onundo();
      }
    }}
  >
    <!-- A hooked arrow going back. -->
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
    Undo last action
  </button>
</div>

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

  .preview {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    border-bottom: 1px solid var(--panel-2);
  }

  .frame {
    align-self: center;
    width: min(100%, 220px);
  }

  .loghead {
    flex: none;
    padding: 16px 18px 6px;
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

  .e:hover {
    background: var(--line-hover);
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

  .w {
    font-weight: 700;
  }

  .aside {
    color: var(--faint);
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

  .undo {
    flex: none;
    padding: 14px 18px;
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

  .undo svg {
    width: 16px;
    height: 16px;
    flex: none;
  }

  @keyframes slidein {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
  }
</style>
