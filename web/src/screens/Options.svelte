<script lang="ts">
  import { onMount } from 'svelte';
  import { isLang, LANGS, setLang, storedLang } from '../lib/lang';
  import {
    MAX_NAME_LENGTH,
    randomName,
    savePlayerName,
    storedName,
    stripEmoji,
  } from '../lib/names';
  import { go } from '../lib/router.svelte';
  import { selectionIndicator } from '../lib/selectionIndicator';
  import { applyTheme, saveTheme, storedTheme, THEMES, type Theme } from '../lib/theme';
  import { appCommit, fetchServerCommit, shortCommit } from '../lib/version';
  import TopBar from '../components/TopBar.svelte';
  import CardBack from '../table/CardBack.svelte';
  import FirstPlayerArt from '../table/FirstPlayerArt.svelte';
  import { FIRST_PLAYER_BOX, PORTRAIT_CARD } from '../table/layout';

  // Each card shows its theme whatever the current one, drawn by the table's own pieces: the
  // table's colours (tokens.css, under the preview's data-theme), a player card back and the
  // first player token, as large next to the card as on the table.
  const THEME_LABELS: Record<Theme, string> = {
    official: 'Official',
    minimal: 'Minimal',
    felt: 'Green felt',
  };

  let name = $state(storedName());
  let theme = $state(storedTheme());
  let lang = $state(storedLang());

  const app = appCommit();
  let server = $state<string>();
  let serverFailed = $state(false);
  // The server commit, once it is known to differ from the app's.
  let mismatchedServer = $derived(server !== undefined && server !== app ? server : undefined);

  onMount(() => {
    fetchServerCommit().then(
      (commit) => (server = commit),
      () => (serverFailed = true),
    );
  });

  function onNameInput(): void {
    // Not trimmed here, so that a space can be typed between two words.
    name = stripEmoji(name);
    savePlayerName(name);
  }

  function pickRandomName(): void {
    name = randomName();
    savePlayerName(name);
  }

  function chooseTheme(next: Theme): void {
    theme = next;
    saveTheme(next);
    applyTheme(next);
  }

  function chooseLang(next: string): void {
    if (isLang(next)) {
      lang = next;
      setLang(next);
    }
  }
</script>

