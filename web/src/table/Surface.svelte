<!--
  The table's one surface, where every card and pile lies, in table units:
  the dot grid, a framed box around each owner's deck and discard pile, with
  the chips opening that owner's out-of-play piles, the piles, the cards and
  the first player token. The table scrolls it both ways and zooms it as a
  whole.
-->
<script lang="ts" module>
  import type { TableElement } from './actions';
  import type { OutOfPlayChip, OwnerFrame } from './layout';

  /** The frame around an owner's deck and discard pile, with the name above it. */
  export interface OwnerBox {
    frame: OwnerFrame;
    /** The player's name, or "Villain". */
    name: string;
    /** CSS colour of the frame and the name: the player's seat colour, or the villain's. */
    color: string;
    /** The tooltip: how many cards the player holds. */
    tip?: string;
    /** The owner's out-of-play piles, as chips at the right of the name line. */
    outOfPlay: OutOfPlayChip[];
  }
</script>

<script lang="ts">
  import type { PackFace, CardView as TableCard, PileView as Pile } from '../lib/types';
  import CardView from './CardView.svelte';
  import { backCaption } from './face';
  import FirstPlayerToken from './FirstPlayerToken.svelte';
  import Icons from './Icons.svelte';
  import { overflowTip } from '../lib/overflowTip';
  import { interaction } from './interaction.svelte';
  import PileView from './PileView.svelte';

  let {
    cards,
    piles,
    owners,
    topOf,
    faceOf,
    onbrowse,
    width,
    height,
    firstPlayer,
    tokenMovable = false,
    canDrag = () => false,
  }: {
    /** The cards lying on the table. */
    cards: TableCard[];
    /** The piles drawn on the table. */
    piles: Pile[];
    owners: OwnerBox[];
    /** The top card of a pile that lists its cards. */
    topOf: (pile: Pile) => TableCard | undefined;
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** Opens the Browse box of an out-of-play pile, from its chip. */
    onbrowse: (pile: string) => void;
    /** The surface size, in table units. */
    width: number;
    height: number;
    /** Where the first player token lies. */
    firstPlayer?: { x: number; y: number };
    /** Whether the viewer can drag the token: any player can, spectators cannot. */
    tokenMovable?: boolean;
    /** Whether the viewer can drag that card or pile: the pointer says so (grab). */
    canDrag?: (element: TableElement) => boolean;
  } = $props();

  const TOKEN_TIP = 'First player: drag it to the next player';

  /** What a chip says, in its tooltip and to screen readers: "Victory display (1)". */
  function chipTip(chip: OutOfPlayChip): string {
    const label = `${chip.label} (${chip.count})`;
    return chip.count === 0 ? `${label}: empty` : label;
  }

  /** An empty pile has nothing to browse: its chip is aria-disabled, so that its tooltip shows. */
  function openChip(chip: OutOfPlayChip): void {
    if (chip.count > 0) {
      onbrowse(chip.pile);
    }
  }
</script>

