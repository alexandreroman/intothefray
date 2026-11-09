<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, slide, type TransitionConfig } from 'svelte/transition';
  import { createGame } from '../lib/api';
  import { motionMs } from '../lib/motion';
  import { playerName } from '../lib/names';
  import { NewsState } from '../lib/newsState.svelte';
  import { isIPad, isStandalone } from '../lib/platform';
  import { getPref, setPref, setToken } from '../lib/prefs';
  import { gamePath, go } from '../lib/router.svelte';
  import { fetchGamesInProgress } from '../lib/stats';
  import Icon from '../components/Icon.svelte';
  import HomeScreenDialog from '../components/HomeScreenDialog.svelte';
  import Logo from '../components/Logo.svelte';
  import WhatsNewDialog from '../components/WhatsNewDialog.svelte';
  import { lastPressByPointer } from '../components/modal.svelte';

  /** How long a banner takes to come or leave, unfolding as it fades in or folding up as it fades out. */
  const BANNER_FOLD_MS = 220;
  /** Set once the Home Screen banner is dismissed: it never shows again in this browser. */
  const HOME_SCREEN_BANNER_KEY = 'itf-home-screen-banner';
  /** How long the count of games in progress takes to fade in once it arrives. */
  const GAMES_FADE_MS = 400;

  let starting = $state(false);
  let error = $state('');

  // The count of games in progress, unknown while it loads or when it cannot be read.
  let gamesInProgress = $state<number>();
  // An empty table is not worth a word: the count shows from one game up.
  const showsGamesInProgress = $derived(gamesInProgress !== undefined && gamesInProgress > 0);
  const gamesInProgressText = $derived(
    gamesInProgress === 1 ? '1 game in progress' : `${gamesInProgress} games in progress`,
  );

  onMount(() => {
    // A count that cannot be read is simply not shown: it is a nicety, not something to report.
    fetchGamesInProgress().then(
      (games) => (gamesInProgress = games),
      () => {},
    );
  });

  const news = new NewsState();
  const hasUnread = $derived(news.unread.length > 0);
  // The ids of the entries unread when the dialog opened, tagged as new in it; none while it is closed.
  let shownUnread = $state<ReadonlySet<string> | null>(null);

  let newsButton = $state<HTMLButtonElement>();
  // Where the dialog was opened from, and whether by the pointer (see Dialog).
  let openedFromBanner = false;
  let openedByPointer = false;

  /** Opens the news, which are all seen from then on: the dot and the banner go. */
  function openWhatsNew(fromBanner: boolean): void {
    openedFromBanner = fromBanner;
    openedByPointer = lastPressByPointer();
    shownUnread = new Set(news.unread.map((entry) => entry.id));
    news.markSeen();
  }

  async function closeWhatsNew(): Promise<void> {
    shownUnread = null;
    await tick();
    // Opened from the banner, the dialog took the banner away with the button that opened it (gone,
    // or still leaving if the dialog closes at once): the What's new button takes the focus instead,
    // as the dialog would have given it.
    if (openedFromBanner) {
      focusNewsButton(openedByPointer);
    }
    openedFromBanner = false;
  }

  /** Dismisses the banner. Its × leaves with it: the What's new button takes the focus instead. */
  function dismissBanner(): void {
    news.dismissBanner();
    focusNewsButton(lastPressByPointer());
  }

  // An iPad cannot keep fullscreen (see TopBar): in a browser tab, a banner tells how to add the app
  // to the Home Screen, where it opens full screen. One banner at a time: it waits until the news
  // banner is gone, its leave played out. The device and the way the page was opened are read once:
  // neither changes during a visit.
  const offersHomeScreen = isIPad() && !isStandalone();
  let homeScreenBannerDismissed = $state(getPref(HOME_SCREEN_BANNER_KEY) !== null);
  let newsBannerGone = $state(news.bannerEntry === undefined);
  const showsHomeScreenBanner = $derived(
    offersHomeScreen && !homeScreenBannerDismissed && newsBannerGone,
  );
  // Opening the explanation leaves the banner in place: the player may come back to it.
  let explainingHomeScreen = $state(false);

  /** Dismisses the Home Screen banner for good, handing the focus on as the news banner does. */
  function dismissHomeScreenBanner(): void {
    homeScreenBannerDismissed = true;
    setPref(HOME_SCREEN_BANNER_KEY, 'dismissed');
    focusNewsButton(lastPressByPointer());
  }

  /** Focuses the What's new button, without a focus ring after a press of the pointer (see Dialog). */
  function focusNewsButton(byPointer: boolean): void {
    if (byPointer) {
      newsButton?.focus({ focusVisible: false });
    } else {
      newsButton?.focus();
    }
  }

  /** A banner comes by unfolding as it fades in, and leaves the other way; at once under reduced motion. */
  function bannerFold(node: Element): TransitionConfig {
    const folding = slide(node, {
      duration: motionMs(BANNER_FOLD_MS),
      easing: cubicOut,
    });
    // The opacity follows the slide's styles, overriding the slide's own, which only fades at the
    // very end. Exactly one semicolon between them: Svelte stops reading at an empty declaration.
    return {
      ...folding,
      css: (t, u) => {
        const slideStyles = (folding.css?.(t, u) ?? '').replace(/;\s*$/, '');
        return `${slideStyles}; opacity: ${t}`;
      },
    };
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

<div class="home screen-page">
  <div class="halo"></div>

  <main class="screen-column">
    <!-- Out of the flow, in the page's top padding: the page stays put when the count arrives. -->
    {#if showsGamesInProgress}
      <p class="games" in:fade={{ duration: motionMs(GAMES_FADE_MS) }}>
        <span class="live" aria-hidden="true"></span>{gamesInProgressText}
      </p>
    {/if}

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
            <aside
              class="banner"
              aria-label="Latest news"
              out:bannerFold
              onoutroend={() => (newsBannerGone = true)}
            >
              <!-- The news itself opens the dialog: a button that reads as the banner's text. -->
              <button class="open" onclick={() => openWhatsNew(true)}>
                <span class="label">New:</span> <span class="title">{news.bannerEntry.title}</span>
              </button>
              <button class="btn-ghost dismiss" aria-label="Dismiss" onclick={dismissBanner}
                ><Icon name="cross" /></button
              >
            </aside>
          {/if}
          {#if showsHomeScreenBanner}
            <aside class="banner" aria-label="Home Screen tip" transition:bannerFold>
              <button class="open" onclick={() => (explainingHomeScreen = true)}>
                <span class="label">Play full screen:</span>
                <span class="title">add Into the Fray to your Home Screen.</span>
              </button>
              <button
                class="btn-ghost dismiss"
                aria-label="Dismiss"
                onclick={dismissHomeScreenBanner}><Icon name="cross" /></button
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
                onclick={() => openWhatsNew(false)}
              >
                <Icon name="megaphone" />
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

  <footer class="screen-column">
    Fan-made and unofficial. Not affiliated with Marvel or Fantasy Flight Games.
  </footer>
</div>

{#if shownUnread}
  <WhatsNewDialog entries={news.entries} unread={shownUnread} onclose={closeWhatsNew} />
{/if}

{#if explainingHomeScreen}
  <HomeScreenDialog onclose={() => (explainingHomeScreen = false)} />
{/if}

<style>
  .home {
    /* The column of main and the footer: its width and side gutter. */
    --content-max: 1240px;
    --content-gutter: 24px;
    position: relative;
    /* The fanned cards reach past a narrow screen: they are cut, never scrolled to. */
    overflow: hidden;
    /* Measured by the column layout's query (at the end): the page's width, without a scrollbar. */
    container: home / inline-size;
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
    padding-block: 72px 40px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 48px 64px;
    animation: rise 0.25s ease-out;
  }

  /*
    The count of games in progress: a capsule centred on the page, in the middle of main's top
    padding, so that it covers nothing and pushes nothing down. 28px high: 13px text on an 18px
    line, 4px of padding and a 1px border; 22px from the top, it ends 22px over the logo (at 72px).
    In the column layout (see the queries at the end), 24px from the top and 40px clear of the logo
    (at 92px).
  */
  .games {
    position: absolute;
    top: 22px;
    left: 50%;
    translate: -50%;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 10px;
    font-size: 13px;
    line-height: 18px;
    white-space: nowrap;
    color: var(--muted);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
  }

  /* Live: a Fray red dot, with a soft ring rising from it and fading out. */
  .live {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: live 2s ease-out infinite;
  }

  @keyframes live {
    from {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent);
    }

    to {
      box-shadow: 0 0 0 5px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live {
      animation: none;
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
    gap: 14px 24px;
  }

  /*
    The banner over the buttons, as wide as their row on one line. A wrapped row (narrower than a
    320px phone) cannot be followed by a box that shrinks to fit: the banner takes the column.
  */
  .row {
    display: grid;
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

  /* The home screen's call to action is a size up from the shared one: 56px high (above), slanted
     by 14px, so it leans as the shared one does (14 / 56 = 0.25). */
  .actions .btn-primary {
    --slant: 14px;
    gap: 12px;
    padding: 0 34px;
    font-size: 17px;
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

  /*
    A slim strip over the buttons, the newest unread entry or, on an iPad, the Home Screen tip; the
    text wraps on a phone.
  */
  .banner {
    /* Sized by the row, never sizing it: its text wraps rather than widening the row. */
    contain: inline-size;
    /* A margin rather than the row's gap: it folds up with the banner as it leaves. */
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 5px 5px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }

  /* Plain text, wrapping as text does; the title is underlined under the pointer, pressed or focused. */
  .banner .open {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
    text-align: left;
    white-space: normal;
    color: var(--text-soft);
  }

  .banner .open:focus-visible .title,
  .banner .open:active .title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* Pressed, as under the pointer: a tap's feedback. */
  .banner .open:active {
    color: var(--text);
  }

  @media (hover: hover) {
    .banner .open:hover {
      background: none;
      color: var(--text);
    }

    .banner .open:hover .title {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .banner .label {
    font-weight: 700;
    color: var(--accent);
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
    of slack for the font's rendering. With less room still, the steps below shrink the row;
    labelled buttons never wrap.
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

  /*
    Narrower still, Start and the three squares keep one row: Start shrinks and the gaps tighten,
    step by step. Each step starts where the row of the step before, measured, no longer fits with
    16px of slack (8px for the last one, whose row is the one a 320px phone must hold). Under the
    last step, the squares wrap under Start (.actions wraps), as a safety net only.

    Compact: the icon row at full size needs Start (227px) + 24 + 3 squares (56) + 2 × 24 = 467px.
  */
  @container start (max-width: 482px) {
    .actions {
      column-gap: 12px;
    }

    .more {
      gap: 12px;
    }

    .actions .btn-primary {
      gap: 10px;
      padding: 0 24px;
      font-size: 15px;
    }
  }

  /* Tight: the compact row needs Start (190px) + 12 + 3 squares (56) + 2 × 12 = 394px. */
  @container start (max-width: 409px) {
    .actions {
      column-gap: 8px;
    }

    .more {
      gap: 8px;
    }

    .actions button {
      height: 48px;
    }

    .more .secondary {
      width: 48px;
    }

    /* Start without its arrow: the label says it all. */
    .actions .btn-primary {
      padding: 0 18px;
      font-size: 14px;
      clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%);
    }

    .actions .btn-primary :global(svg) {
      display: none;
    }
  }

  /* Tiny: the tight row needs Start (140px) + 8 + 3 squares (48) + 2 × 8 = 308px. */
  @container start (max-width: 315px) {
    .actions button {
      height: 44px;
    }

    .more .secondary {
      width: 44px;
    }

    .actions .btn-primary {
      padding: 0 14px;
      font-size: 13px;
      clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
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
    /* The last line of the page stays clear of the home indicator. */
    padding-block: 20px max(28px, env(safe-area-inset-bottom));
    font-size: 12px;
    color: var(--faint);
  }

  /*
    The column layout: the fan wraps under the intro once main's content box is narrower than their
    flex bases and the column gap, 520 + 64 + 400 = 984px, that is a page under 984 + 2 × 24px of
    side padding = 1032px. Change this breakpoint along with them. A container query rather than a
    media query: .home's width leaves out a classic scrollbar, as the wrap does, where the viewport's
    includes it. The capsule of games in progress sits 24px from the page's top, 40px clear of the logo
    (at 92px).
  */
  @container home (max-width: 1031px) {
    main {
      padding-top: 92px;
    }

    .games {
      top: 24px;
    }
  }

  /* A phone: 16px gutters, and a smaller fan under the buttons. The top padding stays that of the
     column layout above. */
  @media (max-width: 640px) {
    .home {
      --content-gutter: 16px;
    }

    main {
      padding-bottom: 24px;
    }

    footer {
      padding-block: 16px max(24px, env(safe-area-inset-bottom));
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
