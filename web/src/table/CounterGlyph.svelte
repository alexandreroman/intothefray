<!--
  The small glyph before a counter's text, as the table and the inspector draw it: the double
  chevron of an acceleration token, the lock of the Locked tab.
-->
<script lang="ts">
  let { kind }: { kind: 'acc' | 'locked' } = $props();
</script>

{#if kind === 'acc'}
  <svg class="chevrons" viewBox="0 0 8 8" aria-hidden="true"
    ><path d="M1.5 7.25 4 4.75 6.5 7.25M1.5 3.25 4 0.75 6.5 3.25" /></svg
  >
{:else}
  <svg class="lock" viewBox="0 0 10 10" aria-hidden="true"
    ><rect x="1.5" y="4.5" width="7" height="5" rx="1" /><path
      d="M3 4.5V3a2 2 0 0 1 4 0v1.5"
    /></svg
  >
{/if}

<style>
  /*
    Pointing up, before the count. The two chevrons stand 4 units apart, so their strokes keep a
    gap at 6px; their round ends may reach past the 8 × 8 box.
  */
  .chevrons {
    width: 6px;
    height: 6px;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 1px #0008);
  }

  /* Before the Locked label. */
  .lock {
    width: 6px;
    height: 6px;
    margin-right: 2px;
    vertical-align: -1px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
  }
</style>
