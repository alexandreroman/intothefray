<!--
  The side column: the preview of the hovered card, then the history,
  newest first, with the Undo button in its header.
-->
<script lang="ts" module>
  import type { Back } from '../lib/types';

  /** What the preview frame shows. */
  export type Preview =
    | { kind: 'face'; images: string[]; name: string; landscape: boolean }
    | { kind: 'back'; back: Back };
</script>

<script lang="ts">
  import type { LogView } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { hover } from './hover.svelte';

  let {
    preview,
    log,
    canUndo = false,
    undoText,
    onundo,
  }: {
    preview: Preview | null;
    /** Oldest first, as the server sends it. */
    log: LogView[];
    canUndo?: boolean;
    /** The text of the line Undo would take back. */
    undoText?: string;
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

  // The line whose full text floats over the list (only a truncated line shows it).
  let expanded = $state<number | null>(null);

  function enterLine(event: PointerEvent, key: number, cards: string[] | undefined): void {
    hover.highlighted = new Set(cards ?? []);
    const text = (event.currentTarget as HTMLElement).querySelector('.txt');
    expanded = text && text.scrollWidth > text.clientWidth + 1 ? key : null;
  }

  function leaveLine(): void {
    hover.highlighted = new Set();
    expanded = null;
  }
</script>

{#snippet lineText(entry: LogView, parts: Part[])}
  <!-- The line break between the name and the text renders as one space. -->
  <span class="w" style:color={nameColor(entry)}>{entry.who}</span>
  {#each parts as part, i (i)}{#if part.aside}<span class="aside">{part.text}</span
      >{:else}{part.text}{/if}{/each}
{/snippet}

<div class="preview">
  <div class="frame" class:empty={!preview} aria-label="Card preview" role="figure">
    {#if !preview}
      <div class="hint">Hover a card<br />to see it here</div>
    {:else if preview.kind === 'back'}
      <div class="art">
        <CardBack back={preview.back} />
      </div>
    {:else}
      <div class="art" class:land={preview.landscape}>
        <CardFace images={preview.images} name={preview.name} landscape={preview.landscape} />
      </div>
    {/if}
  </div>
</div>

<div class="loghead">
  <b id="history-title">History</b>
  <button
    disabled={!canUndo}
    title={canUndo ? `Undo your last action: ${undoText ?? ''}` : 'Nothing of yours to undo'}
    onclick={onundo}>Undo</button
  >
</div>

<ul class="log" aria-labelledby="history-title">
  {#each lines as { key, entry, parts, time, isNew } (key)}
    <li
      class="e"
      class:undone={entry.undone}
      class:new={isNew}
      onpointerenter={(event) => enterLine(event, key, entry.cards)}
      onpointerleave={leaveLine}
    >
      <span class="txt">{@render lineText(entry, parts)}</span>
      <span class="t">{time}</span>
      {#if expanded === key}
        <div class="full">
          <span class="t">{time}</span>{@render lineText(entry, parts)}
        </div>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .preview {
    padding: 12px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }

  /* Fixed size: a portrait card fills it, a landscape one sits in its middle. */
  .frame {
    width: 100%;
    aspect-ratio: 5 / 7;
    display: grid;
    place-items: center;
    border-radius: 8px;
    overflow: hidden;
  }

  /* Only the empty frame is outlined: a shown card keeps its cut corners clear. */
  .frame.empty {
    border: 1px dashed #222b44;
  }

  .hint {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 12px;
  }

  .art {
    position: relative;
    width: 100%;
    aspect-ratio: 5 / 7;
  }

  .art.land {
    aspect-ratio: 7 / 5;
  }

  .loghead {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    gap: 8px;
    border-bottom: 1px solid var(--line);
  }

  .loghead b {
    margin-right: auto;
  }

  .log {
    overflow-y: auto;
    margin: 0;
    padding: 6px 12px;
    list-style: none;
    flex: 1;
    min-height: 0;
  }

  .e {
    position: relative;
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin: 0 -6px;
    padding: 5px 6px;
    border-radius: 6px;
    border-bottom: 1px solid #222b44;
    font-size: 13px;
    cursor: pointer;
  }

  .e:hover {
    background: #222c48;
  }

  .e.new {
    animation: slidein 0.3s ease-out;
  }

  .e.undone {
    opacity: 0.45;
    text-decoration: line-through;
  }

  .txt {
    flex: 1;
    min-width: 0;
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
    color: var(--muted);
    font-size: 11px;
  }

  /* The full text floats over the list, so nothing below it moves. */
  .full {
    position: absolute;
    left: -8px;
    right: -8px;
    top: -1px;
    z-index: 5;
    padding: 5px 8px;
    border-radius: 8px;
    background: #26314f;
    border: 1px solid #3a4870;
    box-shadow: 0 8px 20px #000a;
    white-space: normal;
  }

  .full .t {
    float: right;
    margin-left: 8px;
  }

  @keyframes slidein {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
  }
</style>
