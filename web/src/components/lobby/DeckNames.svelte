<!--
  A loaded deck's hero and deck names, one above the other, each on one line
  cut short with an ellipsis, and shown in full in a tooltip when cut.
-->
<script lang="ts">
  import { overflowTip } from '../../lib/overflowTip';

  let { heroName, deckName }: { heroName: string; deckName: string } = $props();
</script>

<div class="names">
  <b use:overflowTip>{heroName}</b>
  <span use:overflowTip>{deckName}</span>
</div>

<style>
  .names {
    flex: 1;
    min-width: 0;
  }

  b,
  span {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  b {
    font-size: 17px;
  }

  span {
    margin-top: 2px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
