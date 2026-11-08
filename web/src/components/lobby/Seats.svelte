<!--
  The Players area: one seat per deck, as at the table. A player's card spans as many seats as
  they have decks, as far as a row holds, and free seats fill the rest up to MAX_SEATS. The
  viewer's own decks are their deck slots, which the lobby renders through `ownSlot`, so that
  their load state stays with it.
-->
<script lang="ts">
  import { onDestroy, tick, type Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import { overflowTip } from '../../lib/overflowTip';
  import { playerColorVar } from '../../lib/playerColor';
  import { gamePath, href } from '../../lib/router.svelte';
  import { MAX_SEATS, seatCount, type DeckView, type PlayerView, type View } from '../../lib/types';
  import DeckNames from './DeckNames.svelte';
  import HeroThumb from './HeroThumb.svelte';

  let {
    view,
    onremove,
    onleave,
    ontakeseat,
    onadddeck,
    addLocked = false,
    ownSlot,
  }: {
    view: View;
    onremove: (color: number) => void;
    onleave: () => void;
    ontakeseat: () => void;
    onadddeck: () => void;
    /** Add a deck is blocked, as while a deck load is in flight; the button keeps its place. */
    addLocked?: boolean;
    /** One of the viewer's deck slots, from its deck and its 0-based index. */
    ownSlot: Snippet<[DeckView, number]>;
  } = $props();

  const COPIED_MS = 1500;

  // Built from the game id, so no token or other state leaks into the link.
  const inviteUrl = $derived(`${location.origin}${href(gamePath(view.id))}`);
  const isSpectator = $derived(view.you.role === 'spectator');
  const seatsTaken = $derived(seatCount(view));
  // A newcomer takes the lowest colour no player uses.
  const freeColors = $derived(
    [0, 1, 2, 3]
      .filter((c) => !view.players.some((p) => p.color === c))
      .slice(0, Math.max(0, MAX_SEATS - seatsTaken)),
  );

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  // Shown once the clipboard is refused, for a manual copy.
  let showLink = $state(false);
  let linkInput = $state<HTMLInputElement>();

  onDestroy(() => clearTimeout(copyTimer));

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // No clipboard access (insecure origin, denied): the link shows, selected.
      showLink = true;
      await tick();
      linkInput?.focus();
      linkInput?.select();
      return;
    }
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), COPIED_MS);
  }

  function isMe(player: PlayerView): boolean {
    return view.you.role === 'player' && player.color === view.you.color;
  }
</script>

