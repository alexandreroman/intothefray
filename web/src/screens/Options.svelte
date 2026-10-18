<script lang="ts">
  import { getPref, setPref } from '../lib/prefs';
  import { go } from '../lib/router.svelte';
  import { applyTheme, storedTheme, type Theme } from '../lib/theme';
  import Icon from '../components/Icon.svelte';

  // Card backs are shown on the swatches only; "plain" has none.
  const CARD_BACK =
    'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/HeroBack.jpg';
  const themes: { key: Theme; label: string; bg: string; dot: string; back: boolean }[] = [
    { key: 'official', label: 'Official', bg: '#0c111b', dot: '#161d2b', back: true },
    { key: 'minimal', label: 'Minimal', bg: '#0c111b', dot: '#161d2b', back: false },
    { key: 'felt', label: 'Green felt', bg: '#0f2a1d', dot: '#1d3a2b', back: true },
  ];

  let name = $state(getPref('itf-name') ?? '');
  let theme = $state(storedTheme());

  function onNameInput(): void {
    setPref('itf-name', name.trim());
  }

  function chooseTheme(next: Theme): void {
    theme = next;
    setPref('itf-theme', next);
    applyTheme(next);
  }
</script>

<div class="options table-bg">
  <section>
    <div class="panel">
      <div class="head">
        <button class="back" aria-label="Back" onclick={() => go('#/')}><Icon name="back" /></button
        >
        <b>Options</b>
      </div>
      <div class="field">
        <label for="name">Your name</label>
        <div class="help">Shown to the other players at the table.</div>
        <input
          type="text"
          id="name"
          maxlength="24"
          placeholder="e.g. Alex"
          bind:value={name}
          oninput={onNameInput}
        />
      </div>
      <div class="field">
        <span class="label">Theme</span>
        <div class="help">
          Card backs, first player token and table colours — only on your screen.
        </div>
        <div class="themes">
          {#each themes as t (t.key)}
            <button class="theme" class:on={t.key === theme} onclick={() => chooseTheme(t.key)}>
              <span class="swatch" style:--sw-bg={t.bg} style:--sw-dot={t.dot}>
                <i
                  class:plain={!t.back}
                  style:background-image={t.back ? `url(${CARD_BACK})` : null}
                ></i>
              </span>{t.label}
            </button>
          {/each}
        </div>
      </div>
      <div class="field">
        <label for="lang">Language</label>
        <div class="help">Cards and interface.</div>
        <select id="lang"><option>English</option></select>
      </div>
    </div>
    <div class="saved">Saved in this browser only.</div>
  </section>
</div>

<style>
  .options {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px 16px;
  }

  section {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    animation: rise 0.25s ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  .panel {
    width: 100%;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 24px 60px #000c;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }

  .head b {
    font-size: 16px;
  }

  .back {
    padding: 4px 6px;
    display: inline-flex;
  }

  .back :global(svg) {
    width: 18px;
    height: 18px;
  }

  .field {
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }

  .field:last-child {
    border-bottom: 0;
  }

  label,
  .label {
    display: block;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .help {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 8px;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .theme {
    padding: 6px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
    text-align: center;
    font-size: 12px;
  }

  .theme.on {
    border-color: var(--sel);
    background: #23406a;
  }

  .swatch {
    height: 64px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(var(--sw-dot) 1px, transparent 1.5px) 0 0 / 8px 8px,
      var(--sw-bg);
  }

  .swatch i {
    width: 30px;
    height: 42px;
    border-radius: 3px;
    background: center / cover;
    box-shadow: 2px 2px 4px #000a;
  }

  .swatch i.plain {
    background: #2a3350;
    border: 1px solid #3a4870;
  }

  .saved {
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }
</style>
