<!--
  The history in a bottom sheet, for the dock (dock mode): the same lines as the side column
  (SidePanel.svelte), newest first and worded the same, and the Undo button under them. In dock
  mode it may take the whole height, its lines compact.
-->
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { playerColorVar } from '../lib/playerColor';
  import { pointerBlur } from '../lib/releaseFocus';
  import type { LogView } from '../lib/types';
  import { dockMode } from './dockMode';
  import { partsOf, timeOf, type NameOf } from './historyLines';
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
    nameOf?: NameOf;
  } = $props();

  const dock = dockMode();

  function undo(): void {
    if (canUndo) {
      onundo();
    }
  }

  // The words come from historyLines.ts and the markup below reproduces SidePanel's, so that both
  // read the same. Keyed by their position from the oldest, which does not move when lines are added.
  const lines = $derived(
    log
      .map((entry, index) => ({
        key: index,
        entry,
        parts: partsOf(entry, nameOf),
        time: timeOf(entry.at),
      }))
      .reverse(),
  );
</script>

<Sheet label="History" {onclose} maxHeight="62%" dock={dock.current}>
  <div class="history" class:dock={dock.current}>
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

  /* Dock mode: the sheet pads its content (Sheet.svelte); compact lines of 40 px. */
  .history.dock h2 {
    padding: 4px 6px 4px;
  }

  /* 11 px above and below a line of 18 px: 40 px, the time on the text's baseline. */
  .history.dock .e {
    min-height: 40px;
    padding: 11px 6px;
  }

  .history.dock .undo {
    padding: 8px 0 0;
  }
</style>
