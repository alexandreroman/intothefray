<!--
  The dock of a small touch screen (dock mode): a bar floating at the bottom of the table, above
  the safe area, with the menu button, the hand button (the current deck's hero, up to four mini
  cards of the hand, its size and the hero's name), Undo, and the history with a badge of the log
  lines added since it was last opened. In landscape it stands as a rail down the left edge, its
  hand button the avatar and the hand size only. During a drag of a card that can go back to a
  hand, the hand button becomes the drop target. The parent places nothing: the dock floats.
-->
<script lang="ts">
  import CardArt from '../components/CardArt.svelte';
  import Icon from '../components/Icon.svelte';
  import { pointerBlur } from '../lib/releaseFocus';
  import CardFace from './CardFace.svelte';
  import { NOTHING_TO_UNDO, UNDO_TIP } from './SidePanel.svelte';

  let {
    handCount,
    minis,
    avatar,
    heroName,
    color,
    canUndo,
    unread,
    dropActive,
    landscape,
    onmenu,
    onhand,
    onundo,
    onhistory,
  }: {
    handCount: number;
    /** The image URLs of the first cards of the hand, as CardFace takes them; four at most show. */
    minis: string[][];
    /** The image URLs of the current deck's hero, or null before a hero is chosen. */
    avatar: string[] | null;
    heroName: string;
    /** The seat colour, a CSS value: the ring around the avatar. */
    color: string;
    canUndo: boolean;
    /** The log lines added since the history was last opened. */
    unread: number;
    /** A dragged card can go back to a hand: the hand button is its drop target. */
    dropActive: boolean;
    /** A small screen in landscape: a rail down the left edge rather than a bar at the bottom. */
    landscape: boolean;
    onmenu: () => void;
    onhand: () => void;
    onundo: () => void;
    onhistory: () => void;
  } = $props();

  const MAX_MINIS = 4;
  const MAX_UNREAD = 9;
  const DROP_LABEL = 'Drop here: back to hand';

  const handTitle = $derived(`Hand · ${handCount}`);
  const handLabel = $derived.by(() => {
    if (dropActive) {
      return DROP_LABEL;
    }
    return heroName ? `${handTitle}, ${heroName}` : handTitle;
  });
  // The art shows the hero's first image, as the hero selector does.
  const avatarSrc = $derived(avatar?.[0]);
  const badge = $derived(unread > MAX_UNREAD ? `${MAX_UNREAD}+` : String(unread));
  const historyLabel = $derived(unread > 0 ? `History, ${badge} new` : 'History');
</script>

<nav class="dock" class:rail={landscape} aria-label="Table controls">
  <button
    class="ib btn-ghost"
    aria-label="Menu"
    data-tip="Menu"
    onclick={onmenu}
    {@attach pointerBlur}
  >
    <!-- Three bars. -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>

  <button
    class="handbtn"
    class:drop={dropActive}
    aria-label={handLabel}
    data-tip={landscape ? handLabel : undefined}
    onclick={onhand}
    {@attach pointerBlur}
  >
    {#if dropActive && !landscape}
      <span class="drop-label">{DROP_LABEL}</span>
    {:else}
      <span class="avatar" class:empty={!avatar} style:--seat={color} aria-hidden="true">
        {#if avatarSrc}
          <CardArt src={avatarSrc} aspect={1} />
        {/if}
      </span>
      {#if landscape}
        <span class="count" aria-hidden="true">{handCount}</span>
      {:else}
        {#if minis.length > 0}
          <span class="minis" aria-hidden="true">
            {#each minis.slice(0, MAX_MINIS) as images, index (index)}
              <span class="mini"><CardFace {images} /></span>
            {/each}
          </span>
        {/if}
        <span class="lbl" aria-hidden="true">
          <b>{handTitle}</b>
          {#if heroName}
            <small>{heroName}</small>
          {/if}
        </span>
      {/if}
    {/if}
  </button>

  {#if landscape}
    <span class="spacer"></span>
  {/if}

  <!-- aria-disabled rather than disabled, so that the tooltip saying why still shows. -->
  <button
    class="ib btn-ghost"
    aria-label={UNDO_TIP}
    data-tip={canUndo ? UNDO_TIP : NOTHING_TO_UNDO}
    aria-disabled={!canUndo}
    onclick={() => {
      if (canUndo) {
        onundo();
      }
    }}
    {@attach pointerBlur}
  >
    <Icon name="undo" />
  </button>

  <button
    class="ib btn-ghost"
    aria-label={historyLabel}
    data-tip="History"
    onclick={onhistory}
    {@attach pointerBlur}
  >
    <!-- A clock face. -->
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
    {#if unread > 0}
      <span class="badge" aria-hidden="true">{badge}</span>
    {/if}
  </button>
</nav>

<style>
  /* A bar floating 8px from the edges of the screen, above its safe area. */
  .dock {
    position: fixed;
    left: calc(8px + env(safe-area-inset-left));
    right: calc(8px + env(safe-area-inset-right));
    bottom: calc(8px + env(safe-area-inset-bottom));
    z-index: 30;
    height: 60px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    border: 1px solid var(--line-strong);
    border-radius: 18px;
    box-shadow: 0 10px 30px #000a;
    font-family: var(--font);
  }

  /* Landscape: a rail 64px wide down the left edge, full height, past the notch's safe area. */
  .dock.rail {
    left: 0;
    right: auto;
    top: 0;
    bottom: 0;
    width: calc(64px + env(safe-area-inset-left));
    height: auto;
    flex-direction: column;
    gap: 6px;
    padding: 8px 0;
    padding-left: env(safe-area-inset-left);
    background: var(--panel);
    border: none;
    border-right: 1px solid var(--line-strong);
    border-radius: 0;
    box-shadow: none;
  }

  .ib {
    flex: none;
    position: relative;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: 12px;
    color: var(--text-soft);
  }

  .ib :global(svg) {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* The unread log lines, top right of the history button. */
  .badge {
    position: absolute;
    top: 4px;
    right: 3px;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font: 800 11px/16px var(--font);
    text-align: center;
  }

  /* The hand button takes the bar's free width. */
  .handbtn {
    flex: 1;
    min-width: 0;
    height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 6px;
    overflow: hidden;
    border: none;
    border-radius: 12px;
    background: var(--panel-2);
    color: var(--text);
    text-align: left;
  }

  .rail .handbtn {
    flex: none;
    position: relative;
    width: 48px;
    justify-content: center;
    padding: 0;
    overflow: visible;
    background: none;
  }

  /* The drop target of a dragged card: a dashed outline in the selection blue. */
  .handbtn.drop {
    justify-content: center;
    background: color-mix(in srgb, var(--sel) 14%, transparent);
    outline: 2px dashed var(--sel);
    outline-offset: -2px;
  }

  .drop-label {
    font-weight: 700;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The hero, ringed with the seat colour; before a hero, a disc of that colour. */
  .avatar {
    flex: none;
    position: relative;
    width: 40px;
    height: 40px;
    overflow: hidden;
    border-radius: 50%;
    background: #000;
    box-shadow: 0 0 0 3px var(--seat);
  }

  .avatar.empty {
    background: var(--seat);
  }

  /* The hand size in the rail, top right of the avatar, as the hero selector shows it. */
  .count {
    position: absolute;
    top: -2px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--text-soft);
    font: 700 11px/16px var(--font);
    text-align: center;
  }

  /* Up to four cards of the hand, overlapping. */
  .minis {
    flex: none;
    display: flex;
    padding-right: 9px;
  }

  .mini {
    width: 22px;
    height: 31px;
    margin-right: -9px;
    border-radius: 3px;
    box-shadow: 1px 1px 3px #000c;
  }

  .lbl {
    min-width: 0;
    line-height: 1.15;
  }

  .lbl b,
  .lbl small {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .lbl b {
    font-size: 14px;
    font-weight: 700;
  }

  .lbl small {
    color: var(--muted);
    font-size: 12px;
  }

  .spacer {
    flex: 1;
  }
</style>