<section class="card-box players">
  <div class="bhead">
    <div class="title">
      <h2>Players</h2>
      <span class="count">{seatsTaken} of {MAX_SEATS} seats</span>
    </div>
    <button class="btn copy" onclick={copyInvite}>
      {#if copied}
        <Icon name="check" />
        Copied
      {:else}
        <Icon name="copy" />
        Copy invite link
      {/if}
    </button>
  </div>
  <div class="sect">
    {#if showLink}
      <input
        class="link"
        type="text"
        readonly
        aria-label="Invite link"
        value={inviteUrl}
        bind:this={linkInput}
      />
    {/if}
    <div class="seats">
      {#each view.players as player (player.color)}
        {@const mine = isMe(player)}
        {@const status = player.online ? 'Online' : 'Offline'}
        {@const decks = player.decks.length}
        <div
          class="seat"
          class:me={mine}
          class:span2={decks === 2}
          class:span3={decks === 3}
          class:span4={decks === 4}
          style:--pc={playerColorVar(player.color)}
        >
          <div class="top">
            <div class="who">
              <div class="nm">
                <b use:overflowTip>{player.name}</b>
                <!-- On a phone, the roles and the online dot follow the name; wider, the status
                     line below says it all. -->
                {#if mine}<span class="tag">you</span>{/if}
                {#if player.host}<span class="tag">host</span>{/if}
                <span class="dot" class:off={!player.online} data-tip={status}>
                  <span class="sr-only">{status}</span>
                </span>
              </div>
              <span class="status" class:off={!player.online}>
                <i></i>{status}
                {#if mine}<span class="role">· you</span>{/if}
                {#if player.host}<span class="role">· host</span>{/if}
              </span>
            </div>
            {@render tools(player, mine)}
          </div>
          <div class="decks">
            {#each player.decks as deck, slot (slot)}
              {#if mine}
                {@render ownSlot(deck, slot)}
              {:else}
                <div class="deck">
                  <HeroThumb image={deck.heroImage} name={deck.heroName} />
                  {#if deck.ready}
                    <DeckNames heroName={deck.heroName ?? '?'} deckName={deck.deckName ?? ''} />
                  {:else}
                    <div class="wait">Waiting for a deck</div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
      {#each freeColors as color (color)}
        {#if isSpectator}
          <button class="free" style:--pc={playerColorVar(color)} onclick={ontakeseat}>
            <i></i><b>Take this seat</b>
          </button>
        {:else}
          <div class="free" style:--pc={playerColorVar(color)}>
            <i></i>
            <span><b>Free seat</b><br />share the invite link</span>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</section>

{#snippet tools(player: PlayerView, mine: boolean)}
  {@const canAdd = mine && seatsTaken < MAX_SEATS}
  {@const canRemove = view.you.host && !mine}
  {@const canLeave = !view.you.host && mine}
  {#if canAdd || canRemove || canLeave}
    <div class="tools">
      {#if canAdd}
        <button
          class="btn-ghost tool add"
          data-tip="Add a deck"
          aria-label="Add a deck"
          aria-disabled={addLocked}
          onclick={onadddeck}
        >
          <Icon name="plus" />
        </button>
      {/if}
      {#if canRemove}
        {@const tip = `Take ${player.name} off this seat`}
        <button
          class="btn-ghost tool"
          data-tip={tip}
          aria-label={tip}
          onclick={() => onremove(player.color)}
        >
          <Icon name="user-minus" />
        </button>
      {/if}
      {#if canLeave}
        <button
          class="btn-ghost tool"
          data-tip="Leave your seat"
          aria-label="Leave your seat"
          onclick={onleave}
        >
          <Icon name="leave" />
        </button>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  /*
    The widths follow the lobby's bands: a phone below 600px, then a tablet up to 1099px, then
    wider. The seats' gap and a card's padding are variables, as a card over several seats spaces
    its decks with them.
  */
  .players {
    --seat-gap: 10px;
    --seat-pad: 14px;
  }

  @media (min-width: 600px) {
    .players {
      --seat-gap: 12px;
    }
  }

  .title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .count {
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }

  .bhead .copy {
    flex: none;
    height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }

  .copy :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }

  .link {
    margin-bottom: 12px;
    color: var(--text-soft);
  }

  /* Dense, so that a card over two seats never leaves a hole behind a single one. */
  .seats {
    display: grid;
    gap: var(--seat-gap);
    grid-template-columns: minmax(0, 1fr);
    grid-auto-flow: row dense;
  }

  @media (min-width: 600px) {
    .seats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .span2,
    .span3,
    .span4 {
      grid-column: span 2;
    }
  }

  @media (min-width: 1100px) {
    .seats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .span3 {
      grid-column: span 3;
    }

    .span4 {
      grid-column: span 4;
    }
  }

  /* On a phone, the player's colour runs down the card's left edge; wider, along its top. */
  .seat {
    position: relative;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px 12px 17px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
  }

  .seat::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: var(--pc);
  }

  @media (min-width: 600px) {
    .seat {
      padding: var(--seat-pad);
    }

    .seat::before {
      right: 0;
      bottom: auto;
      width: auto;
      height: 4px;
    }
  }

  .seat.me {
    background: color-mix(in srgb, var(--pc) 8%, var(--panel));
    border-color: color-mix(in srgb, var(--pc) 35%, var(--line));
  }

  .top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .who {
    flex: 1;
    min-width: 0;
  }

  .nm {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .nm b {
    min-width: 0;
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag {
    flex: none;
    padding: 1px 7px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 700;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok);
  }

  .dot.off,
  .status.off i {
    background: none;
    border: 1.5px solid var(--faint);
    box-shadow: none;
  }

  .status {
    display: none;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    color: var(--ok);
    font-size: 12px;
  }

  .status i {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 15%, transparent);
  }

  .status.off {
    color: var(--faint);
  }

  .role {
    color: var(--muted);
  }

  @media (min-width: 600px) {
    .tag,
    .dot {
      display: none;
    }

    .status {
      display: inline-flex;
    }
  }

  /* The icon buttons reach into the card's padding, so their glyphs line up with its edge. */
  .tools {
    flex: none;
    display: flex;
    gap: 2px;
    margin: -4px -4px 0 0;
  }

  .tool {
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    color: var(--muted);
    display: grid;
    place-items: center;
  }

  .tool :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 2;
  }

  .tool.add {
    color: var(--sel);
    border-color: var(--line-strong);
  }

  @media (hover: hover) {
    .tool.add:hover:not(:disabled, [aria-disabled='true']) {
      border-color: var(--sel);
      color: var(--sel);
    }
  }

  /*
    The decks of a card, side by side when it spans several seats. Each deck starts where the next
    seat's content would: their gap is the seats' gap plus both cards' padding and border.
  */
  .decks {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  @media (min-width: 600px) {
    .span2 .decks,
    .span3 .decks,
    .span4 .decks {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: calc(var(--seat-gap) + 2 * (var(--seat-pad) + 1px));
    }
  }

  @media (min-width: 1100px) {
    .span3 .decks {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .span4 .decks {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .deck {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .wait {
    flex: 1;
    min-width: 0;
    color: var(--warn);
    font-size: 12px;
    font-weight: 600;
  }

  /* A free seat: a dashed card with the colour the next newcomer gets. */
  .free {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 12px;
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 400;
    text-align: left;
    white-space: normal;
  }

  @media (min-width: 600px) {
    .free {
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      min-height: 100px;
      text-align: center;
    }
  }

  .free i {
    flex: none;
    width: 10px;
    height: 10px;
    transform: rotate(45deg);
    background: var(--pc);
  }

  .free b {
    color: var(--text-soft);
    font-weight: 600;
  }

  /* A spectator's free seat is a button: it takes the seat. */
  @media (hover: hover) {
    button.free:hover:not(:disabled) {
      background: none;
      border-color: var(--pc);
    }
  }
</style>