<div class="options">
  <TopBar onback={() => go('/')} />

  <main>
    <div class="head">
      <div class="title">
        <span class="caption">Options</span>
        <h1 class="display">SUIT UP</h1>
      </div>
      <p class="note">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
        Saved in this browser only. Changes apply right away.
      </p>
    </div>

    <div class="row">
      <div class="about">
        <label for="name">Your name</label>
        <p>Shown to the other players at the table.</p>
      </div>
      <div class="control name">
        <input
          type="text"
          id="name"
          maxlength={MAX_NAME_LENGTH}
          placeholder="e.g. Alex"
          bind:value={name}
          oninput={onNameInput}
        />
        <button
          class="dice"
          aria-label="Pick a new random name"
          title="Pick a new random name"
          onclick={pickRandomName}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="3.5" />
            <circle cx="9" cy="9" r="1.2" />
            <circle cx="15" cy="15" r="1.2" />
            <circle cx="15" cy="9" r="1.2" />
            <circle cx="9" cy="15" r="1.2" />
          </svg>
        </button>
      </div>
    </div>

    <div class="row">
      <div class="about">
        <span class="label">Theme</span>
        <p>Card backs, first player token and table colours: only on your screen.</p>
      </div>
      <div
        class="control themes"
        use:selectionIndicator
        style:--card-ratio="{PORTRAIT_CARD.w} / {PORTRAIT_CARD.h}"
        style:--token-ratio="{FIRST_PLAYER_BOX.w} / {FIRST_PLAYER_BOX.h}"
        style:--token-scale={FIRST_PLAYER_BOX.w / PORTRAIT_CARD.w}
      >
        <!-- The ring around the chosen theme, over its card's edge: it slides to the next one. -->
        <span class="ring-sel" data-indicator aria-hidden="true"></span>
        {#each THEMES as key (key)}
          {@const selected = key === theme}
          <button class="theme" aria-pressed={selected} onclick={() => chooseTheme(key)}>
            <!-- Only a picture: the button is named by its label. -->
            <span class="surface table-bg" data-theme={key} aria-hidden="true">
              <span class="card"><CardBack back="player" theme={key} /></span>
              <span class="token"><FirstPlayerArt theme={key} /></span>
            </span>
            <span class="theme-label">
              {THEME_LABELS[key]}
              {#if selected}
                <span class="check">
                  <svg viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="M5 12.5l4.5 4.5L19 7.5" /></svg
                  >
                </span>
              {:else}
                <span class="ring"></span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <div class="about">
        <label for="lang">Language</label>
        <p>Card names and images. The interface stays in English.</p>
      </div>
      <div class="control">
        <select id="lang" value={lang} onchange={(e) => chooseLang(e.currentTarget.value)}>
          {#each LANGS as option (option.code)}
            <option value={option.code} lang={option.code}>{option.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <p class="version" class:mismatch={mismatchedServer !== undefined}>
      version
      {#if mismatchedServer}
        mismatch {@render commit(app)}/{@render commit(mismatchedServer)}
      {:else if serverFailed}
        {@render commit(app)}/unavailable
      {:else}
        {@render commit(app)}
      {/if}
    </p>
  </main>
</div>

{#snippet commit(sha: string)}
  <span title={sha}>{shortCommit(sha)}</span>
{/snippet}

<style>
  /* The column's width and gutter are shared with the top bar. */
  .options {
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
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px 32px;
    padding-bottom: 28px;
  }

  .title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .note {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }

  .note svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  /* A setting: its label and help on the left, its control on the right, or below on a phone. */
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 40px;
    padding: 28px 0;
    border-top: 1px solid var(--panel-2);
  }

  /* The last setting: the version line after it is no .row. */
  .row:last-of-type {
    border-bottom: 1px solid var(--panel-2);
  }

  .about {
    flex: 1 1 220px;
    min-width: 0;
  }

  .about label,
  .about .label {
    display: block;
    margin-bottom: 6px;
    font-stretch: 85%;
    font-weight: 800;
    font-size: 18px;
  }

  .about p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  .control {
    flex: 999 1 420px;
    min-width: 0;
  }

  input,
  select {
    height: 48px;
    padding: 0 14px;
    border-radius: 12px;
    font-size: 15px;
  }

  /* The native arrow, drawn as a chevron of two triangles. */
  select {
    max-width: 280px;
    appearance: none;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--muted) 50%),
      linear-gradient(135deg, var(--muted) 50%, transparent 50%);
    background-position:
      calc(100% - 20px) 21px,
      calc(100% - 15px) 21px;
    background-size: 5px 5px;
    background-repeat: no-repeat;
  }

  .name {
    display: flex;
    gap: 8px;
  }

  .dice {
    flex: none;
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .dice svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linejoin: round;
  }

  .dice circle {
    fill: currentColor;
    stroke: none;
  }

  .themes {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .theme {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    border-radius: 14px;
    border-color: var(--line);
    background: var(--bg);
    text-align: left;
    white-space: normal;
    overflow: hidden;
  }

  /* On the card's border and outside it, so that the selected card keeps its size. */
  .ring-sel {
    z-index: 1;
    border: 1px solid var(--sel);
    border-radius: 14px;
    box-shadow:
      0 0 0 1px var(--sel),
      0 0 0 5px color-mix(in srgb, var(--sel) 16%, transparent);
  }

  /* The table in the theme's colours (.table-bg), the card's width setting the pieces' sizes. */
  .surface {
    --card-w: 56px;
    height: 132px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  /* A table card, tilted, with its shadow on the table. */
  .card {
    width: var(--card-w);
    aspect-ratio: var(--card-ratio);
    filter: var(--card-shadow);
    transform: rotate(-6deg);
  }

  /* The first player token, in its box from the table, sized against the card as there. */
  .token {
    width: calc(var(--card-w) * var(--token-scale));
    aspect-ratio: var(--token-ratio);
    filter: var(--token-shadow);
  }

  .theme-label {
    padding: 12px 14px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
    font-size: 14px;
  }

  .check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--sel);
    color: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .check svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* As tall as the check, so that the labels line up. */
  .ring {
    width: 18px;
    height: 18px;
    margin: 2px;
    border-radius: 50%;
    border: 1.5px solid #3a4766;
  }

  .version {
    margin: 20px 0 0;
    text-align: right;
    font-size: 11px;
    color: color-mix(in srgb, var(--faint) 60%, var(--table-bg));
  }

  /* As subdued as the faint line, yet still noticeable. */
  .version.mismatch {
    color: color-mix(in srgb, var(--warn) 60%, var(--table-bg));
  }

  /* A phone: 16px gutters, and smaller theme cards to fit three in a row. */
  @media (max-width: 560px) {
    .options {
      --content-gutter: 16px;
    }

    main {
      padding-top: 32px;
      padding-bottom: 40px;
    }

    .themes {
      gap: 8px;
    }

    .surface {
      --card-w: 42px;
      height: 104px;
      gap: 8px;
    }

    .theme-label {
      padding: 10px;
      font-size: 13px;
    }
  }
</style>
