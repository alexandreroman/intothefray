<!--
  The history in a bottom sheet, for the dock (dock mode): the same lines as the side column
  (SidePanel.svelte), newest first and worded the same, and the Undo button under them.
-->
<script module lang="ts">
  /** The log lines added since the history was last opened, for the dock's badge. */
  export function unread(logLength: number, seenLength: number): number {
    return Math.max(0, logLength - seenLength);
  }
</script>

<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { playerColorVar } from '../lib/playerColor';
  import { pointerBlur } from '../lib/releaseFocus';
  import type { FaceRef, LogPart, LogView } from '../lib/types';
  import { NOTHING_TO_UNDO, UNDO_TIP } from './SidePanel.svelte';

  let {
    log,
    canUndo,
    onundo,
    onclose,
    nameOf,
  }: {
    /** Oldest first, as the server sends it. */
    log: LogView[];
    canUndo: boolean;
    onundo: () => void;
    onclose: () => void;
    /** The name of a face in the viewer's language; without it, or when unknown, the English text shows. */
    nameOf?: (ref: FaceRef) => string | undefined;
  } = $props();

  function undo(): void {
    if (canUndo) {
      onundo();
    }
  }

  // The line markup below reproduces SidePanel's, so that both read the same.
  interface Part {
    text: string;
    /** Bracketed details, dimmed. */
    aside: boolean;
    /** A card name, in bold. Only the server flags one: no text a player typed can. */
    card: boolean;
  }

  /** Splits a piece of a line around its bracketed details. */
  function splitAsides(text: string, card: boolean): Part[] {
    const parts: Part[] = [];
    let start = 0;
    for (const match of text.matchAll(/\([^()]*\)/g)) {
      parts.push({ text: text.slice(start, match.index), aside: false, card });
      parts.push({ text: match[0], aside: true, card });
      start = match.index + match[0].length;
    }
    parts.push({ text: text.slice(start), aside: false, card });
    return parts.filter((part) => part.text !== '');
  }

  /** The text of a piece: a card name it refers to is shown in the viewer's language. */
  function textOf(piece: LogPart): string {
    if (piece.card !== true || piece.ref === undefined) {
      return piece.text;
    }
    return nameOf?.(piece.ref) ?? piece.text;
  }

  /** Splits a line into its card names and its bracketed details. */
  function partsOf(entry: LogView): Part[] {
    const pieces = entry.parts ?? [{ text: entry.text }];
    return pieces.flatMap((piece) => splitAsides(textOf(piece), piece.card === true));
  }

  function timeOf(at: string): string {
    // hh:mm, local time.
    return new Date(at).toTimeString().slice(0, 5);
  }

  // Keyed by their position from the oldest, which does not move when lines are added.
  const lines = $derived(
    log
      .map((entry, index) => ({ key: index, entry, parts: partsOf(entry), time: timeOf(entry.at) }))
      .reverse(),
  );
</script>

<Sheet label="History" {onclose} maxHeight="62%">
  <h2 id="history-sheet-title">History</h2>

  <ul class="log" aria-labelledby="history-sheet-title">
    {#each lines as { key, entry, parts, time } (key)}
      <li class="e" class:undone={entry.undone}>
        <time class="t">{time}</time>
        <!-- The line break between the name and the text renders as one space. -->
        <span class="txt">
          <span class="w" style:color={playerColorVar(entry.color)}>{entry.who}</span>
          {#each parts as part, i (i)}{#if part.card}<b class="card" class:aside={part.aside}
                >{part.text}</b
              >{:else if part.aside}<span class="aside">{part.text}</span
              >{:else}{part.text}{/if}{/each}
        </span>
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
</Sheet>

<style>
  h2 {
    margin: 0;
    padding: 4px 18px 6px;
    font-stretch: 75%;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .log {
    margin: 0;
    padding: 0 0 8px;
    list-style: none;
  }

  .e {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 8px 18px;
    font-size: 13px;
    line-height: 1.4;
  }

  .e.undone .t,
  .e.undone .txt {
    opacity: 0.45;
    text-decoration: line-through;
  }

  /* No hover to show the rest of a long line on a touch screen: it wraps instead. */
  .txt {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .w {
    font-weight: 700;
  }

  .card {
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

  /* The sheet's content scrolls: the button stays at its bottom, over the lines. */
  .undo {
    position: sticky;
    bottom: 0;
    padding: 12px 18px 0;
    background: var(--panel);
    border-top: 1px solid var(--panel-2);
  }

  .undo button {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    background: var(--panel-2);
    font-size: 14px;
  }

  .undo :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }
</style>
