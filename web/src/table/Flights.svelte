<!--
  The copies of cards flying to and out of piles, above everything, the
  pointer passing through them: a card flying from where it was to the pile
  it went to (spec 5.5: discards animate to the owner's pile), a card drawn
  flying from its pile to its slot in the viewer's hand, and a card drawn into
  a hand the viewer does not see leaving its pile.
-->
<script lang="ts">
  import type { PackFace, CardView as TableCard } from '../lib/types';
  import CardBack from './CardBack.svelte';
  import CardFace from './CardFace.svelte';
  import { isHidden } from './face';
  import { cardBox } from './layout';
  import { motion } from './motion.svelte';

  let {
    faceOf,
  }: {
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
  } = $props();
</script>

<!-- A card in a portrait slot, as a pile and the hand draw it: a landscape card is turned a quarter. -->
{#snippet portrait(card: TableCard)}
  {@const face = faceOf(card)}
  <CardFace
    images={face?.images ?? []}
    name={face?.name ?? ''}
    rotated={cardBox(face?.size ?? 'std', { onPile: true }).rotated}
  />
{/snippet}

{#each motion.flights as flight (flight.key)}
  <div
    class="fly"
    aria-hidden="true"
    style:left="{flight.from.cx - flight.from.w / 2}px"
    style:top="{flight.from.cy - flight.from.h / 2}px"
    style:width="{flight.from.w}px"
    style:height="{flight.from.h}px"
    {@attach (element) => motion.launch(element, flight)}
  >
    {#if flight.kind === 'toPile'}
      {@const face = faceOf(flight.card)}
      {#if isHidden(flight.card)}
        <CardBack back={flight.card.back} />
      {:else}
        <CardFace
          images={face?.images ?? []}
          name={face?.name ?? ''}
          landscape={face?.size === 'land' || face?.size === 'dland'}
        />
      {/if}
    {:else if flight.kind === 'draw'}
      {@render portrait(flight.card)}
      {#if !flight.faceUp}
        <!-- Its back, over its face until it turns edge-on (motion.launch). -->
        <div class="side" data-side="back">
          <CardBack back={flight.card.back} />
        </div>
      {/if}
    {:else if flight.card && !isHidden(flight.card)}
      {@render portrait(flight.card)}
    {:else}
      <CardBack back={flight.card?.back ?? flight.back} />
    {/if}
  </div>
{/each}

<style>
  .fly {
    position: fixed;
    z-index: 2900;
    pointer-events: none;
    transform-origin: center;
    filter: drop-shadow(2px 2px 3px #000000a0) drop-shadow(7px 7px 10px #00000060);
  }

  .side {
    position: absolute;
    inset: 0;
  }
</style>
