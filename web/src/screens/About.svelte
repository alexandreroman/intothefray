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
    {
      name: 'Cerebro',
      url: 'https://github.com/UnicornSnuggler/Cerebro',
      provides: 'Card images and data',
    },
    {
      name: 'mc4db',
      url: 'https://mc4db.merlindumesnil.net',
      provides: 'Card data and French names',
    },
    { name: 'cgbuilder', url: 'https://mc.cgbuilder.fr', provides: 'French card names' },
    { name: 'OCTGN', provides: 'Scans of the French cards' },
  ];
</script>

<div class="screen-page settings-page">
  <TopBar onback={() => go('/')} />

  <main class="screen-column">
    <div class="head">
      <span class="caption">About</span>
      <h1 class="display">ORIGIN STORY</h1>
    </div>

    <section class="settings-row">
      <h2 class="settings-side settings-title">Open source</h2>
      <div class="settings-body">
        <p>
          Into the Fray is open source, under the
          <a class="text-link" href={LICENSE} target="_blank" rel="noopener noreferrer"
            >Apache-2.0 license</a
          >.
        </p>
        <p>
          <a class="text-link" href={REPOSITORY} target="_blank" rel="noopener noreferrer"
            >Source code on GitHub</a
          >. Issues and contributions are welcome.
        </p>
      </div>
    </section>

    <section class="settings-row">
      <h2 class="settings-side settings-title">Card data</h2>
      <div class="settings-body">
        <p>The cards come from community projects. Thanks to their authors for their work.</p>
        <ul class="sources">
          {#each SOURCES as source (source.name)}
            <li>
              {#if source.url}
                <a
                  class="name text-link"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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

    <section class="settings-row">
      <h2 class="settings-side settings-title">Unofficial fan project</h2>
      <div class="settings-body">
        <p>Into the Fray is not affiliated with or endorsed by Fantasy Flight Games or Marvel.</p>
        <p>
          Marvel Champions: The Card Game is a trademark of its owners; card images and texts belong
          to their respective owners.
        </p>
      </div>
    </section>
  </main>
</div>

<style>
  .head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 28px;
  }

  h2 {
    margin: 0;
  }

  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  .settings-body p {
    margin: 0;
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
</style>
