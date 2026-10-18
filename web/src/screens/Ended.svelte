<script lang="ts">
  // No state: the end screen only points back to home.
</script>

<div class="screen table-bg">
  <p>This game has ended.</p>
  <a href="#/">Back to home</a>
</div>

<style>
  .screen {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  p {
    margin: 0;
    font-size: 18px;
  }

  a {
    color: var(--sel);
  }
</style>
