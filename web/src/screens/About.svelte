<script lang="ts">
  import { go } from '../lib/router.svelte';
  import TopBar from '../components/TopBar.svelte';

  const REPOSITORY = 'https://github.com/alexandreroman/intothefray';
  const LICENSE = `${REPOSITORY}/blob/main/LICENSE`;

  /** A community project the cards come from, and what it gives them. */
  interface Source {
    name: string;
    /** Its public page, if it has one. */
    url?: string;
    provides: string;
  }

  const SOURCES: Source[] = [
    {
      name: 'marvelcdb',
      url: 'https://marvelcdb.com',
      provides: 'Card data, decks and French names',
    },
    { name: 'Cerebro', provides: 'Card images and data' },
    {
      name: 'mc4db',
      url: 'https://mc4db.merlindumesnil.net',
      provides: 'Card data and French names',
    },
    { name: 'cgbuilder', url: 'https://mc.cgbuilder.fr', provides: 'French card names' },
    { name: 'OCTGN Marvel Champions image packs', provides: 'Scans of the French cards' },
  ];
</script>

<div class="about">
  <TopBar onback={() => go('/')} />

  <main>
    <div class="head">
      <span class="caption">About</span>
      <h1 class="display">ORIGIN STORY</h1>
    </div>

    <section class="row">
      <h2>Open source</h2>
      <div class="body">
        <p>
          Into The Fray is open source, under the
          <a href={LICENSE} target="_blank" rel="noopener noreferrer">Apache-2.0 license</a>.
        </p>
        <p>
          <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">Source code on GitHub</a>.
          Issues and contributions are welcome.
        </p>
      </div>
    </section>

    <section class="row">
      <h2>Card data</h2>
      <div class="body">
        <p>The cards come from community projects. Thanks to their authors for their work.</p>
        <ul class="sources">
          {#each SOURCES as source (source.name)}
            <li>
              {#if source.url}
                <a class="name" href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </a>
              {:else}
                <span class="name">{source.name}</span>
              {/if}
              <span class="provides">{source.provides}</span>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="row">
      <h2>Unofficial fan project</h2>
      <div class="body">
        <p>
          Into The Fray is not affiliated with or endorsed by Fantasy Flight Games or Marvel. Marvel
          Champions: The Card Game is a trademark of its owners; card images and texts belong to
          their respective owners.
        </p>
      </div>
    </section>
  </main>
</div>

<style>
  /* The column's width and gutter are shared with the top bar. */
  .about {
    --content-max: 920px;
    --content-gutter: 24px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--table-bg);
  }

  main {
    flex: 1;
    width: 100%;
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 44px var(--content-gutter) 56px;
    display: flex;
    flex-direction: column;
    animation: rise 0.25s ease-out;
  }

  .head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 28px;
  }

  /* A section: its heading on the left, its text on the right, or below on a phone. */
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 40px;
    padding: 28px 0;
    border-top: 1px solid var(--panel-2);
  }

  .row:last-of-type {
    border-bottom: 1px solid var(--panel-2);
  }

  h2 {
    flex: 1 1 220px;
    min-width: 0;
    margin: 0;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  .body {
    flex: 999 1 420px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  .body p {
    margin: 0;
  }

  /* No global link style: the text's own colour, underlined, brighter on hover. */
  a {
    color: var(--text-soft);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 3px;
    transition:
      color 0.12s,
      text-decoration-color 0.12s;
  }

  a:hover {
    color: var(--text);
    text-decoration-color: currentColor;
  }

  a:focus-visible {
    outline: 2px solid var(--sel);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .sources {
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  /* The project's name, then what it gives, wrapping under the name when there is no room. */
  .sources li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 16px;
    padding: 8px 0;
    border-top: 1px solid var(--panel-2);
  }

  .sources li:first-child {
    border-top: none;
  }

  .name {
    flex: 0 0 200px;
    font-weight: 700;
  }

  span.name {
    color: var(--text-soft);
  }

  .provides {
    flex: 1 1 200px;
  }

  /* A phone: 16px gutters. */
  @media (max-width: 560px) {
    .about {
      --content-gutter: 16px;
    }

    main {
      padding-top: 32px;
      padding-bottom: 40px;
    }
  }
</style>
