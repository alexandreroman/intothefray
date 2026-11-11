<!--
  The Players area: one seat per deck, as at the table, two to a row at most. A player's card spans
  as many seats as they have decks, as far as a row holds, and free seats make up the rest of
  MAX_SEATS. The viewer's own decks are their deck slots, which the lobby renders through
  `ownSlot`, so that their load state stays with it.
-->
<script lang="ts">
  import { onDestroy, tick, type Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Icon from '../Icon.svelte';
  import { glide, pop, unfold } from '../../lib/motion';
  import { overflowTip } from '../../lib/overflowTip';
  import { playerColorVar } from '../../lib/playerColor';
  import { gamePath, href } from '../../lib/router.svelte';
  import { layOutSeats } from '../../lib/seatLayout';
  import { nextSlotKeys, type SlotKeys, type SlotRemoval } from '../../lib/slotKeys';
  import { MAX_SEATS, seatCount, type DeckView, type PlayerView, type View } from '../../lib/types';
  import DeckNames from './DeckNames.svelte';
  import HeroThumb from './HeroThumb.svelte';

  type PlayerSeat = {
    kind: 'player';
    key: string;
    player: PlayerView;
    slots: { key: number; deck: DeckView }[];
    /** The seats the card spans: one per deck. */
    span: number;
    mine: boolean;
  };
  type FreeSeat = { kind: 'free'; key: string; color: number };
  type Seat = PlayerSeat | FreeSeat;

  let {
    view,
    onremove,
    onleave,
    ontakeseat,
    onadddeck,
    addLocked = false,
    ownRemoval = null,
    ownSlot,
  }: {
    view: View;
    onremove: (color: number) => void;
    onleave: () => void;
    ontakeseat: () => void;
    onadddeck: () => void;
    /** Add a deck is blocked, as while a deck load is in flight; the button keeps its place. */
    addLocked?: boolean;
    /** The removal of one of the viewer's slots they asked for, until another change of theirs. */
    ownRemoval?: SlotRemoval | null;
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

  // Each player's slots as last shown, by colour. A plain variable, not state: it only carries the
  // slot keys from one view to the next, and `playerSeats` alone writes it.
  let lastSlotKeys = new Map<number, SlotKeys>();

  // The grid's columns, as the styles below lay it out: one on a phone, two from 600px.
  const twoColumns = new MediaQuery('(min-width: 600px)');
  const columns = $derived(twoColumns.current ? 2 : 1);

  /*
    A player's seat goes by their colour, a free seat by the colour it offers.

    A deck slot goes by a key of its own (lib/slotKeys), not by its index: once a slot is removed,
    the slots after it keep their nodes (the viewer's keep the links typed in them) and only the
    removed one closes; an added slot is the only one to open. The viewer's own removal names the
    slot that went, so that a link typed for it never stays in the slot that takes its place.
  */
  const playerSeats = $derived.by((): PlayerSeat[] => {
    const keyed = view.players.map((player) => {
      const removal = isMe(player) ? ownRemoval : null;
      return {
        player,
        slotKeys: nextSlotKeys(lastSlotKeys.get(player.color), player.decks, removal),
      };
    });
    lastSlotKeys = new Map(keyed.map(({ player, slotKeys }) => [player.color, slotKeys]));
    return keyed.map(({ player, slotKeys }) => {
      const slots = player.decks.map((deck, i) => ({ key: slotKeys.keys[i]!, deck }));
      return {
        kind: 'player',
        key: `player-${player.color}`,
        player,
        slots,
        span: slots.length,
        mine: isMe(player),
      };
    });
  });
  const freeSeats = $derived(
    freeColors.map((color): FreeSeat => ({ kind: 'free', key: `free-${color}`, color })),
  );

  /*
    The seats in grid order, in one keyed list: the grid is measured once before a change, so every
    seat glides from where it was. The order is laid out here rather than by the grid's dense
    packing, which could move the viewer's card: theirs first and fixed, then the others in seat
    order, then the free seats. A card over several seats that leaves a hole at the end of a row
    has it filled by free seats, else by a later card that fits (lib/seatLayout).
  */
  const seats = $derived<Seat[]>(layOutSeats(playerSeats, freeSeats, columns));

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
    <!-- A seat arrives and leaves with a pop, and the others glide to their new places. Svelte
         plays a local transition only when its own list changes: nothing moves as the lobby
         first shows, nor inside a card that arrives or leaves. -->
    <div class="seats">
      {#each seats as seat (seat.key)}
        <div
          class="cell"
          class:wide={seat.kind === 'player' && seat.span > 1}
          in:pop
          out:pop
          animate:glide
        >
          {#if seat.kind === 'player'}
            {@render playerCard(seat.player, seat.slots, seat.mine)}
          {:else}
            {@render freeSeat(seat.color)}
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

{#snippet playerCard(player: PlayerView, slots: { key: number; deck: DeckView }[], mine: boolean)}
  {@const status = player.online ? 'online' : 'offline'}
  <div class="seat" class:me={mine} style:--pc={playerColorVar(player.color)}>
    <div class="top">
      <!-- One line: the name, then the capsules. On a narrow phone the online capsule keeps only
           its dot; its text stays for screen readers and in its tooltip. -->
      <div class="nm">
        <b use:overflowTip>{player.name}</b>
        {#if mine}<span class="tag">you</span>{/if}
        {#if player.host}<span class="tag">host</span>{/if}
        <span class="tag status" class:off={!player.online} data-tip={status}>
          <i></i><span class="label">{status}</span>
        </span>
      </div>
      {@render tools(player, mine)}
    </div>
    <!-- A slot opens or closes alone; the slots after a removed one glide back. The glide also
         takes a closing slot out of the flow, so the card's narrower grid never wraps it. -->
    <div class="decks">
      {#each slots as { key, deck }, slot (key)}
        <div class="deck-cell" transition:unfold animate:glide>
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
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet freeSeat(color: number)}
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
{/snippet}

{#snippet tools(player: PlayerView, mine: boolean)}
  {@const canAdd = mine && seatsTaken < MAX_SEATS}
  {@const canRemove = view.you.host && !mine}
  {@const canLeave = !view.you.host && mine}
  {#if canAdd || canRemove || canLeave}
    <div class="tools">
      {#if canAdd}
        <button
          class="btn-ghost btn-icon accent"
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
          class="btn-ghost btn-icon"
          data-tip={tip}
          aria-label={tip}
          onclick={() => onremove(player.color)}
        >
          <Icon name="user-minus" />
        </button>
      {/if}
      {#if canLeave}
        <button
          class="btn-ghost btn-icon"
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
    The widths follow the lobby's bands: a phone below 600px, then wider; the seats need no band
    from 1100px. The seats' gap and a card's padding, on its sides (--seat-pad) and at its top and
    bottom (--seat-pad-y), are variables, as a card over several seats spaces its decks with them.
    On a phone, the left padding clears the colour band by --seat-pad.
  */
  .players {
    --seat-gap: 10px;
    --seat-pad: 16px;
    --seat-pad-y: 14px;
    --seat-band: 5px;
  }

  @media (min-width: 600px) {
    .players {
      --seat-gap: 12px;
      --seat-pad: 18px;
      --seat-pad-y: 18px;
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

  /* As tall as the settings controls, so the header is no taller than the others. The extra classes
     outrank the lobby's shared button rule (.lobby :global(.btn)), which is 44px tall. */
  .players .bhead .copy {
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

  /*
    The grid places the seats in the order they come, without packing them densely: the script
    orders them so that the viewer's card stays first and free seats, then later cards, fill the
    holes (lib/seatLayout). It holds two seats to a row at most: one column on a phone, two from
    600px, where a card over several decks takes the whole row.
  */
  .seats {
    display: grid;
    gap: var(--seat-gap);
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 600px) {
    .seats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .wide {
      grid-column: span 2;
    }
  }

  /* A cell of the grid holds one seat, which fills it. */
  .cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
  }

  /* On a phone, the player's colour runs down the card's left edge; wider, along its top. */
  .seat {
    position: relative;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: var(--seat-pad-y) var(--seat-pad);
    padding-left: calc(var(--seat-band) + var(--seat-pad));
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
    width: var(--seat-band);
    background: var(--pc);
  }

  /* Wider, the band runs along the top, inside the padding: every side is padded alike. */
  @media (min-width: 600px) {
    .seat {
      padding-left: var(--seat-pad);
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
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* The name gives way first: the capsules after it never wrap nor shrink. */
  .nm {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    container: seat-line / inline-size;
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
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 7px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--panel-2);
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .status {
    gap: 5px;
    border-color: color-mix(in srgb, var(--ok) 35%, var(--line-strong));
    color: var(--ok);
  }

  .status i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }

  .status.off {
    border-color: var(--line-strong);
    color: var(--muted);
  }

  .status.off i {
    background: none;
    border: 1.5px solid var(--faint);
  }

  /*
    On a phone, a name line too narrow for every capsule keeps the online one to its dot. The
    line's own width decides, not the window's, so a wide phone keeps the whole capsule.
  */
  @media (max-width: 599px) {
    @container seat-line (width < 260px) {
      .status {
        justify-content: center;
        width: 20px;
        padding: 0;
      }

      /* As .sr-only (styles/tokens.css): out of sight, still read by screen readers. */
      .status .label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  }

  /*
    The icon buttons' boxes end on the card's content edge, as a deck slot's Load does
    (DeckLoader). Above and below the name line, they reach into the card's padding, so the card is
    no taller than that line.
  */
  .tools {
    flex: none;
    display: flex;
    gap: 2px;
    margin: -6px 0;
  }

  /*
    The decks of a card, two to a row when it spans the row, 16px apart when stacked: three or four
    decks wrap. Side by side, the second deck starts where the next seat's content would: their gap
    is the seats' gap plus both cards' padding and border.
  */
  .decks {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  @media (min-width: 600px) {
    .wide .decks {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: calc(var(--seat-gap) + 2 * (var(--seat-pad) + 1px));
    }
  }

  .deck-cell {
    min-width: 0;
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

  /* A free seat: a dashed card with the colour the next newcomer gets, padded as a seat; on a phone,
     its content starts where a player card's does, past the colour band. */
  .free {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: var(--seat-pad-y) var(--seat-pad);
    padding-left: calc(var(--seat-band) + var(--seat-pad));
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
      padding-left: var(--seat-pad);
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

  /* A spectator's free seat is a button: it takes the seat. Pressed, as under the pointer, its
     dashed edge takes the seat's colour, on no surface. */
  button.free:active:not(:disabled) {
    background: none;
    border-color: var(--pc);
  }

  @media (hover: hover) {
    button.free:hover:not(:disabled) {
      background: none;
      border-color: var(--pc);
    }
  }
</style>
