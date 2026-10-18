<script lang="ts">
  import { route } from './lib/router.svelte';
  import Game from './screens/Game.svelte';
  import Home from './screens/Home.svelte';
  import Options from './screens/Options.svelte';
</script>

{#if route.current.name === 'options'}
  <Options />
{:else if route.current.name === 'game'}
  <!-- A new id means a new game: remount to get a fresh session. -->
  {#key route.current.id}
    <Game id={route.current.id} />
  {/key}
{:else}
  <Home />
{/if}
