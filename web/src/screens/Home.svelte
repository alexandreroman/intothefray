<script lang="ts">
  import { tick } from 'svelte';
  import { createGame } from '../lib/api';
  import { playerName } from '../lib/names';
  import { NewsState } from '../lib/newsState.svelte';
  import { setToken } from '../lib/prefs';
  import { gamePath, go } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import Tooltip from '../components/Tooltip.svelte';
  import WhatsNewDialog from '../components/WhatsNewDialog.svelte';
  import { lastPressByPointer } from '../components/modal.svelte';

  let starting = $state(false);
  let error = $state('');

  const news = new NewsState();
  const hasUnread = $derived(news.unread.length > 0);
  // The ids of the entries unread when the dialog opened, tagged as new in it; none while it is closed.
  let shownUnread = $state<ReadonlySet<string> | null>(null);

  let newsButton = $state<HTMLButtonElement>();
  // What had the focus when the dialog opened, and whether the pointer opened it (see Dialog).
  let opener: Element | null = null;
  let openedByPointer = false;

  /** Opens the news, which are all seen from then on: the dot and the banner go. */
  function openWhatsNew(): void {
    opener = document.activeElement;
    openedByPointer = lastPressByPointer();
    shownUnread = new Set(news.unread.map((entry) => entry.id));
    news.markSeen();
  }

  async function closeWhatsNew(): Promise<void> {
    shownUnread = null;
    await tick();
    // Opened from the banner, the dialog took the banner away with its button: the dialog gives the
    // focus back to nothing, so the What's new button takes it, as the dialog would have given it.
    if (opener !== null && !opener.isConnected) {
      if (openedByPointer) {
        newsButton?.focus({ focusVisible: false });
      } else {
        newsButton?.focus();
      }
    }
    opener = null;
  }

  async function startGame(): Promise<void> {
    starting = true;
    error = '';
    try {
      const game = await createGame(playerName());
      setToken(game.id, game.token);
      go(gamePath(game.id));
    } catch (e) {
      error = `Could not start a game: ${e instanceof Error ? e.message : 'unknown error'}`;
    } finally {
      starting = false;
    }
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
        <!-- As wide as the button row: the banner ends where its last button does. -->
        <div class="row">
          {#if news.bannerEntry}
            <aside class="banner" aria-label="Latest news">
              <p><span class="label">New:</span> {news.bannerEntry.title}</p>
              <button class="see" onclick={openWhatsNew}>See what's new</button>
              <button
                class="btn-ghost dismiss"
                aria-label="Dismiss"
                onclick={() => news.dismissBanner()}><Icon name="cross" /></button
              >
            </aside>
          {/if}
          <div class="actions">
            <button class="btn-primary" disabled={starting} onclick={startGame}>
              <Icon name="arrow-right" />
              Start a game
            </button>
            <!-- The secondary buttons wrap together, as one group, under Start. -->
            <div class="more">
              <!-- An icon only when the row is short of room: the label still names the button, out of sight. -->
              <button class="secondary" data-tip="Options" onclick={() => go('/options')}>
                <Icon name="sliders" /><span class="text">Options</span>
              </button>
              <button class="secondary" data-tip="About" onclick={() => go('/about')}>
                <Icon name="info" /><span class="text">About</span>
              </button>
              <!-- An icon only, so that the four buttons share a row. The dot says there is news, never
                   how many: so does the button's name. -->
              <button
                class="secondary news"
                aria-label={hasUnread ? "What's new, unread news" : "What's new"}
                data-tip="What's new"
                bind:this={newsButton}
                onclick={openWhatsNew}
              >
                <Icon name="sparkle" />
                {#if hasUnread}
                  <span class="dot" aria-hidden="true"></span>
                {/if}
              </button>
            </div>
          </div>
        </div>
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}
      </div>

      <ul class="features">
        <li>
          <span class="icon">
            <Icon name="sandbox" />
          </span>
          <div>
            <b>A true sandbox</b>
            <p>Every card is yours to move. You play the rules.</p>
          </div>
        </li>
        <li>
          <span class="icon">
            <Icon name="players" />
          </span>
          <div>
            <b>Up to 4 heroes</b>
            <p>Spectators can watch any game in progress.</p>
          </div>
        </li>
        <li>
          <span class="icon">
            <Icon name="link" />
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

<Tooltip />

{#if shownUnread}
  <WhatsNewDialog entries={news.entries} unread={shownUnread} onclose={closeWhatsNew} />
{/if}

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
    gap: 14px 24px;
  }

  /*
    The banner over the buttons, as wide as their row on one line. A row wrapped on a phone
    cannot be followed by a box that shrinks to fit: the banner and the row take the column.
  */
  .row {
    display: grid;
    gap: 12px;
    width: fit-content;
    max-width: 100%;
  }

  /* Options, About and What's new: one unit in the row, spaced as the row's buttons. */
  .more {
    display: flex;
    gap: 24px;
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

  .btn-primary :global(svg) {
    width: 20px;
    height: 20px;
    stroke-width: 2.2;
  }

  /* Relative: the What's new button places its dot. */
  .secondary {
    position: relative;
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

  /* A square, its icon a size up from the labelled buttons'. */
  .secondary.news {
    width: 56px;
    padding: 0;
    justify-content: center;
  }

  .secondary.news :global(svg) {
    width: 20px;
    height: 20px;
  }

  /* Unread news: a Fray red dot on the button's corner, ringed with the page's ground. */
  .dot {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--table-bg);
  }

  /* The newest unread entry, in a slim strip over the buttons; the text wraps on a phone. */
  .banner {
    /* Sized by the row, never sizing it: its text wraps rather than widening the row. */
    contain: inline-size;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 5px 5px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  .banner p {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    line-height: 1.35;
    color: var(--text-soft);
  }

  .banner .label {
    font-weight: 700;
    color: var(--accent);
  }

  .banner .see {
    flex: none;
    height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }

  .banner .dismiss {
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  .banner .dismiss :global(svg) {
    width: 14px;
    height: 14px;
  }

  /* A size container: the buttons' look follows the room the row has, not the window's width. */
  .start {
    container: start / inline-size;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /*
    Options and About show their icon only, as What's new does, when the labelled row does not fit:
    Start (227px) + 24 + Options (129) + 24 + About (116) + 24 + What's new (56) = 600px, and 16px
    of slack for the font's rendering. With less room still, the three squares wrap under Start
    together (.more); labelled buttons never wrap.
  */
  @container start (max-width: 615px) {
    .secondary {
      width: 56px;
      padding: 0;
      justify-content: center;
    }

    .secondary :global(svg) {
      width: 20px;
      height: 20px;
    }

    /* As .sr-only (styles/tokens.css): out of sight, still the button's name. */
    .secondary .text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
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

  .icon :global(svg) {
    width: 18px;
    height: 18px;
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
