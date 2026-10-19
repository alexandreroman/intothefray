<!--
  The table's one surface, where every card and pile lies, in table units:
  the dot grid, a framed box around each owner's deck and discard pile, the
  piles, the cards and the first player token. The table scrolls it both
  ways and zooms it as a whole.
-->
<script lang="ts" module>
  import type { TableElement } from './actions';
  import type { OwnerFrame } from './layout';

  /** The frame around an owner's deck and discard pile, with the name above it. */
  export interface OwnerBox {
    frame: OwnerFrame;
    /** The player's name, or "Villain". */
    name: string;
    /** CSS colour of the frame and the name: the player's seat colour, or the villain's. */
    color: string;
    /** The tooltip: how many cards the player holds. */
    tip?: string;
  }
</script>

<script lang="ts">
  import type { PackFace, CardView as TableCard, PileView as Pile } from '../lib/types';
  import CardView from './CardView.svelte';
  import FirstPlayerToken from './FirstPlayerToken.svelte';
  import { overflowTip } from '../lib/overflowTip';
  import { interaction } from './interaction.svelte';
  import PileView from './PileView.svelte';

  let {
    cards,
    piles,
    owners,
    topOf,
    faceOf,
    barWhenEmpty,
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
    /** Whether a pile still has a bar when it is empty. */
    barWhenEmpty: (pile: Pile) => boolean;
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
</script>

<!-- Card z-indexes come from the server and can be negative: the surface isolates them. -->
<div class="surface" style:width="{width}px" style:height="{height}px">
  {#each owners as owner (owner.frame.owner)}
    <div
      class="ownerbox"
      data-owner={owner.frame.owner}
      data-tip={owner.tip}
      style:--owner={owner.color}
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
  {/each}
  {#each piles as pile (pile.id)}
    {@const top = topOf(pile)}
    <PileView
      {pile}
      {top}
      face={faceOf(top)}
      barWhenEmpty={barWhenEmpty(pile)}
      draggable={canDrag({ kind: 'pile', id: pile.id })}
    />
  {/each}
  {#each cards as card (card.id)}
    <CardView {card} face={faceOf(card)} draggable={canDrag({ kind: 'card', id: card.id })} />
  {/each}
  {#if firstPlayer && !interaction.tokenMoving}
    <!-- The token has no bar: hovering it drops the previous element at once. -->
    <FirstPlayerToken
      x={firstPlayer.x}
      y={firstPlayer.y}
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

  /* The owner's name, in the room above the frame, clear of it. */
  .owner {
    position: absolute;
    left: 4px;
    bottom: calc(100% + 6px);
    max-width: calc(100% - 8px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    line-height: 14px;
    font-weight: 700;
    color: var(--owner);
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
