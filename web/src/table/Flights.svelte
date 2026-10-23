<!--
  The copies of cards flying to and out of piles, above everything, the
  pointer passing through them: a card flying from where it was, from where
  the viewer let it go, or from the pile it left, to the pile it went to
  (spec 5.5: discards animate to the owner's pile), turning over on the way
  when it lands on another side: face up out of a face-down pile, face down
  into a deck; a card drawn flying from its pile to its slot in the viewer's
  hand; a card going into a hand the viewer does not see leaving its pile or
  its spot on the table; and a card coming out of such a hand rising into its
  pile.
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
    captionOf = () => undefined,
  }: {
    /** The catalog face a card shows, null while unknown or hidden. */
    faceOf: (card: TableCard | undefined) => PackFace | null;
    /** The caption of a card's back (backCaption): its side deck's label, if any. */
    captionOf?: (card: TableCard) => string | undefined;
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

<!-- A card as the table or the hand draws it: a landscape card lies landscape. -->
{#snippet placed(card: TableCard)}
  {@const face = faceOf(card)}
  <CardFace
    images={face?.images ?? []}
    name={face?.name ?? ''}
    landscape={face?.size === 'land' || face?.size === 'dland'}
  />
{/snippet}

<!--
  Its back, over its face until it turns edge-on, or, turning face down
  (hidden), from then on (motion.launch).
-->
{#snippet turningBack(card: TableCard, hidden = false)}
  <div class="side" data-side="back" style:opacity={hidden ? 0 : undefined}>
    <CardBack back={card.back} caption={captionOf(card)} />
  </div>
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
      {#if isHidden(flight.card)}
        <CardBack back={flight.card.back} caption={captionOf(flight.card)} />
      {:else}
        {@render (flight.asOnPile ? portrait : placed)(flight.card)}
        {#if flight.turns}
          {@render turningBack(flight.card, flight.turns === 'down')}
        {/if}
      {/if}
    {:else if flight.kind === 'draw'}
      {@render portrait(flight.card)}
      {#if !flight.faceUp}
        {@render turningBack(flight.card)}
      {/if}
    {:else if flight.card && !isHidden(flight.card)}
      <!-- Taken off the table, it shows as the table drew it. -->
      {@render (flight.kind === 'drawAway' && flight.pile === undefined ? placed : portrait)(
        flight.card,
      )}
    {:else}
      {@const caption = flight.card ? captionOf(flight.card) : flight.caption}
      <CardBack back={flight.card?.back ?? flight.back} {caption} />
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
