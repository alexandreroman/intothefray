<!--
  The news of the app, newest first, opened from the home screen. The entries
  that were unread when it opened carry a "New" tag; whoever opens it marks
  them seen. Escape, Close or a click outside closes it.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { formatNewsDate, type NewsEntry } from '../lib/news';
  import { scrollFade } from '../lib/scrollFade';

  let {
    entries,
    unread,
    onclose,
  }: {
    /** Every entry, newest first. */
    entries: readonly NewsEntry[];
    /** The ids of the entries to tag as new. */
    unread: ReadonlySet<string>;
    onclose: () => void;
  } = $props();
</script>

<Dialog title="What's new" wide width="min(560px, 100%)" oncancel={onclose}>
  {#snippet heading(id: string)}
    <div class="head">
      <b {id}>What's new</b>
    </div>
  {/snippet}

  <ol class="entries" {@attach scrollFade}>
    {#each entries as entry (entry.id)}
      <li>
        <div class="meta">
          <time datetime={entry.date}>{formatNewsDate(entry.date)}</time>
          {#if unread.has(entry.id)}
            <span class="tag">New</span>
          {/if}
        </div>
        <h2>{entry.title}</h2>
        <p>{entry.text}</p>
        {#if entry.image}
          <img src={entry.image.src} alt={entry.image.alt} loading="lazy" />
        {/if}
      </li>
    {/each}
  </ol>

  <div class="foot">
    <!-- The way out is the box's main action, as in the card boxes. -->
    <button type="button" class="btn-primary compact" onclick={onclose}>Close</button>
  </div>
</Dialog>

<style>
  .head {
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }

  .head b {
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  /* The middle of the box, the part that scrolls. */
  .entries {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0;
    padding: 4px 16px;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 0;
    border-top: 1px solid var(--panel-2);
  }

  li:first-child {
    border-top: none;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  time {
    font-size: 12px;
    color: var(--faint);
  }

  /* A small Fray red label, in the caps of the captions. */
  .tag {
    padding: 1px 7px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--bg);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 16px;
    line-height: 1.3;
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  img {
    display: block;
    max-width: 100%;
    height: auto;
    margin-top: 6px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
</style>
