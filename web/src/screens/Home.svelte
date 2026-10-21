<script lang="ts">
  import { createGame } from '../lib/api';
  import { playerName } from '../lib/names';
  import { setToken } from '../lib/prefs';
  import { go } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';

  let starting = $state(false);
  let error = $state('');

  async function startGame(name: string): Promise<void> {
    starting = true;
    error = '';
    try {
      const game = await createGame(name);
      setToken(game.id, game.token);
      go(`/g/${encodeURIComponent(game.id)}`);
    } catch (e) {
      error = `Could not start a game: ${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      starting = false;
    }
  }

  function onStart(): void {
    void startGame(playerName());
  }
</script>

<div class="home">
  <div class="halo"></div>

  <main>
    <div class="intro">
      <h1><Logo variant="stacked" size="inherit" /></h1>

      <div class="pitch">
        <p class="tagline">Play Marvel Champions in your browser.</p>
        <p class="sub">
          Play solo or with up to three friends.<br />
          No account, nothing to install: start a game, share the link, deal the cards.
        </p>
      </div>

      <div class="start">
        <div class="actions">
          <button class="secondary" onclick={() => go('/options')}
            ><Icon name="sliders" />Options</button
          >
          <button class="btn-primary" disabled={starting} onclick={onStart}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            Start a game
          </button>
        </div>
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}
      </div>

      <ul class="features">
        <li>
          <span class="icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="11" height="15" rx="2" />
              <path d="M18 7.5l2 .6-3.4 12-6.3-1.8" />
            </svg>
          </span>
          <div>
            <b>A true sandbox</b>
            <p>Every card is yours to move. You play the rules.</p>
          </div>
        </li>
        <li>
          <span class="icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" />
              <path
                d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M16 5.2a3.2 3.2 0 0 1 0 5.8M18 14.4c1.4.7 2.3 2.4 2.6 4.6"
              />
            </svg>
          </span>
          <div>
            <b>Up to 4 heroes</b>
            <p>Spectators can watch any game in progress.</p>
          </div>
        </li>
        <li>
          <span class="icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
              <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
            </svg>
          </span>
          <div>
            <b>Bring your own deck</b>
            <p>Paste a deck link and you are ready.</p>
          </div>
        </li>
      </ul>
    </div>

    <!-- Decoration only: three card backs fanned out, the middle one marked with the logo. -->
    <div class="fan" aria-hidden="true">
      <div class="backs">
        <div class="back left"></div>
        <div class="back middle"><Logo variant="mark" size={96} /></div>
        <div class="back right"></div>
      </div>
      <span class="caption">1 to 4 players</span>
    </div>
  </main>

  <footer>Fan-made and unofficial. Not affiliated with Marvel or Fantasy Flight Games.</footer>
</div>

<style>
  .home {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--table-bg);
    /* The fanned cards reach past a narrow screen: they are cut, never scrolled to. */
    overflow: hidden;
  }

  /* Red dots fading out around the fanned cards. */
  .halo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 22%, transparent) 1.3px,
      transparent 1.9px
    );
    background-size: 10px 10px;
    mask-image: radial-gradient(ellipse at 72% 42%, #000 0%, transparent 48%);
  }

  main {
    position: relative;
    flex: 1;
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 72px 24px 40px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 48px 64px;
    animation: rise 0.25s ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  .intro {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  /* The logo's size, that of its "FRAY". The stacked logo is about 3.2 times as wide as
     that: it shrinks to fit a phone, within the page's 32px of side gutters. As a flex
     container, the heading draws no line box around the logo. */
  h1 {
    display: flex;
    margin: 0;
    font-size: clamp(64px, (100vw - 32px) / 3.2, 168px);
  }

  .pitch {
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pitch p {
    margin: 0;
  }

  .tagline {
    font-stretch: 85%;
    font-weight: 700;
    font-size: 26px;
    line-height: 1.2;
  }

  .sub {
    font-size: 16px;
    line-height: 1.55;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 14px;
  }

  .actions button {
    height: 56px;
    display: inline-flex;
    align-items: center;
  }

  /* The home screen's call to action is a size up from the shared one. */
  .actions .btn-primary {
    gap: 12px;
    padding: 0 34px;
    font-size: 17px;
    clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  }

  .btn-primary svg {
    width: 20px;
    height: 20px;
  }

  .secondary {
    gap: 10px;
    padding: 0 22px;
    font-size: 15px;
    border-radius: 12px;
    background: var(--panel);
  }

  .secondary :global(svg) {
    width: 18px;
    height: 18px;
  }

  .start {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .error {
    margin: 0;
    color: var(--accent);
  }

  .features {
    margin: 0;
    padding: 28px 0 0;
    list-style: none;
    border-top: 1px solid var(--panel-2);
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }

  .features li {
    flex: 1 1 180px;
    min-width: 0;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .features b {
    display: block;
    margin-bottom: 3px;
    font-size: 14px;
    font-weight: 700;
  }

  .features p {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--muted);
  }

  .features .icon {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--spark);
  }

  .icon svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .fan {
    flex: 1 1 400px;
    min-width: 0;
    position: relative;
    height: 560px;
  }

  .backs {
    position: absolute;
    inset: 0;
  }

  .back {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 228px;
    height: 318px;
    border-radius: 14px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    box-shadow: 0 24px 60px rgb(0 0 0 / 55%);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* An inner frame, dotted towards its centre. */
  .back::before,
  .back::after {
    content: '';
    position: absolute;
    inset: 12px;
    border-radius: 8px;
  }

  .back::before {
    border: 1.5px solid color-mix(in srgb, var(--accent) 55%, transparent);
    background-image: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent) 38%, transparent) 1.2px,
      transparent 1.8px
    );
    background-size: 8px 8px;
    mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 72%);
  }

  .back::after {
    border: 1.5px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .back :global(.logo) {
    position: relative;
  }

  .left {
    margin: -170px 0 0 -250px;
    transform: rotate(-16deg);
  }

  .middle {
    margin: -190px 0 0 -114px;
    transform: rotate(-2deg);
  }

  .right {
    margin: -150px 0 0 24px;
    transform: rotate(15deg);
  }

  .fan .caption {
    position: absolute;
    right: 6%;
    top: 40px;
    padding: 8px 18px 8px 12px;
    font-size: 14px;
    transform: rotate(4deg);
  }

  footer {
    position: relative;
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 20px 24px 28px;
    font-size: 12px;
    color: var(--faint);
  }

  /* A phone: 16px gutters, and a smaller fan under the buttons. */
  @media (max-width: 640px) {
    main {
      padding: 40px 16px 24px;
    }

    footer {
      padding: 16px 16px 24px;
    }

    .fan {
      height: 340px;
    }

    .backs {
      scale: 0.6;
    }

    .fan .caption {
      top: 8px;
    }
  }
</style>
