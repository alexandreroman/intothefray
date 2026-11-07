<script lang="ts">
  import { onMount } from 'svelte';
  import { isLang, OFFERED_LANGS, setLang, storedLang } from '../lib/lang';
  import {
    MAX_NAME_LENGTH,
    randomName,
    savePlayerName,
    storedName,
    stripEmoji,
  } from '../lib/names';
  import { go, href } from '../lib/router.svelte';
  import { selectionIndicator } from '../lib/selectionIndicator';
  import { applyTheme, saveTheme, storedTheme, THEMES, type Theme } from '../lib/theme';
  import { appCommit, fetchServerCommit, shortCommit } from '../lib/version';
  import Icon from '../components/Icon.svelte';
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
  const mismatchedServer = $derived(server !== undefined && server !== app ? server : undefined);

  onMount(() => {
    fetchServerCommit().then(
      (commit) => (server = commit),
      () => (serverFailed = true),
    );
  });

  /** The name input's value and selection. */
  interface NameEdit {
    value: string;
    start: number;
    end: number;
  }

  // The name input as it was just before the edit being typed, set by beforeinput.
  let beforeEdit: NameEdit | undefined;

  function onNameBeforeInput(event: Event & { currentTarget: HTMLInputElement }): void {
    const input = event.currentTarget;
    beforeEdit = {
      value: input.value,
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  }

  function onNameInput(event: Event & { currentTarget: HTMLInputElement }): void {
    // Not trimmed here, so that a space can be typed between two words. Limited in code points,
    // as the server counts them, not by maxlength, which counts UTF-16 units.
    const input = event.currentTarget;
    const typed = stripEmoji(input.value);
    const edit = beforeEdit;
    beforeEdit = undefined;
    if (Array.from(typed).length <= MAX_NAME_LENGTH || edit === undefined) {
      name = Array.from(typed).slice(0, MAX_NAME_LENGTH).join('');
    } else {
      // Written to the input here, with its selection, as bind:value would put the caret at the end.
      const fitted = keepWhatFits(edit, typed);
      name = fitted.value;
      input.value = fitted.value;
      input.setSelectionRange(fitted.start, fitted.end);
    }
    savePlayerName(name);
  }

  /**
   * The name after an edit that goes over the limit, as maxlength leaves it: the text inserted over
   * the selection is kept as far as it fits, with the caret after it. An edit that inserts nothing
   * that fits, or is not an insertion over the selection, is refused: the name and its selection
   * stay as they were.
   */
  function keepWhatFits(edit: NameEdit, typed: string): NameEdit {
    const head = edit.value.slice(0, edit.start);
    const tail = edit.value.slice(edit.end);
    const isInsertion =
      typed.length >= head.length + tail.length && typed.startsWith(head) && typed.endsWith(tail);
    if (!isInsertion) {
      return edit;
    }
    const room = Math.max(0, MAX_NAME_LENGTH - Array.from(head + tail).length);
    const insertedText = typed.slice(head.length, typed.length - tail.length);
    const inserted = Array.from(insertedText).slice(0, room).join('');
    if (inserted === '') {
      return edit;
    }
    const caret = head.length + inserted.length;
    return { value: head + inserted + tail, start: caret, end: caret };
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

<div class="screen-page settings-page">
  <TopBar onback={() => go('/')} />

  <main class="screen-column">
    <div class="head">
      <div class="title">
        <span class="caption">Options</span>
        <h1 class="display">SUIT UP</h1>
      </div>
      <p class="note">
        <Icon name="info" />
        Saved in this browser only. Changes apply right away.
      </p>
    </div>

    <div class="settings-row">
      <div class="settings-side">
        <label class="settings-title" for="name">Your name</label>
        <p>Shown to the other players at the table.</p>
      </div>
      <div class="settings-body name">
        <input
          type="text"
          id="name"
          placeholder="e.g. Alex"
          bind:value={name}
          onbeforeinput={onNameBeforeInput}
          oninput={onNameInput}
        />
        <button
          class="dice"
          aria-label="Pick a new random name"
          title="Pick a new random name"
          onclick={pickRandomName}
        >
          <Icon name="dice" />
        </button>
      </div>
    </div>

    <div class="settings-row">
      <div class="settings-side">
        <span class="settings-title">Theme</span>
        <p>Card backs, first player token and table colours: only on your screen.</p>
      </div>
      <div
        class="settings-body themes"
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
                  <Icon name="check" />
                </span>
              {:else}
                <span class="ring"></span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <!-- No choice to make while a single language is offered. -->
    {#if OFFERED_LANGS.length > 1}
      <div class="settings-row">
        <div class="settings-side">
          <label class="settings-title" for="lang">Language</label>
          <p>Card names and images. The interface stays in English.</p>
        </div>
        <div class="settings-body">
          <select id="lang" value={lang} onchange={(e) => chooseLang(e.currentTarget.value)}>
            {#each OFFERED_LANGS as option (option.code)}
              <option value={option.code} lang={option.code}>{option.label}</option>
            {/each}
          </select>
        </div>
      </div>
    {/if}

    <footer>
      <a class="about-link text-link" href={href('/about')}>About Into the Fray</a>
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
    </footer>
  </main>
</div>

{#snippet commit(sha: string)}
  <span title={sha}>{shortCommit(sha)}</span>
{/snippet}

<style>
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

  .note :global(svg) {
    width: 16px;
    height: 16px;
  }

  /* A setting: its label and help on the side, its control in the body, 16px under them on a phone. */
  .settings-row {
    row-gap: 16px;
  }

  .settings-title {
    display: block;
    margin-bottom: 6px;
  }

  .settings-side p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--muted);
  }

  input,
  select {
    height: 48px;
    border-radius: 12px;
    font-size: 15px;
  }

  input {
    padding: 0 14px;
  }

  /* The side padding goes through --select-pad, so the drawn arrow keeps the same inset. */
  select {
    --select-pad: 14px;
    max-width: 280px;
    padding-block: 0;
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

  .dice :global(svg) {
    width: 20px;
    height: 20px;
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
    position: relative;
    isolation: isolate;
    width: var(--card-w);
    aspect-ratio: var(--card-ratio);
    transform: rotate(-6deg);
  }

  /* The card's shadow, cast from 2px inside its edge, under its back, as on the table (see --card-shadow). */
  .card::before {
    content: '';
    position: absolute;
    inset: 2px;
    z-index: -1;
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
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

  .check :global(svg) {
    width: 13px;
    height: 13px;
    stroke-width: 3;
  }

  /* As tall as the check, so that the labels line up. */
  .ring {
    width: 18px;
    height: 18px;
    margin: 2px;
    border-radius: 50%;
    border: 1.5px solid #3a4766;
  }

  /* The about link on the left, the version on the right. */
  footer {
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px 24px;
  }

  .about-link {
    --link-color: var(--muted);
    font-size: 13px;
  }

  .version {
    margin: 0 0 0 auto;
    text-align: right;
    font-size: 11px;
    color: color-mix(in srgb, var(--faint) 60%, var(--table-bg));
  }

  /* As subdued as the faint line, yet still noticeable. */
  .version.mismatch {
    color: color-mix(in srgb, var(--warn) 60%, var(--table-bg));
  }

  /* A phone: smaller theme cards to fit three in a row. */
  @media (max-width: 560px) {
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
