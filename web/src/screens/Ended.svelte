<script lang="ts">
  import { href } from '../lib/router.svelte';

  // No state: the end screen only points back to home.
</script>

<main class="screen table-bg">
  <span class="caption">Game over</span>
  <h1 class="display">THIS GAME HAS ENDED</h1>
  <p>Start a new one from the home screen.</p>
  <a class="btn-primary" href={href('/')}>Back to home</a>
</main>

<style>
  .screen {
    min-height: 100vh;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 56px;
    line-height: 0.9;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  /* The primary panel, as a link. */
  a {
    display: inline-flex;
    align-items: center;
    margin-top: 12px;
    text-decoration: none;
  }
</style>
