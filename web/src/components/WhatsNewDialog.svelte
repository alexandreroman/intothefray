<!--
  The news of the app, newest first, opened from the home screen. The entries
  that were unread when it opened carry a "New" tag; whoever opens it marks
  them seen. Escape, Close or a click outside closes it.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
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

  /** The entries the list shows at most; past them, it scrolls. */
  const SHOWN_ENTRIES = 3;

  /**
   * Attachment for the list: caps its height at its first entries, whose heights vary with their
   * text and the width, so it measures them: from the list's top to the top of the entry after
   * them, its top padding included. Measured again whenever the list or an entry resizes.
   */
  function capToFirstEntries(list: HTMLElement): () => void {
    function refresh(): void {
      const next = list.children[SHOWN_ENTRIES];
      if (next === undefined) {
        list.style.maxHeight = '';
        return;
      }
      // A scrolled list has moved its entries up: the scroll offset adds back what went by.
      const extent =
        next.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.style.maxHeight = `${extent}px`;
    }

    refresh();
    const resizes = new ResizeObserver(refresh);
    resizes.observe(list);
    for (const entry of list.children) {
      resizes.observe(entry);
    }
    return () => resizes.disconnect();
  }
</script>

<Dialog title="What's new" wide width="min(560px, 100%)" oncancel={onclose}>
  {#snippet heading(id: string)}
    <div class="head">
      <Icon name="megaphone" />
      <b {id}>What's new</b>
    </div>
  {/snippet}

  <ol class="entries" {@attach scrollFade} {@attach capToFirstEntries}>
    {#each entries as entry (entry.id)}
      <li class:illustrated={entry.image}>
        {#if entry.image}
          <img src={entry.image.src} alt={entry.image.alt} width="112" height="84" loading="lazy" />
        {/if}
        <div class="body">
          <div class="meta">
            <time datetime={entry.date}>{formatNewsDate(entry.date)}</time>
            {#if unread.has(entry.id)}
              <span class="tag">New</span>
            {/if}
          </div>
          <h2>{entry.title}</h2>
          <p>{entry.text}</p>
        </div>
      </li>
    {/each}
  </ol>

  <div class="foot">
    <!-- The way out is the box's main action, as in the card boxes. -->
    <button type="button" class="btn-primary compact" onclick={onclose}>Close</button>
  </div>
</Dialog>

<style>
  /* The Home button's megaphone before the title, in the same colour: the text's. */
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }

  .head :global(svg) {
    width: 20px;
    height: 20px;
    color: var(--text);
  }

  .head b {
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  /* The middle of the box, the part that scrolls. */
  /* A size container: the thumbnails shrink when the list is narrow (a phone). */
  .entries {
    container: news / inline-size;
    flex: 1 1 auto;
    min-height: 0;
    margin: 0;
    padding: 4px 16px;
    overflow-y: auto;
    list-style: none;
  }

  li {
    padding: 16px 0;
    border-top: 1px solid var(--panel-2);
  }

  /* An entry with a thumbnail: the thumbnail on the left, centred on the height of the text beside it. */
  li.illustrated {
    display: grid;
    grid-template-columns: 112px 1fr;
    align-items: center;
    gap: 14px;
  }

  .body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
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

  /* A 4:3 capture of the app: the width and height attributes reserve its place before it loads. */
  img {
    display: block;
    width: 112px;
    height: 84px;
    object-fit: cover;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  /* A phone: a smaller thumbnail, still beside the text. */
  @container news (max-width: 420px) {
    li.illustrated {
      grid-template-columns: 72px 1fr;
      gap: 12px;
    }

    img {
      width: 72px;
      height: 54px;
    }
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
</style>
