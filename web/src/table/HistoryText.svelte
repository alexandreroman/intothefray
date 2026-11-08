<!--
  The words of a history line, the same in the side column (SidePanel.svelte) and the history
  sheet (HistorySheet.svelte): the player's name in their colour, then the text, card names in
  bold and bracketed details dimmed.
-->
<script lang="ts">
  import { playerColorVar } from '../lib/playerColor';
  import type { LogView } from '../lib/types';
  import type { LinePart } from './historyLines';

  let { entry, parts }: { entry: LogView; parts: LinePart[] } = $props();
</script>

<!-- The line break between the name and the text renders as one space. -->
<span class="w" style:color={playerColorVar(entry.color)}>{entry.who}</span>
{#each parts as part, i (i)}{#if part.card}<b class="card" class:aside={part.aside}>{part.text}</b
    >{:else if part.aside}<span class="aside">{part.text}</span>{:else}{part.text}{/if}{/each}

<style>
  .w {
    font-weight: 700;
  }

  .card {
    font-weight: 700;
  }

  .aside {
    color: var(--faint);
  }
</style>
