<script lang="ts">
  import { href } from '../lib/router.svelte';

  // A screen where the game is over, or was never there: it only points back to home.
  let { caption, title, text }: { caption: string; title?: string; text: string } = $props();
</script>

<main class="screen table-bg">
  <span class="caption">{caption}</span>
  {#if title}
    <h1 class="display">{title}</h1>
  {/if}
  <p>{text}</p>
  <a class="btn-primary" href={href('/')}>Back to home</a>
</main>

<style>
  .screen {
    min-height: 100vh;
    /* Clear of the notch and the home indicator; env() is 0 on a desktop. */
    padding-block: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-bottom));
    padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  a {
    margin-top: 12px;
  }
</style>
