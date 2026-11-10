<script lang="ts">
  import Tooltip from './components/Tooltip.svelte';
  import { route } from './lib/router.svelte';
  import { appTitle } from './lib/title';
  import About from './screens/About.svelte';
  import Game from './screens/Game.svelte';
  import Home from './screens/Home.svelte';
  import Options from './screens/Options.svelte';

  const instance = import.meta.env.APP_INSTANCE as string | undefined;

  $effect(() => {
    document.title = appTitle(route.current.name, instance);
  });
</script>

{#if route.current.name === 'options'}
  <Options />
{:else if route.current.name === 'about'}
  <About />
{:else if route.current.name === 'game'}
  <!-- A new id means a new game: remount to get a fresh session. -->
  {#key route.current.id}
    <Game id={route.current.id} />
  {/key}
{:else}
  <Home />
{/if}

<!--
  The status bar's backdrop: a Home Screen app on iOS draws the page under the status bar (index.html),
  and content scrolling past the top would run under its clock and its blur. As tall as the status
  bar's room (--status-room, tokens.css), it shows nothing in a browser tab nor on a desktop.
-->
<div class="status-backdrop" aria-hidden="true"></div>

<!-- The tooltips of every screen: one page-wide listener (data-tip). -->
<Tooltip />

<style>
  /*
    The top bar's background, behind the status bar. Over the pages, the top bar (TopBar.svelte,
    100) and the connection status (Game.svelte, 200); under the sheets (5500), the dialogs (5600)
    and the tooltips (6000).
  */
  .status-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--status-room);
    z-index: 4000;
    background: var(--bg);
    pointer-events: none;
  }

  /*
    The table's .app, fixed, is a stacking context of its own: this backdrop would cover its dialogs
    and sheets. The table draws its own band, inside it (Table.svelte).
  */
  :global(html.fixed-screen) .status-backdrop {
    display: none;
  }
</style>
