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
<div class="surface" style:width="{width}px" style:height="{height}px">
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
        style:left="{owner.frame.x}px"
        style:top="{owner.frame.y}px"
        style:width="{owner.frame.w}px"
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
    /* A chip is at most this wide with a two-digit count: the name leaves room for the chips. */
    --chip-width: 46px;
    --chip-gap: 4px;
    --chip-room: calc(var(--chip-width) + var(--chip-gap));
    position: relative;
    isolation: isolate;
    zoom: var(--z, 1);
    background-image: radial-gradient(circle, var(--dot) 1px, transparent 1.2px);
    background-size: 10px 10px;
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
    line, 14 units high, lies from 26 to 12 units above the frame, centred on the chips. The offset
    runs from inside the frame's 2-unit border, hence 14 and not 12.
  */
  .owner {
    position: absolute;
    left: 4px;
    bottom: calc(100% + 14px);
    max-width: calc(100% - 8px - var(--chips) * var(--chip-room));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 14px;
    font-weight: 700;
    color: var(--owner);
  }

  /*
    The name line of a frame: the chips sit at its right end, centred on the name, 19 units above
    the frame, so from 30 to 8 units above it. The 8 units of clear space keep the line apart from
    the frame's border; more would push the villain's line, whose frame lies 20 units under the
    surface's top, past the scroller's 24px padding at the largest zoom (2). Above every card,
    whose z-index the server raises with each move.
  */
  .chips {
    position: absolute;
    z-index: 100000;
    height: 22px;
    margin-top: -30px;
    display: flex;
    justify-content: flex-end;
    gap: var(--chip-gap);
    /* As wide as the frame: the room left of the chips stays the name's, an empty spot. */
    pointer-events: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    min-width: var(--chip-width);
    padding: 0 7px 0 5px;
    border: 1px solid color-mix(in srgb, var(--owner) 45%, var(--line-strong));
    border-radius: 11px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 12px;
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    pointer-events: auto;
  }

  .chip :global(svg) {
    width: 14px;
    height: 14px;
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