<!-- Card z-indexes come from the server and can be negative: the surface isolates them. -->
<div class="surface table-dots" style:width="{width}px" style:height="{height}px">
  {#each owners as owner (owner.frame.owner)}
    <div
      class="ownerbox"
      data-owner={owner.frame.owner}
      data-tip={owner.tip}
      style:--owner={owner.color}
      style:--chips={owner.outOfPlay.length}
      style:left="{owner.frame.x}px"
      style:top="{owner.frame.y}px"
      style:width="{owner.frame.w}px"
      style:height="{owner.frame.h}px"
    >
      <span class="owner" use:overflowTip>{owner.name}</span>
      {#if owner.tip}
        <!-- The tooltip is for the pointer: screen readers read the hand count here. -->
        <span class="sr-only">: {owner.tip}</span>
      {/if}
    </div>
    {#if owner.outOfPlay.length > 0}
      <!--
        Out of the frame, which lies under the piles and the cards, so that the chips stay above
        anything dropped over the name line; a press on them is no press on an empty spot.
      -->
      <div
        class="chips"
        role="group"
        aria-label="{owner.name}: out-of-play piles"
        data-owner={owner.frame.owner}
        style:--owner={owner.color}
        style:--chips={owner.outOfPlay.length}
        style:--frame-w="{owner.frame.w}px"
        style:left="{owner.frame.x}px"
        style:top="{owner.frame.y}px"
      >
        {#each owner.outOfPlay as chip (chip.pile)}
          <button
            type="button"
            class="chip"
            data-pile={chip.pile}
            data-tip={chipTip(chip)}
            aria-label={chipTip(chip)}
            aria-disabled={chip.count === 0}
            onclick={() => openChip(chip)}
          >
            <Icons name={chip.kind === 'victory' ? 'trophy' : 'hourglass'} />
            <span class="n">{chip.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/each}
  {#each piles as pile (pile.id)}
    {@const top = topOf(pile)}
    <PileView {pile} {top} face={faceOf(top)} draggable={canDrag({ kind: 'pile', id: pile.id })} />
  {/each}
  {#each cards as card (card.id)}
    <CardView
      {card}
      face={faceOf(card)}
      caption={backCaption(card, piles)}
      draggable={canDrag({ kind: 'card', id: card.id })}
    />
  {/each}
  {#if firstPlayer && !interaction.tokenMoving}
    <!-- The token has no menu: hovering it drops the previous element at once. -->
    <FirstPlayerToken
      x={firstPlayer.x}
      y={firstPlayer.y}
      lifted={interaction.tokenLiftedByOthers}
      tip={tokenMovable ? TOKEN_TIP : undefined}
      onpointerenter={(event) => interaction.enterNothing(event)}
      onpointerdown={tokenMovable
        ? (event) => interaction.press({ kind: 'firstPlayer' }, event)
        : undefined}
    />
  {/if}
</div>

<style>
  .surface {
    /*
      The unit of the name lines above the frames (the owners' names and the chips): a table unit,
      or more once the zoom would bring the chips' 12-unit text under 11 screen px. Counter-scaled
      so, a line looks as it does at a zoom of 11/12 (92 %), however far the table zooms out.
    */
    --lu: max(1px, 11px / 12 / var(--z, 1));
    /* A chip is at most this wide with a two-digit count: the name leaves room for the chips. */
    --chip-width: calc(46 * var(--lu));
    --chip-gap: calc(4 * var(--lu));
    --chip-room: calc(var(--chip-width) + var(--chip-gap));
    /*
      The room a name keeps, about "Villain": far out, a frame is too narrow for its chips and its
      name, and the line goes on past the frame's right edge (.chips), over the empty band above the
      row's cards.
    */
    --name-min: calc(56 * var(--lu));
    position: relative;
    isolation: isolate;
    zoom: var(--z, 1);
  }

  /* Under the piles and the cards, which lie over it. */
  .ownerbox {
    position: absolute;
    z-index: -1;
    border: 2px solid color-mix(in srgb, var(--owner) 55%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--owner) 6%, transparent);
  }

  /*
    The owner's name, in the room above the frame, clear of it and of the chips at its right: its
    line, 14 units high, lies from 26 to 12 units above the frame, centred on the chips (in --lu,
    as all of the name line). The offset runs from inside the frame's 2-unit border, hence the 2px.
  */
  .owner {
    position: absolute;
    left: 4px;
    bottom: calc(100% + 2px + 12 * var(--lu));
    max-width: max(calc(100% - 8 * var(--lu) - var(--chips) * var(--chip-room)), var(--name-min));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(13 * var(--lu));
    line-height: calc(14 * var(--lu));
    font-weight: 700;
    color: var(--owner);
  }

  /*
    The name line of a frame: the chips sit at its right end, centred on the name, 19 units above
    the frame, so from 30 to 8 units above it. The 8 units of clear space keep the line apart from
    the frame's border; more would push the villain's line, whose frame lies 20 units under the
    surface's top, past the scroller's 24px padding at the largest zoom (2). Counter-scaled far
    out, the line takes 30 × 11/12 ≈ 27.5 screen px, which the padding and those 20 units still
    hold at 30 %. As wide as the frame, or wider when the chips and --name-min need it. Above
    every card, whose z-index the server raises with each move.
  */
  .chips {
    position: absolute;
    z-index: 100000;
    width: max(
      var(--frame-w),
      calc(var(--chips) * var(--chip-room) + var(--name-min) + 8 * var(--lu))
    );
    height: calc(22 * var(--lu));
    margin-top: calc(-30 * var(--lu));
    display: flex;
    justify-content: flex-end;
    gap: var(--chip-gap);
    /* The room left of the chips stays the name's, an empty spot. */
    pointer-events: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: calc(3 * var(--lu));
    height: 100%;
    min-width: var(--chip-width);
    padding: 0 calc(7 * var(--lu)) 0 calc(5 * var(--lu));
    border: 1px solid color-mix(in srgb, var(--owner) 45%, var(--line-strong));
    border-radius: calc(11 * var(--lu));
    background: var(--panel-2);
    color: var(--muted);
    font-size: calc(12 * var(--lu));
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: auto;
  }

  /*
    A finger needs 44 px, whatever the zoom: on touch, an invisible hit area around each chip, 44
    screen px a side (44px / --z in table units, which the surface's zoom brings back to 44px).
    Under the chips (z-index -1 in their stacking context), so that a chip keeps all of its face
    where the hit area of its neighbour reaches it. It goes below the chip at most over the clear
    space above the frame (8 --lu) and the frame's 10 units of padding (layout.ts), never over the
    piles: the rest goes above, into the empty bottom of the row above.
  */
  @media (pointer: coarse) {
    .chip {
      position: relative;
    }

    .chip::before {
      --hit: calc(44px / var(--z, 1));
      content: '';
      position: absolute;
      z-index: -1;
      left: 50%;
      bottom: calc(-1 * min(8 * var(--lu) + 10px, max(0px, (var(--hit) - 100%) / 2)));
      width: max(100%, var(--hit));
      height: max(100%, var(--hit));
      translate: -50% 0;
    }
  }

  .chip :global(svg) {
    width: calc(14 * var(--lu));
    height: calc(14 * var(--lu));
  }

  .chip .n {
    color: var(--text);
  }

  .chip:hover:not([aria-disabled='true']) {
    background: var(--hover);
    border-color: var(--owner);
    color: var(--text);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
