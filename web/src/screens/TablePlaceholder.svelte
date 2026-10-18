<script lang="ts">
  import TopBar from '../components/TopBar.svelte';
  import type { View } from '../lib/types';

  let { view }: { view: View } = $props();

  const cardCount = $derived(view.table?.cards.length ?? 0);
</script>

<div class="table-bg screen">
  <TopBar title="INTO THE FRAY" spectators={view.spectators} />
  <p>{cardCount} {cardCount === 1 ? 'card' : 'cards'} on the table</p>
</div>

<style>
  .screen {
    min-height: 100vh;
  }

  p {
    margin: 24px 16px;
    color: var(--muted);
  }
</style>
