<script lang="ts">
  import { randomName, savePlayerName } from '../lib/names';
  import { getPref, setPref } from '../lib/prefs';
  import { go } from '../lib/router.svelte';
  import { applyTheme, storedTheme, type Theme } from '../lib/theme';
  import TopBar from '../components/TopBar.svelte';

  // Each card shows its theme whatever the current one: a table, a card back
  // ("plain" has none) and the first player token.
  const CARD_BACK =
    'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/HeroBack.jpg';
  const themes: { key: Theme; label: string; bg: string; dot: string; back: boolean }[] = [
    { key: 'official', label: 'Official', bg: '#07090f', dot: '#1a2133', back: true },
    { key: 'minimal', label: 'Minimal', bg: '#07090f', dot: '#1a2133', back: false },
    { key: 'felt', label: 'Green felt', bg: '#0e2419', dot: '#1b3a2a', back: true },
  ];

  let name = $state(getPref('itf-name') ?? '');
  let theme = $state(storedTheme());

  function onNameInput(): void {
    savePlayerName(name);
  }

  function pickRandomName(): void {
    name = randomName();
    savePlayerName(name);
  }

  function chooseTheme(next: Theme): void {
    theme = next;
    setPref('itf-theme', next);
    applyTheme(next);
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
          maxlength="24"
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
        <p>Card backs, first player token and table colours — only on your screen.</p>
      </div>
      <div class="control themes">
        {#each themes as t (t.key)}
          {@const selected = t.key === theme}
          <button
            class="theme"
            class:on={selected}
            aria-pressed={selected}
            onclick={() => chooseTheme(t.key)}
          >
            <span class="surface" style:--sw-bg={t.bg} style:--sw-dot={t.dot}>
              <span
                class="card"
                class:plain={!t.back}
                style:background-image={t.back ? `url(${CARD_BACK})` : null}
              ></span>
              <span class="token" class:plain={!t.back}>
                {#if t.back}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 1.5 L14.6 9.4 L22.5 12 L14.6 14.6 L12 22.5 L9.4 14.6 L1.5 12 L9.4 9.4 Z"
                    />
                  </svg>
                {:else}
                  <span aria-hidden="true">1</span>
                {/if}
              </span>
            </span>
            <span class="theme-label">
              {t.label}
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
        <p>Cards and interface.</p>
      </div>
      <div class="control">
        <select id="lang"><option>English</option></select>
      </div>
    </div>
  </main>
</div>

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

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
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

  h1 {
    margin: 0;
    font-size: 56px;
    line-height: 0.9;
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

  .row:last-child {
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

  /* A ring outside the border, so that the selected card keeps its size. */
  .theme.on {
    border-color: var(--sel);
    box-shadow:
      0 0 0 1px var(--sel),
      0 0 0 5px color-mix(in srgb, var(--sel) 16%, transparent);
  }

  .surface {
    height: 132px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background:
      radial-gradient(circle, var(--sw-dot) 1px, transparent 1.6px) 0 0 / 12px 12px,
      var(--sw-bg);
  }

  .card {
    width: 56px;
    height: 78px;
    border-radius: 5px;
    background: center / cover;
    box-shadow: 0 8px 18px rgb(0 0 0 / 50%);
    transform: rotate(-6deg);
  }

  .card.plain {
    background: var(--panel);
    border: 1px solid #3a4766;
  }

  .token {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--bg);
    border: 2.5px solid var(--spark);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .token svg {
    width: 16px;
    height: 16px;
    fill: var(--spark);
  }

  .token.plain {
    border-color: var(--muted);
    font-stretch: 62%;
    font-weight: 900;
    font-size: 14px;
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
      height: 104px;
      gap: 8px;
    }

    .card {
      width: 42px;
      height: 58px;
    }

    .token {
      width: 28px;
      height: 28px;
    }

    .theme-label {
      padding: 10px;
      font-size: 13px;
    }
  }
</style>
