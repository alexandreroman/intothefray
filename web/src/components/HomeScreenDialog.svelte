<!--
  How to add the app to the Home Screen, opened from Home's banner on an iPad in a browser tab. On
  an iPad, the browser asks to leave fullscreen at every key pressed, which a page cannot stop:
  opened from the Home Screen, the app takes the whole screen without it. Escape, Got it or a
  click outside closes it.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const uid = $props.id();
  const leadId = `${uid}-lead`;
</script>

<Dialog title="Play full screen" describedby={leadId} width="min(400px, 100%)" oncancel={onclose}>
  <p id={leadId} class="lead">
    Add Into the Fray to your Home Screen: it opens full screen, with no browser bars.
  </p>
  <ol>
    <li>
      <span>Tap Share <Icon name="share" /> in the browser's toolbar.</span>
      <!-- Some of Safari's tab layouts tuck Share away in a menu. -->
      <small>In Safari, it can sit under ⋯.</small>
    </li>
    <li><span>Choose <b>Add to Home Screen</b>.</span></li>
    <li><span>Open Into the Fray from your Home Screen.</span></li>
  </ol>
  <div class="buttons">
    <button type="button" class="btn-primary compact" onclick={onclose}>Got it</button>
  </div>
</Dialog>

<style>
  .lead {
    margin: 8px 0 0;
    color: var(--text-soft);
    font-size: 14px;
    line-height: 1.45;
  }

  /*
   * Each step's number in a small round badge, on the first line of its text. Every line of a
   * step is an element of its own, beside the badge: loose text would be a grid item apart.
   */
  ol {
    counter-reset: step;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    counter-increment: step;
    display: grid;
    grid-template-columns: 24px 1fr;
    column-gap: 12px;
    font-size: 15px;
    line-height: 24px;
  }

  li::before {
    content: counter(step);
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    background: var(--panel-2);
    font-stretch: 85%;
    font-weight: 800;
    font-size: 13px;
    line-height: 1;
  }

  li > * {
    grid-column: 2;
  }

  li b {
    font-weight: 700;
  }

  /* The share glyph, a little taller than the text, sits on its line as a word would. */
  li :global(svg) {
    width: 1.15em;
    height: 1.15em;
    vertical-align: -0.2em;
  }

  small {
    color: var(--muted);
    font-size: 13px;
    line-height: 18px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
