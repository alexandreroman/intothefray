<script lang="ts">
  import { route } from './lib/router.svelte';
  import Home from './screens/Home.svelte';
  import Options from './screens/Options.svelte';
</script>

{#if route.current.name === 'options'}
  <Options />
{:else if route.current.name === 'game'}
  <!-- Placeholder until the game screen is wired. -->
  <main>Game {route.current.id}</main>
{:else}
  <Home />
{/if}
